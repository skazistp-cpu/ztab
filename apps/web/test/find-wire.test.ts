// The finder against a stand-in server, with the real WebAssembly module and a made-up key that holds nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fields, finder } from '../src/find/wire.ts';

const vector = JSON.parse(readFileSync(new URL('./fixtures/finder-vector.json', import.meta.url), 'utf8')) as {
  key: string; otherKey: string; memo: string; zatoshis: string;
  orchard: { action: string; decoy: string; transaction: string }; ironwood: { action: string; decoy: string; transaction: string };
};
const wasm = readFileSync(new URL('../src/find/ztab_scan.wasm', import.meta.url));
const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16));
const varint = (value: number): number[] => { const out: number[] = []; let n = BigInt(value); while (n >= 0x80n) { out.push(Number(n & 0x7fn) | 0x80); n >>= 7n; } out.push(Number(n)); return out; };
const num = (field: number, value: number): number[] => [...varint(field << 3), ...varint(value)];
const bytes = (field: number, value: ArrayLike<number>): number[] => [...varint((field << 3) | 2), ...varint(value.length), ...Array.from(value)];
const action = (hexed: string): number[] => { const a = unhex(hexed); return [...bytes(1, a.subarray(0, 32)), ...bytes(2, a.subarray(32, 64)), ...bytes(3, a.subarray(64, 96)), ...bytes(4, a.subarray(96))]; };
const frame = (message: number[], flag = 0): number[] => [flag, (message.length >>> 24) & 255, (message.length >>> 16) & 255, (message.length >>> 8) & 255, message.length & 255, ...message];
const OK = frame(Array.from(new TextEncoder().encode('grpc-status: 0\r\n')), 0x80);

const TIP = 1000;
const txid = (n: number): Uint8Array => new Uint8Array(32).fill(n);
/** Block 990 holds the Ironwood payment, block 300 the Orchard one; every block is 75 seconds after the one before. */
const timeOf = (height: number): number => 1_800_000_000 - (TIP - height) * 75;
function block(height: number): number[] {
  const txs: number[][] = [bytes(2, txid(1)).concat(bytes(9, action(vector.ironwood.decoy)))];
  if (height === 990) txs.push([...num(1, 1), ...bytes(2, txid(9)), ...bytes(9, action(vector.ironwood.decoy)), ...bytes(9, action(vector.ironwood.action))]);
  if (height === 300) txs.push([...num(1, 1), ...bytes(2, txid(6)), ...bytes(6, action(vector.orchard.action))]);
  return [...num(2, height), ...num(5, timeOf(height)), ...txs.flatMap(tx => bytes(7, tx))];
}
function server(log: string[], fail?: string): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = String(url).split('/').pop() ?? '';
    const body = new Uint8Array(init?.body as ArrayBuffer).subarray(5);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    assert.equal(Buffer.from(body).includes(Buffer.from(vector.key.slice(0, 16))), false, 'the key is in no request');
    let out: number[] = [];
    if (method === 'GetLightdInfo') { log.push('tip'); out = frame(num(7, TIP)); }
    else if (method === 'GetBlockRange') {
      const range = fields(body), from = Number(fields(range[1][0] as Uint8Array)[1][0]), to = Number(fields(range[2][0] as Uint8Array)[1][0]);
      log.push(`blocks ${from}-${to}`);
      for (let height = from; height <= to; height++) out.push(...frame(block(height)));
    } else if (method === 'GetTransaction') {
      const id = (fields(body)[3][0] as Uint8Array)[0];
      log.push(`tx ${id}`);
      out = frame(bytes(1, unhex(id === 9 ? vector.ironwood.transaction : vector.orchard.transaction)));
    }
    const status = method === fail ? frame(Array.from(new TextEncoder().encode('grpc-status: 5\r\n')), 0x80) : OK;
    return new Response(Uint8Array.from([...(method === fail ? [] : out), ...status]), { status: 200 });
  }) as typeof fetch;
}

test('finds the payment, reads amount and note, and asks only for what it needs', async () => {
  const log: string[] = [];
  const f = await finder('https://server.example', wasm, server(log));
  const found = await f.find(vector.key, timeOf(980), 3000);
  assert.deepEqual(found.notes, [{ txid: '09'.repeat(32), zatoshis: vector.zatoshis, memo: vector.memo }]);
  assert.deepEqual(log, ['tip', 'blocks 501-1000', 'tx 9']);
  assert.equal(found.reachedStart, true);
  assert.deepEqual([found.from, found.to, found.blocks], [501, 1000, 500]);
  assert.equal(found.oldest, timeOf(501), 'the time of the earliest block looked at');
});

test('another key finds nothing and opens no transaction', async () => {
  const log: string[] = [];
  const found = await (await finder('https://server.example', wasm, server(log))).find(vector.otherKey, timeOf(980), 3000);
  assert.deepEqual(found.notes, []);
  assert.deepEqual(log, ['tip', 'blocks 501-1000']);
});

test('looks further back when the tab is older, in both pools, and stops at the limit', async () => {
  const log: string[] = [];
  const f = await finder('https://server.example', wasm, server(log));
  const found = await f.find(vector.key, timeOf(250), 3000);
  assert.deepEqual(found.notes.map(n => n.txid.slice(0, 2)).sort(), ['06', '09']);
  assert.deepEqual(log, ['tip', 'blocks 501-1000', 'blocks 1-500', 'tx 9', 'tx 6']);
  const capped = await f.find(vector.key, 0, 120);
  assert.deepEqual([capped.blocks, capped.from, capped.reachedStart], [120, 881, false]);
  assert.deepEqual(capped.notes.map(n => n.txid.slice(0, 2)), ['09']);
});

test('a key that is not a viewing key, and a server that fails, are errors and not empty results', async () => {
  const log: string[] = [];
  const f = await finder('https://server.example', wasm, server(log));
  await assert.rejects(f.find('not a key', timeOf(980), 3000), /viewing key/);
  assert.deepEqual(log, [], 'a text that is not a key reaches no server');
  for (const method of ['GetLightdInfo', 'GetBlockRange', 'GetTransaction']) {
    await assert.rejects((await finder('https://server.example', wasm, server([], method))).find(vector.key, timeOf(980), 3000), /server/);
  }
});

test('the module has no imports: it cannot reach the network or storage', () => {
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)), []);
});

// ---- A server that answers "success" with wrong, missing or endless data must never look like "nothing found" ----
type Tamper = { range?: (from: number, to: number) => number[]; delay?: (method: string) => Promise<void> };
function odd(log: string[], tamper: Tamper): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = String(url).split('/').pop() ?? '';
    const body = new Uint8Array(init?.body as ArrayBuffer).subarray(5);
    await Promise.race([tamper.delay?.(method), new Promise<void>((_, no) => init?.signal?.addEventListener('abort', () => no(new DOMException('aborted', 'AbortError'))))]);
    let out: number[] = [];
    if (method === 'GetLightdInfo') { log.push('tip'); out = frame(num(7, TIP)); }
    else if (method === 'GetBlockRange') {
      const range = fields(body), from = Number(fields(range[1][0] as Uint8Array)[1][0]), to = Number(fields(range[2][0] as Uint8Array)[1][0]);
      log.push(`blocks ${from}-${to}`);
      out = tamper.range ? tamper.range(from, to) : Array.from({ length: to - from + 1 }, (_, i) => frame(block(from + i))).flat();
    }
    return new Response(Uint8Array.from([...out, ...OK]), { status: 200 });
  }) as typeof fetch;
}
const all = (from: number, to: number, each: (height: number) => number[]): number[] => Array.from({ length: to - from + 1 }, (_, i) => frame(each(from + i))).flat();

test('empty successful ranges are refused after one request, not walked back to the first block', async () => {
  const log: string[] = [];
  const f = await finder('https://server.example', wasm, odd(log, { range: () => [] }));
  await assert.rejects(f.find(vector.key, 0, 500), /^Error: server$/);
  assert.deepEqual(log, ['tip', 'blocks 501-1000'], 'one range inside the budget, then stop');
});

test('the budget counts the heights asked for: a look never asks beyond it', async () => {
  for (const [budget, ranges] of [[500, ['blocks 501-1000']], [120, ['blocks 881-1000']], [700, ['blocks 501-1000', 'blocks 301-500']], [5000, ['blocks 501-1000', 'blocks 1-500']]] as const) {
    const log: string[] = [];
    const found = await (await finder('https://server.example', wasm, odd(log, {}))).find(vector.otherKey, 0, budget);
    assert.deepEqual(log.slice(1), ranges, `budget ${budget}`);
    assert.equal(found.blocks, Math.min(budget, 1000));
    assert.equal(found.oldest, timeOf(found.from));
  }
});

test('short, repeated, misnumbered, disordered and undated ranges are all refused', async () => {
  const cases: Record<string, (from: number, to: number) => number[]> = {
    'one block short': (from, to) => all(from, to - 1, block),
    'one block too many': (from, to) => all(from, to + 1, block),
    'the same block throughout': (from, to) => all(from, to, () => block(from)),
    'another range': (from, to) => all(from - 500, to - 500, block),
    'newest first': (from, to) => all(from, to, h => block(to - (h - from))),
    'a block without a time': (from, to) => all(from, to, h => (h === from + 3 ? num(2, h) : block(h))),
    'a frame cut short': (from, to) => all(from, to, block).slice(0, -3),
    'bytes that are not a block': (from, to) => all(from, to, () => [0xff, 0xff, 0xff]),
  };
  for (const [name, range] of Object.entries(cases)) {
    const log: string[] = [];
    await assert.rejects((await finder('https://server.example', wasm, odd(log, { range }))).find(vector.key, 0, 500), /server/, name);
    assert.equal(log.length, 2, `${name}: no further request`);
  }
});

test('an answer larger than the limit is refused', async () => {
  const huge = new Uint8Array(16 * 1024 * 1024 + 1);
  const fetcher = (async (url: RequestInfo | URL) => String(url).endsWith('GetLightdInfo')
    ? new Response(Uint8Array.from([...frame(num(7, TIP)), ...OK]))
    : new Response(new ReadableStream({ start(c) { c.enqueue(huge); c.close(); } }))) as typeof fetch;
  await assert.rejects((await finder('https://server.example', wasm, fetcher)).find(vector.key, 0, 500), /server/);
});

test('a server that does not answer is given up after the timeout', async () => {
  const log: string[] = [];
  const f = await finder('https://server.example', wasm, odd(log, { delay: method => (method === 'GetBlockRange' ? new Promise(() => {}) : Promise.resolve()) }), 40);
  const started = Date.now();
  await assert.rejects(f.find(vector.key, 0, 500), /^Error: server$/);
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual(log, ['tip']);
});

test('stopping a look ends it at once with "stopped" and makes no further request', async () => {
  for (const waitOn of ['GetLightdInfo', 'GetBlockRange']) {
    const log: string[] = [];
    const control = new AbortController();
    const f = await finder('https://server.example', wasm, odd(log, { delay: method => (method === waitOn ? new Promise(() => {}) : Promise.resolve()) }));
    const look = f.find(vector.key, 0, 5000, undefined, control.signal);
    setTimeout(() => control.abort(), 20);
    await assert.rejects(look, /^Error: stopped$/, waitOn);
    assert.deepEqual(log, waitOn === 'GetLightdInfo' ? [] : ['tip']);
  }
  const gone = new AbortController(); gone.abort();
  const log: string[] = [];
  await assert.rejects((await finder('https://server.example', wasm, odd(log, {}))).find(vector.key, 0, 500, undefined, gone.signal), /stopped/);
  assert.deepEqual(log, []);
});

test('a chain tip that is missing or absurd is refused', async () => {
  for (const tip of [0, 2 ** 31, 2 ** 40]) {
    const fetcher = (async () => new Response(Uint8Array.from([...frame(tip ? num(7, tip) : []), ...OK]))) as typeof fetch;
    await assert.rejects((await finder('https://server.example', wasm, fetcher)).find(vector.key, 0, 500), /server/, String(tip));
  }
});

test('demo finds a historical example outside the recent window, without losing recent payments', async () => {
  const log: string[] = [];
  const f = await finder('https://server.example', wasm, server(log));
  const found = await f.find(vector.key, timeOf(980), 120, undefined, undefined, { height: 300, txid: '06'.repeat(32) });
  assert.deepEqual(found.example, [{ txid: '06'.repeat(32), zatoshis: vector.zatoshis, memo: vector.memo }]);
  assert.deepEqual(found.notes.map(n => n.txid), ['09'.repeat(32)]);
  assert.deepEqual(log, ['tip', 'blocks 300-300', 'blocks 881-1000', 'tx 6', 'tx 9']);
  assert.deepEqual([found.from, found.to, found.blocks], [881, 1000, 120], 'recent scope excludes the historical block');
});

test('demo historical window stays one block and validates height before any range', async () => {
  for (const height of [0, -1, 1001, NaN, 3.5]) {
    const log: string[] = [];
    await assert.rejects((await finder('https://server.example', wasm, server(log))).find(vector.key, 0, 120, undefined, undefined, {height, txid:'06'.repeat(32)}), /server/);
    assert.deepEqual(log, ['tip']);
  }
  for (const budget of [120, 500, 700]) {
    const log: string[] = [];
    const found = await (await finder('https://server.example', wasm, server(log))).find(vector.key, 0, budget, undefined, undefined, {height:300,txid:'06'.repeat(32)});
    assert.equal(found.blocks,budget);
    const asked=log.filter(s=>s.startsWith('blocks ')).reduce((n,s)=>{const [a,b]=s.slice(7).split('-').map(Number);return n+b-a+1;},0);
    assert.equal(asked,budget+1,'combined block budget: recent budget plus exactly one historical block');
    assert.ok(!found.notes.some(n=>n.txid==='06'.repeat(32)),'example is never counted as a visitor payment');
  }
});

test('demo refuses an empty historical range and stops before the recent scan', async () => {
  const log: string[]=[];
  await assert.rejects((await finder('https://server.example',wasm,odd(log,{range:()=>[]}))).find(vector.key,0,120,undefined,undefined,{height:300,txid:'06'.repeat(32)}),/server/);
  assert.deepEqual(log,['tip','blocks 300-300']);
});

test('historical and recent windows share the 200-transaction bound', async () => {
  const log: string[]=[];
  const crowded=odd(log,{range:(from,to)=>all(from,to,h=>h!==990?block(h):[
    ...num(2,h),...num(5,timeOf(h)),...bytes(7,[...bytes(2,txid(9)),...Array.from({length:200},()=>bytes(9,action(vector.ironwood.action))).flat()])])});
  await assert.rejects((await finder('https://server.example',wasm,crowded)).find(vector.key,timeOf(980),120,undefined,undefined,{height:300,txid:'06'.repeat(32)}),/server/);
  assert.deepEqual(log,['tip','blocks 300-300','blocks 881-1000'],'no transaction opened after the combined budget is exceeded');
});
