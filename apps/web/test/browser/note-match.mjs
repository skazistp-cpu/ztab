// Manual note matching: exact text suggests every candidate; only a confirmed tick changes the link.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8776';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce', locale: 'en-US' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const field = label => page.locator('label.field', { hasText: label }).locator('input,select,textarea').first();
    await page.goto(origin);
    await newTab(page, { total: '30', label: 'Dinner', people: ['Ana', 'Ana'], address, rate: '1000' });
    await page.getByRole('link', { name: 'Open my page', exact: true }).click();
    await page.locator('.mine-person').first().waitFor();
    const input = page.getByLabel('Paste a note from a payment in your wallet', { exact: true });
    assert.equal(await input.count(), 1, 'organiser offers the manual note helper');
    const memo = (await page.locator('.mine-memo span').first().innerText()).slice(1, -1);
    const before = page.url();
    await page.evaluate(() => {
      window.__storageCalls = 0;
      for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
        const old = Storage.prototype[method];
        Storage.prototype[method] = function (...args) { window.__storageCalls++; return old.apply(this, args); };
      }
    });
    const requests = []; page.on('request', r => requests.push(r.url()));
    await input.fill(`  ${memo}\n`);
    await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
    assert.equal(await input.inputValue(), '', 'pasted text is cleared immediately');
    assert.equal(page.url(), before, 'matching alone does not alter the link');
    assert.deepEqual(await page.locator('.mine-person input').evaluateAll(xs => xs.map(x => x.checked)), [false, false]);
    const choices = page.locator('.note-match-result button');
    assert.equal(await choices.count(), 2, 'duplicate notes require a positional choice');
    if (process.env.OUT) {
      const fs = await import('node:fs/promises'); await fs.mkdir(process.env.OUT, { recursive: true });
      await page.locator('.note-match-result').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.OUT}/${engine}-duplicate-320.png` });
    }
    await choices.nth(1).click();
    assert.match(page.url(), /\/mine\/01$/);
    assert.deepEqual(await page.locator('.mine-person input').evaluateAll(xs => xs.map(x => x.checked)), [false, true]);
    assert.equal(await page.locator('.mine-count').innerText(), '1 of 2 ticked');
    assert.equal(await page.locator('.note-match-result button').count(), 0, 'confirmation clears the candidates');
    assert.equal(await page.evaluate(() => window.__storageCalls), 0);
    assert.deepEqual(requests, [], 'matching and ticking make no request');
    await input.fill(memo.replace('Dinner', 'dinner'));
    await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
    assert.equal(await page.locator('.note-match-result button').count(), 0, 'no fuzzy or case-insensitive matching');
    assert.match(page.url(), /\/mine\/01$/);
    await input.fill(memo);
    await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
    assert.equal(await page.locator('.note-match-result button').count(), 1, 'already-ticked duplicate is shown without another tick action');
    // Typing a new note invalidates previously offered buttons.
    await input.fill('another note');
    assert.equal(await page.locator('.note-match-result button').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.reload();
    assert.deepEqual(await page.locator('.mine-person input').evaluateAll(xs => xs.map(x => x.checked)), [false, true]);
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.locator('.note-match-result button').count(), 0);
    // A unique note still needs confirmation; an already-ticked row never becomes unticked.
    await page.goto(origin);
    await newTab(page, { total: '30', label: 'Another dinner', people: ['Ana', 'Ben'], address, rate: '1000' });
    await page.getByRole('link', { name: 'Open my page', exact: true }).click();
    const uniqueMemo = (await page.locator('.mine-memo span').nth(1).innerText()).slice(1, -1);
    await input.fill(uniqueMemo);
    await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
    assert.deepEqual(await page.locator('.mine-person input').evaluateAll(xs => xs.map(x => x.checked)), [false, false]);
    await page.getByRole('button', { name: 'Tick Ben', exact: true }).click();
    assert.equal(await input.evaluate(e => document.activeElement === e), true, 'focus remains usable after removing the clicked button');
    await input.fill(uniqueMemo);
    await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
    assert.equal(await page.locator('.note-match-result button').count(), 0);
    assert.match(await page.locator('.note-match-result').innerText(), /already ticked/);
    assert.match(page.url(), /\/mine\/01$/);
    for (const bad of ['', 'not a note', uniqueMemo.replace('$10.00', '$10.01'), uniqueMemo.replace('Ztab', 'Tab'), '<img src=https://example.com/x onerror=alert(1)>']) {
      await input.fill(bad);
      await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
      assert.equal(await page.locator('.note-match-result button').count(), 0);
      assert.equal(await input.inputValue(), '');
      assert.match(page.url(), /\/mine\/01$/);
    }
    if (process.env.OUT) {
      const fs = await import('node:fs/promises'); await fs.mkdir(process.env.OUT, { recursive: true });
      for (const width of [320, 390, 1280]) for (const colorScheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ colorScheme });
        await input.fill(uniqueMemo); await page.getByRole('button', { name: 'Find matching requests', exact: true }).click();
        await page.locator('.note-match').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `${process.env.OUT}/${engine}-${width}-${colorScheme}.png` });
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${engine}: manual confirmation, duplicates by row, exact matching, cleared input, no storage/network, reload, 320px PASS`);
  } finally { await browser.close(); }
}
