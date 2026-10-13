// The street in 3D, where the build has it (src/street3d/): the stage's side of the contract. It is asked for only after
// the page has scrolled (a visit that does not scroll fetches nothing of it), takes over at the cut, is fed the scroll,
// gives the captions and the rail their stations, its people their names (labels on a wide screen, a legend on a phone),
// darkens the page's ground over its dusk, and holds with Pause motion. Reduced motion never loads it. Chromium and WebKit.
// Without the 3D street in the build this test says so and passes (the drawn street is tested by landing-street.mjs).
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing-street3d.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { LANDING_SAMPLE } from '../../src/landing-sample.ts';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8764').replace(/\/$/, '');
const flat = text => text.replace(/\s+/g, ' ').trim();
const SAY = [
  'Split it equally or by item, with a tip.',
  'Each link opens one standard ZIP 321 payment request for one person.',
  'At the table, show one QR: each friend scans it and chooses their name.',
  'They pay from their own Zcash wallet.',
  'Ztab cannot see payments on its own, so tick people off on your own page as payments arrive in your wallet.',
];
/** The stage's progress for the 3D street's progress q (the 3D street starts at the cut, the end of the dive). */
const along = async (page, q, wait = 400) => {
  const p = await page.evaluate(([v]) => {
    const s = document.querySelector('.zs');
    const len = Number(getComputedStyle(s).getPropertyValue('--zs-len')) - 1;
    const cut = (0.7 + 0.15 + 0.8) / len;
    const p = Math.min(1, cut + v * (1 - cut));
    scrollTo(0, s.getBoundingClientRect().top + scrollY + p * (s.offsetHeight - innerHeight));
    return p;
  }, [q]);
  // The stage eases to where the scroll is: wait until it is there (frames are slow in a software renderer).
  await page.waitForFunction(want => Math.abs(Number(document.querySelector('.zs').dataset.p) - want) < 0.0015, p, { timeout: 20000, polling: 50 });
  await page.waitForTimeout(wait);
};
/** Waits for the 3D street to be mounted and to have taken over (after its first second of frames). */
const mounted = page => page.waitForFunction(() => document.querySelector('.zs.zs-3d-ready .zs-3d canvas') !== null, null, { timeout: 15000 }).then(() => true, () => false);

let visits = 0, skipped = false;
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  // The 3D street is drawn by the GPU: give headless Chromium the machine's (on macOS, through Metal), as a visitor's
  // browser has it, not the software renderer it uses by default.
  const browser = await pw[engine].launch(engine === 'chromium' && process.platform === 'darwin' ? { args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] } : {});
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const at = `${engine} ${width}`;
      const phone = width < 760;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', locale: 'en-US', ...(phone ? { isMobile: engine !== 'webkit', hasTouch: true } : {}) });
      await context.addInitScript(() => {
        window.__frames = 0;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => { window.__frames++; return raf(callback); };
        // The canvas is read back for the pause check: keep its last picture.
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) { return get.call(this, type, type === 'webgl2' ? { ...(attrs || {}), preserveDrawingBuffer: true } : attrs); };
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const requests = []; page.on('request', r => requests.push(r.url()));
      await page.goto(origin + '/');
      await page.locator('.zs').waitFor();
      await page.waitForTimeout(1200);
      const scripts = () => requests.filter(url => /\/assets\/[^/]+\.js$/.test(url)).length;
      const before = scripts();
      // Nothing of the 3D street is fetched before the page scrolls.
      assert.equal(await page.locator('.zs-3d canvas').count(), 0, `${at}: no canvas before a scroll`);
      await page.evaluate(() => scrollTo(0, 120));
      if (!(await mounted(page))) {
        // No 3D street in this build (or no WebGL 2 here): the drawn street stays, and nothing more was fetched for it.
        assert.equal(await page.locator('.zs-3d canvas').count(), 0, `${at}: no canvas`);
        assert.ok(await page.locator('.zs-pinned, .zs-stacked').count(), `${at}: the drawn street`);
        skipped = true;
        await context.close();
        continue;
      }
      assert.ok(scripts() > before, `${at}: the 3D street is a script of its own, fetched after the scroll`);
      assert.ok(await page.locator('.zs.zs-pinned').count(), `${at}: the stage is held`);
      // Before the cut the café and the dive are the page's own; after it the 3D street shows, fed the scroll.
      await along(page, -0.02);
      assert.equal(await page.evaluate(() => document.querySelector('.zs-stage').classList.contains('zs-3d-on')), false, `${at}: the dive is the page's own`);
      // Each station: its caption word for word, the rail up to it; the names by its anchors (wide) or the legend (phone).
      const stations = [0.15, 0.322, 0.54, 0.72, 0.87];
      for (const [k, q] of stations.entries()) {
        await along(page, q, 1100);
        assert.ok(await page.evaluate(() => document.querySelector('.zs-stage').classList.contains('zs-3d-on')), `${at}: the 3D street at station ${k + 1}`);
        assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), SAY[k], `${at}: station ${k + 1}'s caption`);
        assert.equal(await page.locator('.zs-stop.on').count(), k + 1, `${at}: the rail at station ${k + 1}`);
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-world')).visibility === 'visible' && [...document.querySelectorAll('.zs-station')].some(el => getComputedStyle(el).visibility === 'visible')), false, `${at}: the drawn stations are hidden under it`);
      }
      if (phone) {
        assert.equal(await page.locator('.zs-3d-labels').evaluate(el => getComputedStyle(el).display), 'none', `${at}: no labels at the stations on a phone`);
        assert.deepEqual(await page.locator('.zs-legend-row').evaluateAll(list => list.map(r => `${r.querySelector('b').textContent} ${r.querySelector('span').textContent}`)), LANDING_SAMPLE.shares.map(s => `${s.name} $${s.fiatShare}`), `${at}: the legend of the six`);
        assert.equal(await page.locator('.zs-legend').evaluate(el => getComputedStyle(el).display), 'grid', `${at}: shown under the caption`);
      } else {
        assert.deepEqual(await page.locator('.zs-3d-labels .zs-chip').evaluateAll(list => list.map(c => c.querySelector('b').textContent)), LANDING_SAMPLE.shares.map(s => s.name), `${at}: a label for each of the six`);
      }
      // Nightfall: over the 3D street's dusk the page's ground goes from white to ink; the header with it.
      await along(page, 0.9, 1100);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-stage')).backgroundColor), 'rgba(0, 0, 0, 0)', `${at}: day before the dusk`);
      await along(page, 1, 1600);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-stage')).backgroundColor), 'rgb(11, 12, 15)', `${at}: night at the end`);
      assert.ok(await page.evaluate(() => document.documentElement.classList.contains('lz-night')), `${at}: night glass on the header`);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-world')).visibility), 'hidden', `${at}: nothing drawn (not the café's picture) under the street at night`);
      assert.equal(await page.locator('.zs-hud-say.on').count(), 0, `${at}: no caption at night`);
      // The band after the street begins in the same ink: no white between them.
      assert.match(await page.locator('.lw-band').evaluate(el => getComputedStyle(el).backgroundImage), /^linear-gradient\(rgb\(11, 12, 15\)/, `${at}: the band begins in ink`);
      // Pause motion: the 3D street is held: no frame is asked for while it is paused, and its picture does not change.
      await page.evaluate(() => document.querySelector('.lz-motion').click());
      await page.waitForTimeout(300);
      const frames0 = await page.evaluate(() => window.__frames);
      const pixels = () => page.evaluate(() => { const c = document.querySelector('.zs-3d canvas'); return c.toDataURL('image/png').length; });
      const still0 = await pixels();
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(() => window.__frames), frames0, `${at}: no frame asked for while paused`);
      assert.equal(await pixels(), still0, `${at}: the picture holds`);
      await page.evaluate(() => document.querySelector('.lz-motion').click());
      assert.deepEqual(requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')), [], `${at}: nothing from another site`);
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }
    // The people's labels on a wide screen never overlap: 30 points along the 3D street (and the moments the rows and
    // the grid settle) at three widths; at the table and the bank the legend stands under the caption instead.
    for (const [width, height] of [[1280, 720], [1440, 900], [1512, 860]]) {
      const at = `${engine} ${width} labels`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', locale: 'en-US' });
      // Every frame is told it came 16.7 ms after the last, so that on a busy test machine the street's frame guard keeps
      // the 3D street on (what is checked here is where the labels stand, not how fast frames come).
      await context.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window);
        const realNow = performance.now.bind(performance);
        let real = -1, steady = realNow();
        performance.now = () => steady;
        window.requestAnimationFrame = callback => raf(ts => { if (ts !== real) { real = ts; steady += 16.7; } callback(steady); });
      });
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.zs').waitFor();
      await page.waitForTimeout(800);
      await page.evaluate(() => scrollTo(0, 120));
      if (!(await page.waitForFunction(() => document.querySelector('.zs.zs-3d-ready .zs-3d canvas') !== null, null, { timeout: 90000 }).then(() => true, () => false))) { await context.close(); continue; }
      const points = [...Array.from({ length: 30 }, (_, i) => 0.02 + (i / 29) * 0.96), 0.205, 0.214, 0.218, 0.222, 0.235, 0.33, 0.338, 0.344, 0.82, 0.85, 0.88].sort((x, y) => x - y);
      let shown = 0;
      for (const q of points) {
        await along(page, q, 320);
        const rects = await page.evaluate(() => [...document.querySelectorAll('.zs-3d-labels .zs-chip')]
          .filter(c => getComputedStyle(c.parentElement).display !== 'none' && Number(getComputedStyle(c).opacity) > 0.02)
          .map(c => { const r = c.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, c.querySelector('b').textContent]; }));
        shown += rects.length;
        for (let a = 0; a < rects.length; a++) {
          for (let b = a + 1; b < rects.length; b++) {
            const [A, B] = [rects[a], rects[b]];
            assert.ok(!(A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]), `${at}: at ${q.toFixed(3)} ${A[4]}'s and ${B[4]}'s labels overlap`);
          }
        }
      }
      assert.ok(shown > 0, `${at}: labels were shown along the way`);
      for (const q of [0.54, 0.72]) {
        await along(page, q, 700);
        assert.ok(await page.evaluate(() => document.querySelector('.zs-hud').classList.contains('zs-legend-on') && getComputedStyle(document.querySelector('.zs-legend')).display === 'grid'), `${at}: the legend at ${q}`);
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('.zs-3d-labels .zs-chip')].filter(c => Number(getComputedStyle(c).opacity) > 0.02).length), 0, `${at}: no labels at ${q}`);
      }
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }
    // Reduced motion: never loaded, whatever the scroll.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'en-US' });
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.zs.zs-stacked').waitFor();
      await page.evaluate(() => scrollTo(0, 3000));
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('.zs-3d canvas').count(), 0, `${engine}: reduced motion never loads the 3D street`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(skipped && !visits ? 'landing-street3d: no 3D street in this build (skipped)' : `landing-street3d: ${visits} visits passed${skipped ? ' (some engines without WebGL 2 kept the drawn street)' : ''}`);
