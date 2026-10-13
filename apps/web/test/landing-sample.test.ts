import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTab } from '../src/tab.ts';
import { decodeShare } from '../../../packages/engine/src/index.ts';
import { LANDING_SAMPLE } from '../src/landing-sample.ts';

const payee = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const at = '2026-10-10T18:00:00.000Z';

test('the ribbon shows the engine’s own split of its sample bill: five shares of 56.00 and Jonas’s fixed 20.00', () => {
  const [own, ...friends] = LANDING_SAMPLE.shares;
  const tab = makeTab({
    createdAt: at,
    from: '',
    label: LANDING_SAMPLE.label,
    payee,
    fiat: LANDING_SAMPLE.fiat,
    total: LANDING_SAMPLE.total,
    ownShare: '',
    people: friends.map(share => ({ name: share.name, amount: LANDING_SAMPLE.fixed[share.name] ?? '' })),
    rate: { fiatPerZec: LANDING_SAMPLE.rate, source: 'Manual entry', observedAt: at },
  });
  assert.equal(tab.kind, 'tab');
  if (tab.kind !== 'tab') return;
  assert.deepEqual(
    [{ name: own.name, fiatShare: tab.own.fiatShare, zec: tab.own.zec }, ...tab.rows.map(row => ({ name: row.name, fiatShare: row.fiatShare, zec: row.zec }))],
    LANDING_SAMPLE.shares.map(share => ({ name: share.name, fiatShare: share.fiatShare, zec: share.zec })),
  );
  assert.deepEqual(LANDING_SAMPLE.shares.map(share => share.fiatShare), ['56.00', '56.00', '56.00', '56.00', '56.00', '20.00']);
  const cents = LANDING_SAMPLE.shares.reduce((sum, share) => sum + Math.round(Number(share.fiatShare) * 100), 0);
  assert.equal((cents / 100).toFixed(2), LANDING_SAMPLE.total, 'the pieces add up to the total on the ribbon');
});

test('the links in the picture are examples cut in the middle, and none of them opens a tab', () => {
  const [own, ...friends] = LANDING_SAMPLE.shares;
  assert.equal(own.own, true);
  assert.equal(own.link, '', 'the organiser’s own share has no link');
  for (const share of friends) {
    assert.equal(share.own, false);
    assert.match(share.link, /^ztab\.sebrona\.com\/#s3\.[A-Za-z0-9]{4}…[A-Za-z0-9]{4}$/);
    assert.notEqual(decodeShare(share.link.split('#')[1]).kind, 'share');
  }
});
