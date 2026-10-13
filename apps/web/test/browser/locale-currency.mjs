// The form starts on the currency of the browser's region, changes nothing else, stores nothing and asks no server.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8776';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const [locale, fiat, sign] of [['en-US', 'USD', '$'], ['sk-SK', 'EUR', '€'], ['de-DE', 'EUR', '€'], ['en-GB', 'GBP', 'GBP'], ['cs-CZ', 'CZK', 'CZK'], ['pl-PL', 'PLN', 'PLN'], ['de-CH', 'CHF', 'CHF'], ['ja-JP', 'USD', '$'], ['pt-BR', 'USD', '$']]) {
      // Playwright's WebKit reports de-CH to the page as de-DE, so the Swiss case can only be checked in Chromium.
      if (engine === 'webkit' && locale === 'de-CH') continue;
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const requests = []; page.on('request', r => requests.push(new URL(r.url()).origin));
      await page.goto(origin);
      const field = label => page.locator('label.field', { hasText: label }).locator('input,select,textarea').first();
      assert.equal(await field('Currency').inputValue(), fiat, `${locale} starts on ${fiat}`);
      assert.deepEqual(await field('Currency').locator('option').allInnerTexts(), ['USD', 'EUR', 'GBP', 'CZK', 'PLN', 'CHF'], 'every currency is still offered, in the same order');
      // The starting choice carries through to the links like a choice made by hand.
      await newTab(page, { total: '30', label: 'Dinner', people: ['Ana'], address, rate: '1000' });
      await page.getByRole('link', { name: 'Open my page', exact: true }).waitFor();
      assert.ok((await page.locator('.results').innerText()).includes(sign), `${locale}: shares are shown in ${fiat}`);
      // It is only a start: the organiser's own choice wins and stays.
      await fillIn(page, 'Currency', 'PLN');
      assert.equal(await field('Currency').inputValue(), 'PLN');
      assert.deepEqual([...new Set(requests)], [origin], 'nothing is asked of another site');
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie.length]), [0, 0, 0]);
      assert.deepEqual(errors, []);
      await page.close();
    }
    // Remembered address and names come back; the currency is not remembered and follows the region each visit.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'sk-SK' });
    const page = await context.newPage();
    await page.goto(origin);
    const field = label => page.locator('label.field', { hasText: label }).locator('input,select,textarea').first();
    // The currency is chosen before the rate: a change of currency clears a rate typed for another one.
    await fillIn(page, 'Currency', 'GBP');
    await fillIn(page, 'Total', '30'); await fillIn(page, 'Your Zcash address', address); await fillIn(page, 'Rate: one ZEC in that currency', '1000');
    await (await box(page, 'Remember my address and names on this device')).check();
    await makeLinks(page);
    await page.getByRole('link', { name: 'Open my page', exact: true }).waitFor();
    await page.reload();
    assert.equal(await field('Your Zcash address').inputValue(), address, 'Remember still brings the address back');
    assert.equal(await field('Currency').inputValue(), 'EUR', 'the currency is not stored; it starts from the region again');
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)).then(s => /GBP|EUR|sk-SK/.test(s)), false, 'nothing about currency or language is stored');
    await context.close();
    console.log(`${engine}: starting currency from the region for nine locales, all six still offered, own choice wins, nothing stored or asked PASS`);
  } finally { await browser.close(); }
}
