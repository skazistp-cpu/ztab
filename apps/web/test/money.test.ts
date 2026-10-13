import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFiat, formatUtc } from '../src/money.ts';

test('formats money and time for the pay screen', () => {
  assert.equal(formatFiat('24.50', 'USD'), '$24.50');
  assert.equal(formatFiat('1327.32', 'EUR'), '€1,327.32');
  assert.equal(formatFiat('1234567', 'CHF'), '1,234,567 CHF');
  assert.equal(formatUtc('2026-10-05T11:31:00Z'), '5 Oct 2026, 11:31 UTC');
});
