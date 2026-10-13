import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTab } from '../src/tab.ts';
import { TICKER, tickerLine } from '../src/landing-ticker.ts';

const payee = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const at = '2026-10-12T00:00:00.000Z';

test('every bill in the ticker is split as the engine splits it: equally between everyone, to the cent', () => {
  for (const item of TICKER) {
    const tab = makeTab({
      createdAt: at,
      from: '',
      label: item.label,
      payee,
      fiat: item.fiat,
      total: item.total,
      ownShare: '',
      people: Array.from({ length: item.people - 1 }, () => ({ name: '', amount: '' })),
      rate: { fiatPerZec: '1229.06', source: 'Manual entry', observedAt: at },
    });
    assert.equal(tab.kind, 'tab', item.label);
    if (tab.kind !== 'tab') continue;
    const shares = [tab.own.fiatShare, ...tab.rows.map(row => row.fiatShare)];
    assert.deepEqual(shares, Array<string>(item.people).fill(item.each), `${item.label}: everyone pays ${item.each}`);
    assert.deepEqual(tab.extraCents, [], `${item.label}: no one carries a leftover cent`);
  }
});

test('the ticker says each bill word for word, in the app’s own money format', () => {
  assert.deepEqual(TICKER.map(tickerLine), [
    'Team dinner · 6 people · $50.00 each',
    'Pizza night · 4 friends · $18.40 each',
    'Ski trip · 5 friends · €212.00 each',
    'Birthday · 8 friends · 24.50 GBP each',
    'Brunch · 3 friends · €27.30 each',
    'Concert tickets · 2 friends · $64.50 each',
  ]);
});
