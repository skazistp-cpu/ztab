// Finds payments for a viewing key in recent blocks. fetch and WebAssembly only: no storage, no other request.
// The key is handed to the WebAssembly module on this device and to nothing else. The module has no imports,
// so it cannot reach the network or storage. The server is asked for the chain tip, for ranges of compact
// blocks, and for each transaction that held a note for the key.
import type { FoundNote } from './match.ts';

const SERVICE = '/cash.z.wallet.sdk.rpc.CompactTxStreamer/';
const ACTION = 148;
/** Compact blocks are asked for in ranges of this many. */
export const RANGE = 500;
/** A request that has not answered in this time is given up. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** No answer may be larger than this. A range of 500 busy blocks is well under a megabyte. */
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
/** At most this many transactions are opened for one look. */
export const MAX_TRANSACTIONS = 200;

type Fields = Record<number, (bigint | Uint8Array)[]>;

const varint = (value: number | bigint): number[] => {
  const out: number[] = [];
  let n = BigInt(value);
  while (n >= 0x80n) { out.push(Number(n & 0x7fn) | 0x80); n >>= 7n; }
  out.push(Number(n));
  return out;
};
const numberField = (field: number, value: number): number[] => [...varint(field << 3), ...varint(value)];
const bytesField = (field: number, bytes: ArrayLike<number>): number[] => [...varint((field << 3) | 2), ...varint(bytes.length), ...Array.from(bytes)];

/** Reads one protobuf message into its fields. Throws on anything it does not expect from this server. */
export function fields(buf: Uint8Array): Fields {
  const out: Fields = {};
  let i = 0;
  const readVarint = (): bigint => {
    let shift = 0n, result = 0n;
    for (;;) {
      if (i >= buf.length || shift > 63n) throw new Error('unexpected server data');
      const byte = buf[i++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
    }
  };
  while (i < buf.length) {
    const key = Number(readVarint()), field = key >> 3, wire = key & 7;
    let value: bigint | Uint8Array;
    if (wire === 0) value = readVarint();
    else if (wire === 2) { const length = Number(readVarint()); if (i + length > buf.length) throw new Error('unexpected server data'); value = buf.subarray(i, i + length); i += length; }
    else if (wire === 5) { value = buf.subarray(i, i + 4); i += 4; }
    else if (wire === 1) { value = buf.subarray(i, i + 8); i += 8; }
    else throw new Error('unexpected server data');
    (out[field] ??= []).push(value);
  }
  return out;
}

const bytesOf = (f: Fields, field: number): Uint8Array[] => (f[field] ?? []).filter((v): v is Uint8Array => v instanceof Uint8Array);
const numberOf = (f: Fields, field: number): number => { const v = f[field]?.[0]; return typeof v === 'bigint' ? Number(v) : 0; };
const join = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const hex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

type Module = { memory: WebAssembly.Memory; ztab_alloc(n: number): number; ztab_free(p: number, n: number): void; ztab_scan_compact(...a: number[]): number; ztab_read_note(...a: number[]): number };

export type Progress = { blocks: number; of: number };
/** `oldest` is the time of the earliest block looked at, in Unix seconds. */
export type DemoExample = { height: number; txid: string };
export type Found = { example?: FoundNote[]; notes: FoundNote[]; blocks: number; from: number; to: number; reachedStart: boolean; oldest: number };

export type Finder = {
  /**
   * Looks from the chain tip back to the first block at or before `sinceUnix`, at most `maxBlocks` blocks.
   * Rejects with 'server' when the server's answer is late, too large, incomplete or malformed, and with
   * 'stopped' when `signal` is aborted. It never returns a partial look as if it were a whole one.
   * Demo-only `example` adds exactly one historical block, returned separately and excluded from
   * recent matches. At most maxBlocks + 1 heights and 200 transaction reads across both windows.
   */
  find(key: string, sinceUnix: number, maxBlocks: number, progress?: (p: Progress) => void, signal?: AbortSignal, example?: DemoExample): Promise<Found>;
};

export async function finder(server: string, wasm: BufferSource, fetcher: typeof fetch = fetch, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Finder> {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const x = instance.exports as unknown as Module;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const put = (bytes: Uint8Array): [number, number] => { const p = x.ztab_alloc(bytes.length); new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes); return [p, bytes.length]; };
  const take = (p: number): Record<string, unknown> => {
    const length = new DataView(x.memory.buffer).getUint32(p, true);
    const text = decoder.decode(new Uint8Array(x.memory.buffer, p + 4, length));
    x.ztab_free(p, length + 4);
    return JSON.parse(text) as Record<string, unknown>;
  };
  const run = (fn: (...a: number[]) => number, parts: (Uint8Array | string)[], flag: boolean): Record<string, unknown> => {
    const placed = parts.map(part => put(typeof part === 'string' ? encoder.encode(part) : part));
    const result = take(fn(...placed.flat(), flag ? 1 : 0));
    for (const [p, n] of placed) {
      // The key is among these buffers: overwrite before giving the memory back.
      new Uint8Array(x.memory.buffer, p, n).fill(0);
      x.ztab_free(p, n);
    }
    if (typeof result.error === 'string') throw new Error(result.error);
    return result;
  };

  const stopped = (signal?: AbortSignal): void => { if (signal?.aborted) throw new Error('stopped'); };

  /** Reads an answer up to the size limit; a longer one is refused without being kept. */
  async function body(response: Response): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) { const all = new Uint8Array(await response.arrayBuffer()); if (all.length > MAX_RESPONSE_BYTES) throw new Error('server'); return all; }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('server'); }
      chunks.push(value);
    }
    return join(chunks);
  }

  async function call(method: string, message: number[], signal?: AbortSignal): Promise<Uint8Array[]> {
    stopped(signal);
    const request = new Uint8Array(5 + message.length);
    new DataView(request.buffer).setUint32(1, message.length);
    request.set(message, 5);
    const control = new AbortController();
    const stop = (): void => control.abort();
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, timeoutMs);
    try {
      const response = await fetcher(server + SERVICE + method, {
        method: 'POST',
        headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1' },
        body: request,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: control.signal,
      });
      const bytes = await body(response);
      const frames: Uint8Array[] = [];
      let at = 0, trailer = '';
      while (at + 5 <= bytes.length) {
        const flag = bytes[at], length = new DataView(bytes.buffer, bytes.byteOffset + at + 1, 4).getUint32(0);
        if (at + 5 + length > bytes.length) throw new Error('server');
        const payload = bytes.subarray(at + 5, at + 5 + length);
        at += 5 + length;
        if (flag & 0x80) trailer = decoder.decode(payload); else frames.push(payload);
      }
      if (at !== bytes.length || !response.ok || !/grpc-status: ?0/.test(trailer)) throw new Error('server');
      return frames;
    } catch (error) {
      stopped(signal);
      // A timeout, a network failure and a malformed answer are all the same to the organiser: nothing was checked.
      throw new Error('server', { cause: error });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
  }

  return {
    async find(key, sinceUnix, maxBlocks, progress = () => {}, signal, example) {
      // Read the key first: a text that is not a viewing key must fail before the server is asked anything.
      run(x.ztab_scan_compact, [key, new Uint8Array()], false);
      const tip = numberOf(fields((await call('GetLightdInfo', [], signal))[0] ?? new Uint8Array()), 7);
      if (!Number.isSafeInteger(tip) || tip < 1 || tip > 0x7fffffff) throw new Error('server');
      if (example && (!Number.isSafeInteger(example.height) || example.height < 1 || example.height > tip || !/^[a-f0-9]{64}$/.test(example.txid))) throw new Error('server');
      const hits: { txid: Uint8Array; action: Uint8Array; ironwood: boolean; historical: boolean }[] = [];
      // The budget counts the heights asked for, never what the server chose to send back.
      const budget = Math.max(0, Math.floor(maxBlocks));
      let blocks = 0, from = tip + 1, reachedStart = false, oldest = Infinity;
      // Demo only: one fixed historical block, then the unchanged recent window. Both share the
      // transaction limit and abort signal. A historical hit never enters recent-payment matches.
      const windows = example ? [example.height, undefined] : [undefined];
      for (const historicalHeight of windows) {
        const historical = historicalHeight !== undefined;
        const windowBudget = historical ? 1 : budget;
        let next = historicalHeight ?? tip, count = 0, done = false;
        while (!done && count < windowBudget && next >= 1) {
          const to = next;
          from = Math.max(1, to - Math.min(RANGE, windowBudget - count) + 1);
          const frames = await call('GetBlockRange', [...bytesField(1, numberField(1, from)), ...bytesField(2, numberField(1, to))], signal);
          // Every block of the range, once, in order, each with a time: anything else is not a look we can report.
          if (frames.length !== to - from + 1) throw new Error('server');
          frames.forEach((frame, i) => {
            const block = fields(frame), time = numberOf(block, 5);
            if (numberOf(block, 2) !== from + i || time < 1) throw new Error('server');
            if (!historical) {
              if (time <= sinceUnix) done = reachedStart = true;
              if (time < oldest) oldest = time;
            }
            for (const each of bytesOf(block, 7)) {
              const tx = fields(each), txid = bytesOf(tx, 2)[0];
              if (!txid || txid.length !== 32) throw new Error('server');
              const isExample = example?.txid === hex(Uint8Array.from(txid).reverse());
              if (historical ? !isExample : isExample) continue;
              // Field 6 is Orchard, field 9 the NU7 pool with Orchard-shaped actions.
              for (const [field, ironwood] of [[6, false], [9, true]] as const) {
                const actions = bytesOf(tx, field).map(raw => { const a = fields(raw); return join([1, 2, 3, 4].map(n => bytesOf(a, n)[0] ?? new Uint8Array())); }).filter(a => a.length === ACTION);
                if (!actions.length) continue;
                const found = run(x.ztab_scan_compact, [key, join(actions)], ironwood).hits as [number, string][];
                for (const [index] of found) hits.push({ txid, action: actions[index], ironwood, historical });
              }
            }
          });
          count += frames.length;
          if (!historical) blocks = count;
          next = from - 1;
          stopped(signal);
          progress({ blocks: historical ? count : count + (example ? 1 : 0), of: budget + (example ? 1 : 0) });
        }
      }
      if (!blocks || hits.length > MAX_TRANSACTIONS) throw new Error('server');
      const notes: FoundNote[] = [], exampleNotes: FoundNote[] = [];
      for (const hit of hits) {
        const raw = bytesOf(fields((await call('GetTransaction', bytesField(3, hit.txid), signal))[0] ?? new Uint8Array()), 1)[0];
        if (!raw) throw new Error('server');
        const note = run(x.ztab_read_note, [key, raw, hit.action], hit.ironwood);
        if (typeof note.zatoshis !== 'string') continue;
        (hit.historical ? exampleNotes : notes).push({ txid: hex(Uint8Array.from(hit.txid).reverse()), zatoshis: note.zatoshis, memo: typeof note.memo === 'string' ? note.memo : null });
      }
      stopped(signal);
      return { notes, blocks, from, to: tip, reachedStart, oldest, ...(example ? { example: exampleNotes } : {}) };
    },
  };
}
