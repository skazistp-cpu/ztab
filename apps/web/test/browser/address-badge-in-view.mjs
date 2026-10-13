// On "Where do you get paid?" the network mark, the kind of address and the public warning are on screen, above the
// sticky bar with Make the links, whenever that button can be pressed: after typing or pasting an address, and when
// the step opens with a remembered address. Small phones, where the bar would otherwise cover them.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/address-badge-in-view.mjs
import assert from 'node:assert/strict';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
// A testnet transparent address: it carries all three, the testnet mark, its kind and the public warning.
const address = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 664]]) {
      for (const way of ['typed', 'pasted', 'remembered']) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'en-US' });
        if (way === 'remembered') await context.addInitScript(a => localStorage.setItem('tab.remember.v1', JSON.stringify({ address: a, names: [] })), address);
        const page = await context.newPage();
        await page.goto(origin);
        await page.getByRole('button', { name: 'Start a tab', exact: true }).click();
        await page.locator('.flow-steps button').filter({ hasText: 'Get paid' }).click();
        await page.getByRole('heading', { level: 1, name: 'Where do you get paid?' }).waitFor();
        const box = page.getByLabel('Your Zcash address', { exact: true });
        if (way === 'typed') { await box.click(); await page.keyboard.type(address); }
        if (way === 'pasted') { await box.click(); await page.keyboard.insertText(address); }
        await page.locator('.address-kind .testnet').waitFor();
        await page.waitForTimeout(120);
        const seen = await page.evaluate(() => {
          const bar = document.querySelector('.flow-actions').getBoundingClientRect();
          const make = [...document.querySelectorAll('.flow-actions button')].find(b => b.textContent === 'Make the links');
          return { make: !!make && !make.disabled, parts: [...document.querySelectorAll('.address-kind > p')].map(p => { const r = p.getBoundingClientRect(); return { text: p.textContent.slice(0, 24), inView: r.top >= 0 && r.bottom <= Math.min(innerHeight, bar.top) + 0.5 }; }) };
        });
        assert.equal(seen.make, true, `${engine} ${width}x${height} ${way}: Make the links can be pressed`);
        assert.deepEqual(seen.parts.map(p => p.text), ['Testnet: not real ZEC', 'Transparent address This'], `${engine} ${width}x${height} ${way}: mark, kind and warning are there`);
        assert.ok(seen.parts.every(p => p.inView), `${engine} ${width}x${height} ${way}: all three are fully in view above the bar ${JSON.stringify(seen.parts)}`);
        await context.close();
      }
    }
    console.log(`${engine}: the testnet mark, the kind of address and the public warning are in view above the sticky bar at 320x568, 360x640, 375x667 and 390x664, typed, pasted and remembered PASS`);
  } finally {
    await browser.close();
  }
}
