import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTab } from '../src/tab.ts';
import { requestFor } from '../src/pay.ts';
import { decodeShare, parseUri } from '../../../packages/engine/src/index.ts';
const form = {
  from: 'Miro', label: 'Dinner, Friday',
  payee: 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez',
  fiat: 'USD', total: '100.00', ownShare: '', people: [{ name: 'Dragan', amount: '' }],
  rate: { fiatPerZec: '100', source: 'Manual entry', observedAt: '2026-10-09T23:59:00Z' },
  createdAt: '2026-10-10T00:01:00Z',
};
for (const [label, purpose] of [['Dinner, Friday','Dinner, Friday'],['','Bill'],['{share} and {date}','{share} and {date}']]) {
  test(`full memo survives share and pay: purpose ${JSON.stringify(label)}`, () => {
    const tab = makeTab({ ...form, label }); assert.equal(tab.kind, 'tab'); if (tab.kind !== 'tab') return;
    const decoded = decodeShare(tab.rows[0].fragment); assert.equal(decoded.kind, 'share'); if (decoded.kind !== 'share') return;
    const request = requestFor(decoded.share); assert.equal(request.kind, 'request'); if (request.kind !== 'request') return;
    assert.equal(request.memo, `${purpose} · Dragan · $50.00 · 10 Oct 2026 · Ztab`);
    assert.equal(request.uri, tab.rows[0].uri);
    const payment = parseUri(request.uri, 'test'); assert.equal(payment.kind, 'request'); if (payment.kind !== 'request') return;
    assert.equal(payment.payments[0].address, form.payee); assert.equal(payment.payments[0].zatoshis, '50000000');
  });
}
test('transparent requests remain memo-free through the new link', () => {
  const tab = makeTab({ ...form, payee: 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU' });
  assert.equal(tab.kind, 'tab'); if (tab.kind !== 'tab') return;
  const decoded = decodeShare(tab.rows[0].fragment); assert.equal(decoded.kind, 'share'); if (decoded.kind !== 'share') return;
  const request = requestFor(decoded.share); assert.equal(request.kind, 'request'); if (request.kind !== 'request') return;
  assert.equal(request.memo, undefined); assert.equal(request.uri.includes('memo='), false);
});
for (const [fiat, expected] of [['USD', '$1,250.00'], ['EUR', '€1,250.00'], ['GBP', '1,250.00 GBP'], ['CZK', '1,250.00 CZK'], ['PLN', '1,250.00 PLN'], ['CHF', '1,250.00 CHF']]) {
  test(`memo share matches the displayed grouped amount for ${fiat}`, async () => {
    const { formatFiat } = await import('../src/money.ts');
    const tab = makeTab({ ...form, fiat, total: '2500.00' });
    assert.equal(tab.kind, 'tab'); if (tab.kind !== 'tab') return;
    assert.equal(formatFiat(tab.rows[0].fiatShare, fiat), expected);
    const decoded = decodeShare(tab.rows[0].fragment); assert.equal(decoded.kind, 'share'); if (decoded.kind !== 'share') return;
    const request = requestFor(decoded.share); assert.equal(request.kind, 'request'); if (request.kind !== 'request') return;
    assert.equal(request.memo, `Dinner, Friday · Dragan · ${expected} · 10 Oct 2026 · Ztab`);
    assert.equal(request.uri, tab.rows[0].uri);
  });
}
