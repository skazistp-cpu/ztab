import test from 'node:test';
import assert from 'node:assert/strict';
import { fromTheFuture, requestFor } from '../src/pay.ts';
import { decodeShare, encodeShare, parseUri, type ShareLink } from '../../../packages/engine/src/index.ts';

const share: ShareLink = {
  network: 'test',
  payee: 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez',
  label: 'Dinner',
  name: 'Ana',
  from: 'Miro',
  fiatShare: '24.50',
  zatoshis: '1845825',
  rate: { fiat: 'USD', fiatPerZec: '1327.32', source: 'Coinbase spot', observedAt: '2026-10-05T11:31:00Z' },
};

test('a rate time more than a minute ahead of the clock is from the future', () => {
  const now = Date.parse('2026-10-05T11:31:00Z');
  assert.equal(fromTheFuture('2026-10-05T11:31:00Z', now), false);
  assert.equal(fromTheFuture('2026-10-05T11:32:00Z', now), false);
  assert.equal(fromTheFuture('2026-10-05T11:32:01Z', now), true);
  assert.equal(fromTheFuture('2026-10-04T11:31:00Z', now), false);
});

test('the request of a share carries its memo and reads back', () => {
  const request = requestFor(share);
  assert.equal(request.kind, 'request');
  if (request.kind !== 'request') return;
  assert.equal(request.memo, 'Dinner · Ana');
  const back = parseUri(request.uri, 'test');
  assert.equal(back.kind === 'request' && back.payments[0].zatoshis, '1845825');
});

test('a link stating 5 ZEC for a one-dollar share never reaches the pay screen', () => {
  const fields = ['test', share.payee, 'Dinner', 'Ana', 'Miro', '1.00', '500000000', 'USD', '1327.32', 'Coinbase spot', '2026-10-05T11:31:00Z'];
  const fragment = 's1.' + Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url');
  const decoded = decodeShare(fragment);
  assert.equal(decoded.kind === 'error' && decoded.error, 'amounts-disagree');
  assert.equal(encodeShare(share).kind, 'fragment');
});
