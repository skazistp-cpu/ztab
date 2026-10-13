// Production-build integration. Only the clock is controlled; no wallet or payment is simulated.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Los_Angeles' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const [purpose, label] of [['Dinner, Friday', 'Dinner, Friday'], ['', 'Bill']]) {
      await page.clock.install({ time: new Date('2026-10-09T23:59:00Z') });
      await page.goto(origin);
      await fillIn(page, 'What was it for?', purpose);
      await fillIn(page, 'Total', '150');
      await fillIn(page, 'Name of person 1', 'Dragan');
      await fillIn(page, 'Your Zcash address', address);
      await fillIn(page, 'Rate: one ZEC in that currency', '100');
      await page.clock.setSystemTime(new Date('2026-10-10T00:01:00Z'));
      await makeLinks(page);
      const href = await page.getByRole('link', { name: 'Preview', exact: true }).first().getAttribute('href');
      assert.ok(href.includes('#s3.'));
      await page.clock.setSystemTime(new Date('2026-10-12T12:00:00Z'));
      await page.getByRole('link', { name: 'Preview', exact: true }).first().click();
      const uri = await page.getByRole('link', { name: 'Open in my wallet', exact: true }).getAttribute('href');
      const [recipient, query] = uri.slice('zcash:'.length).split('?');
      const params = new URLSearchParams(query);
      assert.equal(recipient, address); assert.equal(params.get('amount'), '0.5');
      const memo = Buffer.from(params.get('memo'), 'base64url').toString('utf8');
      assert.equal(memo, `${label} · Dragan · $50.00 · 10 Oct 2026 · Ztab`);
      assert.ok((await page.locator('.memo').innerText()).includes(memo));
      assert.equal(await page.locator('.stub svg').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, '']);
      if (process.env.EVIDENCE_DIR && purpose) {
        await fs.mkdir(process.env.EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.EVIDENCE_DIR}/${engine}-pay.png`, fullPage: true });
        await fs.writeFile(`${process.env.EVIDENCE_DIR}/${engine}-request.json`, JSON.stringify({ uri, memo, href }, null, 2));
      }
      console.log(`${engine}: ${label} — creation date survives later opening/UTC boundary; exact amount/address, memo, QR, storage PASS`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
