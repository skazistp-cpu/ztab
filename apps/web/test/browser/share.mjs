// Against a built preview. Supply an installed Playwright module path; no app dependency is added.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/share.mjs
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Only the operating-system boundary is replaced: the actual form and buttons run.
    await page.addInitScript(() => {
      window.shared = []; window.copied = []; window.shareMode = 'success';
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
        window.shared.push({ data, activated: navigator.userActivation.isActive });
        if (window.shareMode === 'cancel') throw new DOMException('cancelled', 'AbortError');
        if (window.shareMode === 'deny') throw new DOMException('denied', 'NotAllowedError');
        if (window.shareMode === 'pending') await new Promise(resolve => { window.finishShare = resolve; });
      }});
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { window.copied.push(text); },
      }});
    });
    await page.goto(origin);
    await newTab(page, { name: 'Miro', label: 'Dinner', total: '90', people: ['Ana', 'Ben'], address, rate: '100' });
    const sends = page.getByRole('button', { name: 'Send', exact: true });
    assert.equal(await sends.count(), 2, 'one native-share action per person who owes');
    await page.getByRole('button', { name: 'Copy all', exact: true }).click();
    const lines = (await page.evaluate(() => window.copied.at(-1))).split('\n');
    assert.match(lines[0], /^Dinner: Ana 30\.00 USD = 0\.3 ZEC /);
    assert.equal(lines.length, 2);
    await sends.first().click();
    const first = await page.evaluate(() => window.shared[0]);
    assert.deepEqual(first.data, { text: lines[0] }, 'only Ana’s existing message, no other person');
    assert.equal(first.activated, true, 'share stays inside the user gesture');
    assert.equal(await sends.first().textContent(), 'Send', 'handing off is not proof of delivery');
    await page.evaluate(() => { window.shareMode = 'cancel'; });
    await sends.first().click();
    assert.equal(await page.locator('.share-status').first().textContent(), '', 'cancel is quiet');
    await page.evaluate(() => { window.shareMode = 'deny'; });
    await sends.first().click();
    assert.match(await page.locator('.share-status').first().textContent(), /Copy link/);
    await page.getByRole('button', { name: 'Copy link', exact: true }).first().click();
    assert.equal(await page.evaluate(() => window.copied.at(-1)), await page.getByRole('link', { name: 'Preview', exact: true }).first().getAttribute('href'));
    await page.evaluate(() => { window.shareMode = 'pending'; });
    await sends.nth(1).click();
    assert.equal(await sends.nth(1).isDisabled(), true, 'no second native sheet while one is pending');
    await page.evaluate(() => window.finishShare());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].filter(b => b.textContent === 'Send').every(b => !b.disabled));
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
    await makeLinks(page);
    assert.equal(await sends.count(), 0, 'unsupported browsers keep the copy flow');
    assert.equal(await page.getByRole('button', { name: 'Copy link', exact: true }).count(), 2);
    assert.deepEqual(errors, []);
    console.log(`${engine}: payload, user activation, cancellation, refusal + copy, pending guard, unsupported fallback PASS`);
  } finally { await browser.close(); }
}
