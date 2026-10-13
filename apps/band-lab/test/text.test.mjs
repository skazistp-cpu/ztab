// The band's words and figures, held to what was approved and to the engine: the lines are the first sentence word for
// word, none longer than twenty characters; the pieces are the second; the sheet's values are what the engine reads
// from Ana's request. Run with: node --test test/text.test.mjs (from apps/band-lab).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAND_S1, BAND_S2, S1_LINES, S2_PIECES, WALLETS } from '../../web/src/landing-band/text.ts';
import { BAND_PAYEE, demoRequest, shortAddress } from '../../web/src/landing-band/demo.ts';
import { LANDING_SAMPLE } from '../../web/src/landing-sample.ts';

test('the six lines are the first sentence, word for word, at most twenty characters each', () => {
  const lines = S1_LINES.map(pieces => pieces.map(piece => piece.t).join(''));
  assert.equal(lines.join(' '), BAND_S1);
  for (const line of lines) assert.ok(line.length <= 20, `${line} is ${line.length} characters`);
  assert.deepEqual(S1_LINES.flatMap(pieces => pieces.filter(piece => piece.key).map(piece => piece.t)), ['the address', 'the amount', 'the note']);
  assert.equal(S1_LINES.flatMap(pieces => pieces.filter(piece => piece.quiet).map(piece => piece.t)).join(' '), 'if it supports one.');
});

test('the pieces are the second sentence, word for word, each wallet named once in its order', () => {
  assert.equal(S2_PIECES.map(piece => (typeof piece === 'string' ? piece : piece.wallet + piece.after)).join(''), BAND_S2);
  assert.deepEqual(S2_PIECES.filter(piece => typeof piece !== 'string').map(piece => piece.wallet), [...WALLETS]);
});

test('the sheet shows what the engine reads from Ana’s request: her share of the sample dinner', () => {
  const req = demoRequest();
  const ana = LANDING_SAMPLE.shares.find(share => share.name === 'Ana');
  assert.equal(req.share.network, 'test');
  assert.equal(req.share.fiatShare, ana.fiatShare);
  assert.equal(req.zec, ana.zec, 'the amount is the ribbon’s figure for Ana');
  assert.equal(req.address, BAND_PAYEE);
  assert.equal(req.addressShort, shortAddress(BAND_PAYEE));
  assert.match(req.addressShort, /^.{8}….{8}$/);
  assert.ok(req.uri.startsWith(`zcash:${BAND_PAYEE}?amount=${req.zec}&memo=`), 'the request is the engine’s');
  assert.equal(req.note, `${LANDING_SAMPLE.label} · Ana · $${ana.fiatShare} · 9 Oct 2026 · Ztab`);
  assert.doesNotMatch(req.note, /sent|paid/i);
});
