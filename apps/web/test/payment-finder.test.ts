import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDER_LOOKBACK_SECONDS, FINDER_MAINNET_KEY, FINDER_MAX_BLOCKS, FINDER_SCOPE, FINDER_SECRET, FINDER_SERVER, finderExplained, lookSince, refuseKey, utcMinute } from '../src/payment-finder.ts';

const testKey = 'uviewtest1' + 'q'.repeat(200);
const mainKey = 'uview1' + 'q'.repeat(200);

test('a unified testnet viewing key is let through, in the old and the new form', () => {
  assert.equal(refuseKey(testKey, 'test'), undefined);
  assert.equal(refuseKey(`  ${testKey}\n`, 'test'), undefined);
  assert.equal(refuseKey('uvftest1' + 'q'.repeat(200), 'test'), undefined);
});

test('a mainnet key is refused while the check is testnet only', () => {
  assert.equal(refuseKey(mainKey, 'test'), FINDER_MAINNET_KEY);
  assert.equal(refuseKey('uvf1' + 'q'.repeat(200), 'test'), FINDER_MAINNET_KEY);
  assert.match(refuseKey(testKey, 'main') ?? '', /testnet viewing key/);
});

test('recovery phrases and spending keys are refused before anything is loaded', () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  for (const secret of [phrase, `${phrase} ${phrase}`.toUpperCase(), `\n${phrase}\n`, 'secret-extended-key-main1qqqq', 'secret-extended-key-test1qqqq', 'usk1qqqq', 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi', 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn']) {
    assert.equal(refuseKey(secret, 'test'), FINDER_SECRET, secret.slice(0, 20));
  }
});

test('other texts are refused with what to look for', () => {
  assert.match(refuseKey('', 'test') ?? '', /Paste a viewing key/);
  assert.match(refuseKey('   ', 'test') ?? '', /Paste a viewing key/);
  assert.match(refuseKey('zxviews1qqqq', 'test') ?? '', /Sapling viewing key/);
  assert.match(refuseKey('zxviewtestsapling1qqqq', 'test') ?? '', /Sapling viewing key/);
  assert.match(refuseKey('utest1qqqq', 'test') ?? '', /not a unified viewing key/);
  assert.match(refuseKey('Dinner, Friday · Ana · $45.46 · 11 Oct 2026 · Ztab', 'test') ?? '', /not a unified viewing key/);
});

test('testnet only: one named server, and the words say who it is and what it can see', () => {
  assert.deepEqual(Object.keys(FINDER_SERVER), ['test']);
  const text = finderExplained('zcash-testnet.chainsafe.dev', 'ChainSafe').map(p => p.join(' ')).join(' ');
  for (const part of ['It cannot spend.', 'not sent, not put in the link and not saved', 'forgotten when you leave or close this page', 'run by ChainSafe (zcash-testnet.chainsafe.dev)', 'your network address, which blocks were asked for and which transactions were fetched', 'It cannot see your key, the amounts or the notes.', 'Every payment into that wallet, not only this tab’s.']) assert.ok(text.includes(part), part);
});

test('block times are written in UTC to the minute', () => {
  assert.equal(utcMinute(Date.parse('2026-10-11T14:03:59Z') / 1000), '11 Oct 2026, 14:03 UTC');
  assert.equal(utcMinute(Date.parse('2026-01-02T00:00:00Z') / 1000), '2 Jan 2026, 00:00 UTC');
});

test('the look goes back to just before the tab was made, and never more than the two days the page says', () => {
  const now = Date.parse('2026-10-12T12:00:00Z') / 1000;
  const at = (iso: string): number => Date.parse(iso) / 1000;
  assert.equal(FINDER_LOOKBACK_SECONDS, 172_800);
  assert.match(FINDER_SCOPE, /looks back about two days/);
  assert.equal(lookSince('2026-10-12T11:00:00Z', now), at('2026-10-12T10:50:00Z'), 'a new tab: ten minutes before it was made');
  assert.equal(lookSince('2026-10-11T00:00:00Z', now), at('2026-10-10T23:50:00Z'));
  assert.equal(lookSince('2026-10-10T12:05:00Z', now), at('2026-10-10T12:00:00Z'), 'the ten minutes do not reach past two days');
  assert.equal(lookSince('2026-10-01T00:00:00Z', now), at('2026-10-10T12:00:00Z'), 'an old tab: two days, no more');
  assert.equal(lookSince(undefined, now), at('2026-10-10T12:00:00Z'), 'a tab without a date: two days');
  assert.equal(lookSince('not a date', now), at('2026-10-10T12:00:00Z'));
  assert.equal(lookSince('2026-10-13T00:00:00Z', now), at('2026-10-12T23:50:00Z'), 'a date in the future looks at nothing old');
});

test('the block bound is wide enough for two days on a fast chain, and still a bound', () => {
  // Measured on 12 October 2026: testnet blocks about 25 seconds apart, mainnet 75.
  assert.ok(FINDER_MAX_BLOCKS >= FINDER_LOOKBACK_SECONDS / 25);
  assert.ok(FINDER_MAX_BLOCKS <= 20_000);
});
