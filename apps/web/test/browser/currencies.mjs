// Run against a built preview as documented in share.mjs; Coinbase is intercepted only in this test.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const requests = []; let deny = false;
    await page.route('https://api.coinbase.com/**', route => {
      const request = route.request(); requests.push(request.url());
      const code = /ZEC-([A-Z]+)\/spot$/.exec(request.url())?.[1];
      return deny ? route.fulfill({ status: 503, body: '' }) : route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ data: { base: 'ZEC', currency: code, amount: '100.00' } }),
      });
    });
    for (const fiat of ['USD', 'EUR', 'GBP', 'CZK', 'PLN', 'CHF']) {
      await page.goto(origin);
      await fillIn(page, 'Your name', 'Miro');
      await fillIn(page, 'What was it for?', 'Dinner');
      await fillIn(page, 'Total', '90');
      await fillIn(page, 'Name of person 1', 'Ana');
      await fillIn(page, 'Your Zcash address', address);
      await fillIn(page, 'Currency', fiat);
      await openStep(page, 'Rate');
      await page.getByRole('button', { name: /Fetch.*Coinbase/ }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some(e => e.value === '100.00'));
      assert.equal(requests.at(-1), `https://api.coinbase.com/v2/prices/ZEC-${fiat}/spot`);
      await makeLinks(page);
      await page.getByRole('link', { name: 'Preview', exact: true }).first().click();
      const uri = await page.getByRole('link', { name: 'Open in my wallet', exact: true }).getAttribute('href');
      assert.ok(uri.includes('?amount=0.3&memo='));
      const heading = await page.locator('h1').innerText();
      assert.match(heading, fiat === 'USD' ? /\$30\.00/ : fiat === 'EUR' ? /€30\.00/ : new RegExp(`30\\.00 ${fiat}`));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    // A failed provider lookup must leave the new currency usable with a typed rate.
    await page.goto(origin); deny = true;
    await fillIn(page, 'Currency', 'CZK');
    await openStep(page, 'Rate');
    await page.getByRole('button', { name: /Fetch.*Coinbase/ }).click();
    await page.getByText('Could not get a rate. Type one in instead.', { exact: true }).waitFor();
    await fillIn(page, 'Total', '90');
    await fillIn(page, 'Your Zcash address', address);
    await fillIn(page, 'Rate: one ZEC in that currency', '100');
    await makeLinks(page);
    assert.equal(await page.getByRole('link', { name: 'Preview', exact: true }).count(), 2);
    await page.getByRole('link', { name: 'Preview', exact: true }).first().click();
    assert.match(await page.locator('.pay .rate').innerText(), /entered by hand/);
    assert.deepEqual(errors, []);
    console.log(`${engine}: all six currencies, exact request, phone layout, failed lookup + manual fallback PASS`);
  } finally { await browser.close(); }
}
