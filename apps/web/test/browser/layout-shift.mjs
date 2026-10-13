// Every screen is drawn into the page by its script. Until then nothing that is seen may move when it arrives:
// the brand stays where it is and the footer waits below the first screen (CLS < 0.1 in Chromium, which reports it).
// The script is held back 400 ms so the page paints its shell first, as on a slow phone.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/layout-shift.mjs
import assert from 'node:assert/strict';
import { encodeShare } from '../../../../packages/engine/src/index.ts';
import { encodeTable, mineFragment } from '../../src/table-link.ts';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const share = { network: 'test', payee: 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez', label: 'Dinner', name: 'Ana', from: 'Miro', fiatShare: '10.00', zatoshis: '1000000', rate: { fiat: 'USD', fiatPerZec: '1000', source: 'Manual', observedAt: '2026-10-10T00:00:00Z' }, createdAt: '2026-10-10T00:00:00Z', memoBrand: 'Ztab' };
const fragment = value => { const e = encodeShare(value); if (e.kind !== 'fragment') throw new Error('fixture'); return e.fragment; };
const s3 = fragment(share), s3ben = fragment({ ...share, name: 'Ben' });
const g2 = encodeTable([s3, s3ben], []).fragment;
const routes = { opening: '/', pay: `/#${s3}`, organiser: `/#${mineFragment(g2, [false, false])}`, 'table QR': `/#${g2}/qr`, 'name picker': `/#${g2}`, 'table share': `/#${g2}/1`, 'broken link': '/#s3.broken' };
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'en-US' });
      await context.route(/\/assets\/index-[\w-]+\.js$/, async route => { await new Promise(r => setTimeout(r, 400)); await route.continue(); });
      await context.addInitScript(() => {
        window.__frames = []; window.__cls = 0;
        try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { window.__cls = null; }
        const look = () => {
          const brand = document.querySelector('.brand a'), footer = document.querySelector('footer.about'), app = document.querySelector('#app');
          if (brand && footer && app) window.__frames.push({ drawn: app.childElementCount > 0, brand: Math.round(brand.getBoundingClientRect().left), footer: Math.round(footer.getBoundingClientRect().top) });
          if (window.__frames.length < 400) requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
      for (const [name, path] of Object.entries(routes)) {
        const page = await context.newPage();
        await page.goto(origin + path);
        await page.locator('#app > *').first().waitFor();
        await page.waitForTimeout(700);
        const { frames, cls } = await page.evaluate(() => ({ frames: window.__frames, cls: window.__cls }));
        const before = frames.filter(f => !f.drawn), after = frames.filter(f => f.drawn).at(-1);
        assert.ok(after, `${engine} ${width} ${name}: the screen is drawn`);
        for (const f of before) {
          assert.equal(f.brand, after.brand, `${engine} ${width} ${name}: the brand does not move`);
          assert.ok(f.footer >= height - 1 || f.footer === after.footer, `${engine} ${width} ${name}: the footer is below the first screen until the screen is drawn (${f.footer} → ${after.footer})`);
        }
        if (cls !== null) assert.ok(cls < 0.1, `${engine} ${width} ${name}: CLS ${cls.toFixed(3)}`);
        await page.close();
      }
      await context.close();
    }
    console.log(`${engine}: opening, pay, organiser, table QR, name picker, table share and broken link keep the brand still and the footer below the first screen at 390 and 1280${engine === 'chromium' ? ', CLS < 0.1' : ''} PASS`);
  } finally {
    await browser.close();
  }
}
