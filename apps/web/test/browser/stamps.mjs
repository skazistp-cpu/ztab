// Run against a built preview as documented in share.mjs.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import fs from 'node:fs';
import path from 'node:path';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const fields = ['test', address, 'Dinner', 'Ana', 'Miro', '1.00', '500000000', 'USD', '100', 'Manual entry', '2026-10-10T12:00:00Z'];
const mismatch = '#s1.' + Buffer.from(JSON.stringify(fields)).toString('base64url');
const evidence = process.env.SCREENSHOTS;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const colorScheme of ['light', 'dark']) for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme, reducedMotion: 'reduce', locale: 'en-US' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      await newTab(page, { total: '90', address, rate: '100' });
      assert.equal(await page.locator('.own .stamp').count(), 1, 'organiser gets the covered stamp');
      assert.equal(await page.locator('.person:not(.own) .stamp').count(), 0, 'never marks a payer as paid');
      assert.match(await page.locator('.own .stamp').innerText(), /already covered/i);
      await page.locator('.own').scrollIntoViewIfNeeded();
      if (evidence) await page.screenshot({ path: path.join(evidence, `${engine}-${colorScheme}-${width}-covered.png`) });
      await page.getByRole('link', { name: 'Preview', exact: true }).first().click();
      await page.getByRole('link', { name: 'Open in my wallet', exact: true }).waitFor();
      assert.equal(await page.locator('.stamp').count(), 0, 'valid payer request has no status stamp');
      await page.goto(origin + '#incomplete');
      await page.getByRole('heading', { name: 'This link is incomplete', exact: true }).waitFor();
      assert.equal(await page.locator('.stamp').count(), 0, 'incomplete is not falsely called amount-mismatch');
      await page.goto(origin + mismatch);
      await page.getByRole('heading', { name: 'The amounts in this link do not agree', exact: true }).waitFor();
      assert.equal(await page.locator('.stamp').innerText(), 'VOID');
      assert.equal(await page.locator('a[href^="zcash:"]').count(), 0);
      assert.match(await page.locator('.card').innerText(), /Do not pay from it/);
      const style = await page.locator('.stamp').evaluate(el => {
        const s = getComputedStyle(el), paper = getComputedStyle(el.closest('.card'));
        return { fg: s.color, bg: paper.backgroundColor, animation: s.animationName, width: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      const luminance = s => s.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => c / 255).reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4), 0);
      const x = luminance(style.fg), y = luminance(style.bg), contrast = (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
      assert.ok(contrast >= 4.5, `${engine} ${colorScheme}: ${contrast}`);
      assert.equal(style.animation, 'none'); assert.ok(style.width <= style.viewport);
      if (evidence) await page.screenshot({ path: path.join(evidence, `${engine}-${colorScheme}-${width}-void.png`) });
      assert.deepEqual(errors, []);
      console.log(`${engine} ${colorScheme} ${width}: own-only / mismatch-only / no payment / contrast ${contrast.toFixed(2)} PASS`);
      await page.close();
    }
  } finally { await browser.close(); }
}
