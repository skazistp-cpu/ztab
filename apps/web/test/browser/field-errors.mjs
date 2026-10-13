// Built-preview regression: validation must identify a control, never infer it from a person's name.
// Run with PLAYWRIGHT_MODULE and TAB_ORIGIN as documented in share.mjs.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
let failed = false;
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const names of [['Rate', 'Ben'], ['Ana', 'Ana']]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(origin);
        await fillIn(page, 'Total', '90');
        await fillIn(page, 'Your Zcash address', address);
        await fillIn(page, 'Rate: one ZEC in that currency', '100');
        for (let i = 0; i < names.length; i++) await fillIn(page, `Name of person ${i + 1}`, names[i]);
        const index = names[0] === 'Rate' ? 1 : 2;
        const amount = await fillIn(page, `Amount for person ${index}`, 'oops');
        await makeLinks(page);
        const actual = await page.evaluate(() => ({
          focus: document.activeElement?.getAttribute('aria-label'),
          invalid: [...document.querySelectorAll('[aria-invalid="true"]')].map(e => e.getAttribute('aria-label')),
          anchor: document.querySelector('[role="alert"]')?.previousElementSibling?.querySelector('input[inputmode="decimal"]')?.getAttribute('aria-label'),
        }));
        assert.deepEqual(actual, { focus: `Amount for person ${index}`, invalid: [`Amount for person ${index}`], anchor: `Amount for person ${index}` });
        await amount.fill('20');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        assert.equal(await page.locator('[role="alert"]').textContent(), '');
        await makeLinks(page);
        assert.equal(await page.getByRole('link', { name: 'Preview', exact: true }).count(), 2);
        assert.deepEqual(errors, []);
        console.log(`${engine}: ${names.join('/')} focuses and marks only offending amount; edit clears; valid submit succeeds PASS`);
      } catch (e) { failed = true; console.error(`${engine}: ${names.join('/')} FAIL`, e.message); }
      finally { await page.close(); }
    }
    // Existing field errors and engine-originated rate errors keep their own controls.
    for (const [label, bad] of [
      ['Total', 'oops'], ['Your Zcash address', 'oops'], ['Rate: one ZEC in that currency', 'oops'],
      ['Your own amount', 'oops'], ['What was it for?', 'x'.repeat(81)],
      ['Your name', 'x'.repeat(41)], ['Name of person 2', 'x'.repeat(41)],
    ]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
      try {
        await page.goto(origin);
        await fillIn(page, 'Total', '90');
        await fillIn(page, 'Your Zcash address', address);
        await fillIn(page, 'Rate: one ZEC in that currency', '100');
        const control = await fillIn(page, label, bad);
        await makeLinks(page);
        assert.equal(await control.evaluate(e => e === document.activeElement && e.getAttribute('aria-invalid') === 'true'), true, label);
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 1);
        console.log(`${engine}: ${label} routes to its own control PASS`);
      } catch (e) { failed = true; console.error(`${engine}: ${label} FAIL`, e.message); }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
if (failed) process.exitCode = 1;
