import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { split } from '../src/split.ts';
import { parseUri } from '../src/zip321.ts';
import type { SplitInput } from '../src/types.ts';

const Z_TEST =
  'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const T_TEST = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';

const input = (over: Partial<SplitInput> = {}): SplitInput => ({
  recipient: Z_TEST,
  network: 'test',
  total: { amount: '98.00', fiat: 'USD' },
  fiatDecimals: 2,
  participants: ['Ana', 'Ben', 'Carla', 'Dev'].map((label, i) => ({ id: `p${i}`, label })),
  rate: { fiat: 'USD', fiatPerZec: '1327.32', source: 'Manual entry', observedAt: '2026-10-05T11:31:00.000Z' },
  ...over,
});

const people = (weights: number[]) =>
  weights.map((weight, i) => ({ id: `p${i}`, label: `P${i}`, weight }));

const minorToAmount = (minor: number): string =>
  `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

const errorOf = (i: SplitInput) => {
  const r = split(i);
  return r.kind === 'error' ? r.error : undefined;
};

// Independent mathematics: Jarvis's Fraction oracle (see the fixture's "source").
const oracle = JSON.parse(
  fs.readFileSync(new URL('./fixtures/split-oracle.json', import.meta.url), 'utf8'),
);

for (const [i, ex] of oracle.examples.entries()) {
  test(`specification example ${i + 1}: ${minorToAmount(ex.totalMinor)} at ${ex.rate}`, () => {
    const r = split(input({ total: { amount: minorToAmount(ex.totalMinor), fiat: 'USD' }, participants: people(ex.weights), rate: { ...input().rate, fiatPerZec: ex.rate } }));
    assert.equal(r.kind, 'split', JSON.stringify(r));
    if (r.kind !== 'split') return;
    assert.deepEqual(r.requests.map(q => q.zatoshis), ex.zatoshis.map(String));
    assert.deepEqual(r.requests.map(q => q.fiatShare), ex.fiatMinor.map(minorToAmount));
    assert.equal(r.totalZatoshis, String(ex.totalZatoshis));
    assert.deepEqual(r.rounding.fiatRemainderParticipantIds, ex.fiatWinnerIndices.map((n: number) => `p${n}`));
    assert.deepEqual(r.rounding.zatoshiRemainderParticipantIds, ex.zatoshiWinnerIndices.map((n: number) => `p${n}`));
  });
}

test(`agrees with the independent oracle on ${oracle.cases.length} generated bills`, () => {
  let splits = 0;
  let zero = 0;
  for (const c of oracle.cases) {
    const r = split(input({ total: { amount: minorToAmount(c.totalMinor), fiat: 'USD' }, participants: people(c.weights), rate: { ...input().rate, fiatPerZec: c.rate } }));
    const where = JSON.stringify({ total: c.totalMinor, weights: c.weights, rate: c.rate });
    if (c.mathematicalErrors.length === 0) {
      assert.equal(r.kind, 'split', where);
      if (r.kind !== 'split') continue;
      assert.deepEqual(r.requests.map(q => q.zatoshis), c.zatoshis.map(String), where);
      assert.deepEqual(r.requests.map(q => q.fiatShare), c.fiatMinor.map(minorToAmount), where);
      assert.equal(r.totalZatoshis, String(c.totalZatoshis), where);
      assert.deepEqual(r.rounding.zatoshiRemainderParticipantIds, c.zatoshiWinnerIndices.map((n: number) => `p${n}`), where);
      assert.deepEqual(r.rounding.fiatRemainderParticipantIds, c.fiatWinnerIndices.map((n: number) => `p${n}`), where);
      splits++;
    } else {
      assert.equal(r.kind, 'error', where);
      if (r.kind !== 'error') continue;
      const first = c.fiatMinor.findIndex((f: number, k: number) => f === 0 || c.zatoshis[k] === 0);
      assert.deepEqual(r.error, { kind: 'zero-share', participantId: `p${first}` }, where);
      zero++;
    }
  }
  assert.ok(splits > 100 && zero > 100, `${splits} splits, ${zero} zero-share`);
});

test('the shares add up, in cents and in zatoshis, and every request reads back', () => {
  const r = split(input({ memoTemplate: 'Dinner · {label}' }));
  assert.equal(r.kind, 'split');
  if (r.kind !== 'split') return;
  assert.equal(r.requests.reduce((a, q) => a + BigInt(q.zatoshis), 0n).toString(), r.totalZatoshis);
  assert.equal(r.requests.reduce((a, q) => a + Number(q.fiatShare.replace('.', '')), 0), 9800);
  assert.equal(r.recipientKind, 'sapling');
  assert.equal(r.rounding.rule, 'largest-remainder-total-ceil-v1');
  for (const [i, q] of r.requests.entries()) {
    const back = parseUri(q.uri, 'test');
    assert.equal(back.kind, 'request');
    if (back.kind !== 'request') return;
    assert.equal(back.payments[0].zatoshis, q.zatoshis);
    assert.equal(q.memo, `Dinner · ${['Ana', 'Ben', 'Carla', 'Dev'][i]}`);
    assert.equal(Buffer.from(back.payments[0].memoBase64Url!, 'base64url').toString('utf8'), q.memo);
  }
});

test('ties go to the earlier person, and exact division has no remainder holders', () => {
  const tie = split(input({ total: { amount: '0.05', fiat: 'USD' }, participants: people([1, 1, 1]), rate: { ...input().rate, fiatPerZec: '2' } }));
  assert.deepEqual(tie.kind === 'split' && tie.rounding.fiatRemainderParticipantIds, ['p0', 'p1']);
  const exact = split(input({ total: { amount: '4.00', fiat: 'USD' }, participants: people([1, 1]), rate: { ...input().rate, fiatPerZec: '2' } }));
  assert.deepEqual(exact.kind === 'split' && exact.rounding, { fiatRemainderParticipantIds: [], zatoshiRemainderParticipantIds: [], rule: 'largest-remainder-total-ceil-v1' });
});

test('a rate with trailing zeros gives the same split and comes back normalised', () => {
  const a = split(input());
  const b = split(input({ rate: { ...input().rate, fiatPerZec: '1327.320000' } }));
  assert.equal(a.kind, 'split');
  assert.equal(b.kind, 'split');
  if (a.kind !== 'split' || b.kind !== 'split') return;
  assert.deepEqual(b.requests, a.requests);
  assert.equal(b.rate.fiatPerZec, '1327.32');
  const whole = split(input({ rate: { ...input().rate, fiatPerZec: '1327.00' } }));
  assert.equal(whole.kind === 'split' && whole.rate.fiatPerZec, '1327');
});

test('custom amounts passed as cents come back unchanged', () => {
  const r = split(input({ total: { amount: '98.00', fiat: 'USD' }, participants: people([4900, 2450, 1225, 1225]) }));
  assert.deepEqual(r.kind === 'split' && r.requests.map(q => q.fiatShare), ['49.00', '24.50', '12.25', '12.25']);
});

test('malformed totals and rates are refused, never rounded', () => {
  for (const amount of ['98,00', '98.001', '0', '0.00', '-5', '1e3', ' 98', '098', '.5', '10000000000.01']) {
    assert.equal(errorOf(input({ total: { amount, fiat: 'USD' } }))?.kind, 'invalid-amount', amount);
  }
  assert.equal(errorOf(input({ total: { amount: '10000000000.00', fiat: 'USD' }, rate: { ...input().rate, fiatPerZec: '100000' } })), undefined);
  for (const fiatPerZec of ['0', '0.000', '1,327.32', '1e3', '-1', '', '1'.repeat(33)]) {
    assert.equal(errorOf(input({ rate: { ...input().rate, fiatPerZec } }))?.kind, 'invalid-rate', fiatPerZec);
  }
  assert.equal(errorOf(input({ total: { amount: '98.00', fiat: 'JPY' } }))?.kind, 'invalid-amount');
  assert.equal(errorOf(input({ fiatDecimals: 0 }))?.kind, 'invalid-amount');
  assert.equal(errorOf(input({ rate: { ...input().rate, fiat: 'EUR' } }))?.kind, 'invalid-rate');
  assert.equal(errorOf(input({ rate: { ...input().rate, source: '' } }))?.kind, 'invalid-rate');
  assert.equal(errorOf(input({ rate: { ...input().rate, observedAt: '2026-02-31T12:00:00.000Z' } }))?.kind, 'invalid-rate');
});

test('people: none, too many, duplicate ids and bad weights', () => {
  assert.deepEqual(errorOf(input({ participants: [] })), { kind: 'no-participants' });
  assert.equal(errorOf(input({ total: { amount: '5000.00', fiat: 'USD' }, participants: people(Array(51).fill(1)) }))?.kind, 'invalid-participants');
  assert.equal(errorOf(input({ total: { amount: '5000.00', fiat: 'USD' }, participants: people(Array(50).fill(1)) })), undefined);
  assert.equal(errorOf(input({ participants: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }))?.kind, 'invalid-participants');
  assert.equal(errorOf(input({ participants: [{ id: '', label: 'A' }] }))?.kind, 'invalid-participants');
  assert.equal(errorOf(input({ participants: [{ id: 'a', label: 'x'.repeat(41) }] }))?.kind, 'invalid-participants');
  for (const weight of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(errorOf(input({ participants: [{ id: 'a', label: 'A', weight }] })), { kind: 'invalid-weight', participantId: 'a' }, String(weight));
  }
});

test('nobody is asked for nothing: zero shares at the cent and at the zatoshi stage', () => {
  assert.deepEqual(errorOf(input({ total: { amount: '0.01', fiat: 'USD' }, participants: people([1, 1]) })), { kind: 'zero-share', participantId: 'p1' });
  // Two cents at 10,000,000 USD per ZEC is 0.2 zatoshi: the total rounds up to
  // one zatoshi, the first person gets it, and the second would get nothing.
  assert.deepEqual(
    errorOf(input({ total: { amount: '0.02', fiat: 'USD' }, participants: people([1, 1]), rate: { ...input().rate, fiatPerZec: '10000000' } })),
    { kind: 'zero-share', participantId: 'p1' },
  );
  const one = split(input({ total: { amount: '0.01', fiat: 'USD' }, participants: people([1]), rate: { ...input().rate, fiatPerZec: '10000000' } }));
  assert.equal(one.kind === 'split' && one.totalZatoshis, '1');
});

test('the whole supply is allowed and one zatoshi more is not', () => {
  // 21,000,000 ZEC at 100 USD per ZEC is 2,100,000,000 USD.
  const at = split(input({ total: { amount: '2100000000.00', fiat: 'USD' }, participants: people([1]), rate: { ...input().rate, fiatPerZec: '100' } }));
  assert.equal(at.kind === 'split' && at.totalZatoshis, '2100000000000000');
  assert.deepEqual(
    errorOf(input({ total: { amount: '2100000000.01', fiat: 'USD' }, participants: people([1]), rate: { ...input().rate, fiatPerZec: '100' } })),
    { kind: 'amount-exceeds-supply' },
  );
});

test('payee: a bad address, the wrong network, and memos', () => {
  assert.equal(errorOf(input({ recipient: 'nope' }))?.kind, 'invalid-recipient');
  assert.equal(errorOf(input({ network: 'main' }))?.kind, 'invalid-recipient');
  assert.equal(errorOf(input({ recipient: T_TEST, memoTemplate: 'x' }))?.kind, 'memo-not-allowed');
  const transparent = split(input({ recipient: T_TEST }));
  assert.equal(transparent.kind === 'split' && transparent.recipientKind, 'transparent');
  assert.equal(transparent.kind === 'split' && transparent.requests.every(q => q.memo === undefined), true);
  assert.deepEqual(errorOf(input({ memoTemplate: 'é'.repeat(257) })), { kind: 'memo-too-long', participantId: 'p0', bytes: 514 });
  assert.equal(errorOf(input({ memoTemplate: 'é'.repeat(256) })), undefined);
});

for (const fiat of ['USD', 'EUR', 'GBP', 'CZK', 'PLN', 'CHF']) {
  test(`${fiat}: shares preserve minor units and ZIP-321 amounts`, () => {
    const result = split(input({
      total: { amount: '1.00', fiat }, participants: people([1, 1, 1]),
      rate: { ...input().rate, fiat, fiatPerZec: '100' },
    }));
    assert.equal(result.kind, 'split');
    if (result.kind !== 'split') return;
    assert.equal(result.rate.fiat, fiat);
    assert.deepEqual(result.requests.map(r => [r.fiatShare, r.zatoshis]), [
      ['0.34', '340000'], ['0.33', '330000'], ['0.33', '330000'],
    ]);
    for (const r of result.requests) {
      const parsed = parseUri(r.uri, 'test');
      assert.equal(parsed.kind, 'request');
      if (parsed.kind === 'request') assert.equal(parsed.payments[0].zatoshis, r.zatoshis);
    }
  });
}
