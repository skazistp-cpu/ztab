// The organiser's page: ticks kept in the link, and a readable row with a long amount on a narrow phone.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/organiser.mjs
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: 'reduce', locale: 'en-US' });
    await context.addInitScript(() => {
      window.__storage = 0;
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) { window.__storage++; return original.apply(this, args); };
      }
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const field = label => page.locator('label.field', { hasText: label }).locator('input,select,textarea').first();
    await page.goto(origin);
    await newTab(page, { total: '125000', currency: 'CZK', people: ['Alexandria'], address, rate: '25000' });
    await page.getByRole('link', { name: 'Open my page', exact: true }).click();
    await page.locator('.mine-person').first().waitFor();

    // A long amount and a long name on a 320 px phone: both readable, neither over the other.
    const boxes = await page.locator('.mine-person').first().evaluate(row => {
      const rect = selector => { const r = row.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
      const name = row.querySelector('.mine-head strong');
      return { name: rect('.mine-head strong'), amount: rect('.mine-head .amount'), row: rect('.mine-head'), lines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)) };
    });
    assert.equal(await page.locator('.mine-person').first().locator('.mine-head .amount').innerText(), '41,666.67 CZK');
    assert.ok(boxes.name.width >= 100, `${engine}: the name has ${boxes.name.width} px`);
    assert.equal(boxes.lines, 1, `${engine}: "Alexandria" stays on one line`);
    const apart = boxes.name.right <= boxes.amount.left || boxes.name.bottom <= boxes.amount.top;
    assert.ok(apart, `${engine}: the name and the amount do not overlap`);
    assert.ok(boxes.amount.left >= boxes.row.left - 0.5 && boxes.amount.right <= boxes.row.right + 0.5, `${engine}: the amount stays inside the row`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    // Ticks live in the address, by position, and survive a fresh page.
    await page.locator('.mine-person input').nth(1).check();
    assert.match(await page.evaluate(() => location.hash), /\/mine\/01$/);
    assert.equal(await page.locator('.mine-count').innerText(), '1 of 2 ticked');
    const url = await page.evaluate(() => location.href);
    const again = await context.newPage();
    await again.goto(url);
    await again.locator('.mine-person').first().waitFor();
    assert.deepEqual(await again.locator('.mine-person input').evaluateAll(boxes => boxes.map(box => box.checked)), [false, true]);
    assert.equal(await again.evaluate(() => window.__storage), 0, `${engine}: the organiser page makes no storage call`);
    await again.locator('.mine-person input').nth(1).uncheck();
    assert.match(await again.evaluate(() => location.hash), /\/mine$/);
    await again.goto(url.replace(/\/mine\/01$/, '/mine/0'));
    await again.getByRole('heading', { name: 'This link is incomplete' }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${engine}: long amount at 320 px, ticks in the link, fresh page, no storage, wrong ticks rejected PASS`);
  } finally {
    await browser.close();
  }
}
