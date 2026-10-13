import test from 'node:test';
import assert from 'node:assert/strict';
import { pieceLengths, SLANT } from '../src/cut/shares.ts';
import { LANDING_SAMPLE } from '../src/landing-sample.ts';

test('each piece of the opening’s ribbon is exactly as long as its share of the bill', () => {
  const lengths = pieceLengths(300);
  assert.deepEqual(lengths, LANDING_SAMPLE.shares.map(share => Number(share.fiatShare)));
  assert.deepEqual(lengths, [56, 56, 56, 56, 56, 20]);
  const run = 1000;
  const scaled = pieceLengths(run);
  assert.ok(Math.abs(scaled.reduce((a, b) => a + b, 0) - run) < 1e-9, 'the pieces together are the whole ribbon');
  assert.ok(Math.abs(scaled[5] / scaled[1] - 20 / 56) < 1e-12, 'Jonas’s piece is 20/56 of Ana’s');
});

test('the cut is the Z’s own angle: 17 across for every 16 down', () => {
  assert.equal(SLANT, 17 / 16);
});
