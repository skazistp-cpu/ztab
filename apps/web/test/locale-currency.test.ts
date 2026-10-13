import test from 'node:test';
import assert from 'node:assert/strict';
import { startingCurrency } from '../src/locale-currency.ts';
import { FIAT_CURRENCIES } from '../../../packages/engine/src/index.ts';

test('a region with one of Ztab’s currencies starts on it', () => {
  for (const [tag, fiat] of [['en-US', 'USD'], ['en-GB', 'GBP'], ['sk-SK', 'EUR'], ['de-DE', 'EUR'], ['fr-FR', 'EUR'], ['hr-HR', 'EUR'], ['bg-BG', 'EUR'], ['cs-CZ', 'CZK'], ['pl-PL', 'PLN'], ['de-CH', 'CHF'], ['fr-CH', 'CHF'], ['it-CH', 'CHF'], ['de-LI', 'CHF'], ['en-IE', 'EUR'], ['de-AT', 'EUR']]) {
    assert.equal(startingCurrency([tag]), fiat, tag);
  }
});

test('the region decides, not the language', () => {
  assert.equal(startingCurrency(['en-DE']), 'EUR');
  assert.equal(startingCurrency(['de-US']), 'USD');
  assert.equal(startingCurrency(['en-CZ']), 'CZK');
  assert.equal(startingCurrency(['pl-GB']), 'GBP');
});

test('a language without a region uses its likely one', () => {
  for (const [tag, fiat] of [['sk', 'EUR'], ['cs', 'CZK'], ['pl', 'PLN'], ['de', 'EUR'], ['en', 'USD'], ['fr', 'EUR'], ['es', 'EUR']]) {
    assert.equal(startingCurrency([tag]), fiat, tag);
  }
});

test('only the first preference counts', () => {
  assert.equal(startingCurrency(['en-US', 'sk-SK']), 'USD');
  assert.equal(startingCurrency(['sk-SK', 'en-US']), 'EUR');
});

test('anything else starts on USD, as before', () => {
  for (const languages of [undefined, [], [''], ['ja-JP'], ['pt-BR'], ['en-CA'], ['en-AU'], ['sv-SE'], ['hu-HU'], ['da-DK'], ['not a tag'], ['x'], ['en-XX']]) {
    assert.equal(startingCurrency(languages), 'USD', JSON.stringify(languages));
  }
});

test('the result is always a currency the form offers', () => {
  for (const tag of ['en-US', 'sk-SK', 'cs-CZ', 'pl-PL', 'de-CH', 'en-GB', 'zz-ZZ']) assert.ok(FIAT_CURRENCIES.includes(startingCurrency([tag])));
});
