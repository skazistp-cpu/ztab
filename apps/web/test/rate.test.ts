import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSpot, isRate, readSpot } from '../src/rate.ts';

test('reads a well-formed spot response and keeps the amount as sent', () => {
  const body = { data: { amount: '1327.320', base: 'ZEC', currency: 'USD' } };
  assert.equal(readSpot(body, 'USD'), '1327.320');
});

test('refuses a response for another pair, a number amount, or anything malformed', () => {
  assert.equal(readSpot({ data: { amount: '1327.32', base: 'ZEC', currency: 'EUR' } }, 'USD'), undefined);
  assert.equal(readSpot({ data: { amount: '1327.32', base: 'BTC', currency: 'USD' } }, 'USD'), undefined);
  assert.equal(readSpot({ data: { amount: 1327.32, base: 'ZEC', currency: 'USD' } }, 'USD'), undefined);
  for (const amount of ['0', '-1', '1e3', '1,327.32', '', ' 1', '1'.repeat(33)]) {
    assert.equal(readSpot({ data: { amount, base: 'ZEC', currency: 'USD' } }, 'USD'), undefined, amount);
  }
  for (const body of [null, 'x', 5, {}, { data: null }, { data: [] }, { errors: [] }]) {
    assert.equal(readSpot(body, 'USD'), undefined);
  }
});

test('a typed rate must be a positive plain decimal', () => {
  assert.equal(isRate('1327.32'), true);
  assert.equal(isRate('0.5'), true);
  for (const bad of ['0', '0.00', '1,5', '1e2', '.5', '+1', '']) {
    assert.equal(isRate(bad), false, bad);
  }
});

for (const fiat of ['GBP', 'CZK', 'PLN', 'CHF']) {
  test(`${fiat} lookup requests only its pair and validates the response`, async t => {
    const calls: Array<[unknown, RequestInit | undefined]> = [];
    let responseFiat = fiat;
    t.mock.method(globalThis, 'fetch', async (url: unknown, options: RequestInit | undefined) => {
      calls.push([url, options]);
      return new Response(JSON.stringify({ data: { base: 'ZEC', currency: responseFiat, amount: '123.450' } }));
    });
    assert.equal(await fetchSpot(fiat), '123.450');
    assert.equal(calls[0][0], `https://api.coinbase.com/v2/prices/ZEC-${fiat}/spot`);
    assert.equal(calls[0][1]?.credentials, 'omit');
    assert.equal(calls[0][1]?.referrerPolicy, 'no-referrer');
    responseFiat = 'USD';
    assert.equal(await fetchSpot(fiat), undefined);
  });
}
