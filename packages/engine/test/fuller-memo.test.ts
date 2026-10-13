import test from 'node:test';
import assert from 'node:assert/strict';
import { split, parseUri, encodeShare, decodeShare } from '../src/index.ts';
const recipient = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const base = {
  recipient, network: 'test' as const, total: { amount: '100.00', fiat: 'USD' }, fiatDecimals: 2,
  participants: [{ id: 'a', label: 'Dragan' }, { id: 'b', label: 'Ana' }],
  rate: { fiat: 'USD', fiatPerZec: '100', source: 'Manual entry', observedAt: '2026-10-09T23:59:00Z' },
  createdAt: '2026-10-10T00:01:00Z',
  memoTemplate: 'Dinner, Friday · {label} · {share} · {date} · Ztab',
};
for (const [fiat, amount] of [['USD','$50.00'],['EUR','€50.00'],['GBP','50.00 GBP'],['CZK','50.00 CZK'],['PLN','50.00 PLN'],['CHF','50.00 CHF']]) {
  test(`full memo vector ${fiat}: share and creation date; same payment`, () => {
    const result = split({ ...base, total: { ...base.total, fiat }, rate: { ...base.rate, fiat } });
    assert.equal(result.kind, 'split'); if (result.kind !== 'split') return;
    const request = result.requests[0];
    assert.equal(request.memo, `Dinner, Friday · Dragan · ${amount} · 10 Oct 2026 · Ztab`);
    const back = parseUri(request.uri, 'test'); assert.equal(back.kind, 'request'); if (back.kind !== 'request') return;
    assert.equal(back.payments[0].address, recipient);
    assert.equal(back.payments[0].zatoshis, '50000000');
    assert.equal(Buffer.from(back.payments[0].memoBase64Url!, 'base64url').toString('utf8'), request.memo);
  });
}
test('substitution is one pass; a name containing tokens is literal', () => {
  const result = split({ ...base, participants: [{ id: 'a', label: '{share} · č' }, { id: 'b', label: 'Ana' }] });
  assert.equal(result.kind === 'split' && result.requests[0].memo, 'Dinner, Friday · {share} · č · $50.00 · 10 Oct 2026 · Ztab');
});
test('the byte cap is checked after expanding share, including multibyte text', () => {
  const exact = split({ ...base, memoTemplate: 'é'.repeat(253) + '{share}' });
  assert.equal(exact.kind, 'split');
  if (exact.kind === 'split') assert.equal(Buffer.byteLength(exact.requests[0].memo!), 512);
  const over = split({ ...base, memoTemplate: 'é'.repeat(253) + 'x{share}' });
  assert.deepEqual(over, { kind: 'error', error: { kind: 'memo-too-long', participantId: 'a', bytes: 513 } });
});
test('a date token requires a real supplied creation instant', () => {
  for (const createdAt of [undefined, '2026-02-31T00:00:00Z', 'nope']) {
    const result = split({ ...base, createdAt });
    assert.equal(result.kind === 'error' && result.error.kind, 'invalid-memo-date');
  }
});
test('new links retain creation date separately from rate time; malformed date refused', () => {
  const share = { network: 'test' as const, payee: recipient, label: 'Dinner', name: 'Dragan', from: 'Miro', fiatShare: '50.00', zatoshis: '50000000', rate: base.rate, createdAt: base.createdAt };
  const encoded = encodeShare(share); assert.equal(encoded.kind, 'fragment'); if (encoded.kind !== 'fragment') return;
  assert.match(encoded.fragment, /^s2\./);
  assert.deepEqual(decodeShare(encoded.fragment), { kind: 'share', share });
  for (const createdAt of ['nope', '2026-02-31T00:00:00Z']) assert.equal(encodeShare({ ...share, createdAt }).kind, 'error');
  const fields = JSON.parse(Buffer.from(encoded.fragment.slice(3), 'base64url').toString());
  fields[11] = 'nope';
  assert.equal(decodeShare('s2.' + Buffer.from(JSON.stringify(fields)).toString('base64url')).kind, 'error');
});
test('memo share uses each rounded fiat allocation, not an equal unrounded fraction', () => {
  const result = split({ ...base, total: { amount: '0.05', fiat: 'USD' }, participants: [{ id: 'a', label: 'Ana' }, { id: 'b', label: 'Ben' }, { id: 'c', label: 'Carla' }] });
  assert.equal(result.kind, 'split'); if (result.kind !== 'split') return;
  assert.deepEqual(result.requests.map(r => r.memo), [
    'Dinner, Friday · Ana · $0.02 · 10 Oct 2026 · Ztab',
    'Dinner, Friday · Ben · $0.02 · 10 Oct 2026 · Ztab',
    'Dinner, Friday · Carla · $0.01 · 10 Oct 2026 · Ztab',
  ]);
  assert.deepEqual(result.requests.map(r => r.zatoshis), ['20000', '20000', '10000']);
});
