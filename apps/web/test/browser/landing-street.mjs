// The Ztab street: held on a wide screen while the page scrolls (one camera move from the café table, through the ink
// of the bill folder, down five stations), one station under another on a phone, still pictures with reduced motion,
// and stills while the motion is paused. Chromium and WebKit: the captions word for word at each station, the rail,
// the scenes drawn from the engine's split, the pictures asked for only as the camera nears them, no layout shift while
// the stage is held, no sideways scroll, no request to another origin.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing-street.mjs
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
const CARDS = LANDING_SAMPLE.shares.map(s => `${s.name} $${s.fiatShare}`);
const FRIENDS = LANDING_SAMPLE.shares.filter(s => !s.own).map(s => s.name);
const frames = (page, n = 2) => page.evaluate(count => new Promise(resolve => { const next = left => (left ? requestAnimationFrame(() => next(left - 1)) : resolve()); next(count); }), n);
/** Scrolls to progress p of the street's stage (0 to 1) and lets the camera settle. */
const along = async (page, p, wait = 900) => {
  await page.evaluate(v => { const s = document.querySelector('.zs'); const top = s.getBoundingClientRect().top + scrollY; scrollTo(0, top + v * (s.offsetHeight - innerHeight)); }, p);
  await page.waitForTimeout(wait);
};
/** Where each station is centred, in the stage's progress: read from the beats the street lays out (its stays). */
const centres = page => page.evaluate(() => {
  const s = document.querySelector('.zs');
  const len = Number(getComputedStyle(s).getPropertyValue('--zs-len')) - 1;
  // The beats in screen heights, as landing-street.ts lays them out: lift, rest, dive, open, stay, (travel, stay) x 4, wide.
  const beats = [0.7, 0.15, 0.8, 0.55, 0.62, ...Array(4).fill([0.48, 0.62]).flat(), 0.9];
  const total = beats.reduce((a, b) => a + b, 0);
  if (Math.abs(total - len) > 0.01) throw new Error(`the beats changed: ${total} vs ${len}`);
  let run = 0;
  const ends = beats.map(b => (run += b) / total);
  const stays = [4, 6, 8, 10, 12];
  const k = stays.map(i => (ends[i - 1] + ends[i]) / 2);
  return { k, cut: ends[2], lift: ends[0], rest: ends[1] };
});

let visits = 0;
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    // ── A wide screen with motion: the stage is held while the camera moves ──
    for (const [width, height] of [[1440, 900], [1280, 800]]) {
      const at = `${engine} ${width} motion`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', locale: 'en-US' });
      // The drawn street is the 3D street's fallback: the 3D street here fails to start, as without WebGL 2.
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' }));
      await context.addInitScript(() => {
        window.__cls = 0;
        try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { window.__cls = null; }
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const requests = []; page.on('request', r => requests.push(r.url()));
      await page.goto(origin + '/');
      await page.locator('.zs.zs-pinned').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-stage')).position), 'sticky', `${at}: the stage is held`);
      // Nothing of the street is asked for before the page moves.
      assert.ok(!requests.some(url => /\/landing\/street-/.test(url)), `${at}: no station picture on arrival`);
      const { k, cut, lift, rest } = await centres(page);
      // The first screen: the words, and the whole picture of the dinner above the fold; no caption yet.
      assert.equal(await page.locator('.zs-hud-say.on').count(), 0, `${at}: no caption on the first screen`);
      const art = () => page.evaluate(() => { const r = document.querySelector('.lz-frame').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width }; });
      const rest0 = await art();
      assert.ok(rest0.bottom <= height - 24 && rest0.left >= 0 && rest0.right <= width, `${at}: the whole picture above the fold (${Math.round(rest0.bottom)} <= ${height - 24})`);
      // Phase one: the words lift away while the picture rises, whole and no nearer, to the middle; it rests there.
      await along(page, lift * 0.5, 1200);
      const half = await art();
      assert.ok(half.width <= rest0.width * 1.13 && half.top >= 0 && half.bottom <= height, `${at}: half way up the picture is whole (${Math.round(half.top)}..${Math.round(half.bottom)})`);
      await along(page, (lift + rest) / 2, 1200);
      const centred = await art();
      assert.ok(centred.top >= 0 && centred.bottom <= height && Math.abs((centred.left + centred.right) / 2 - width / 2) < 2, `${at}: at rest, whole and in the middle`);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.lz-hero')).visibility), 'hidden', `${at}: the first screen's words are gone`);
      // The dive: the picture is never brought nearer than 1.5 times; a drawn copy of the folder (no see-through wash) at
      // its true size opens like a book (its cover turning on its near edge, the bill inside), stays smaller than the
      // table till the last tenth of the dive, then the pocket in its cover covers the screen at the cut.
      const folderBox = () => page.evaluate(() => {
        const parts = ['.zs-cut-inside', '.zs-cut-cover'].map(s => document.querySelector(s).getBoundingClientRect());
        const cafe = document.querySelector('.zs-cafe img').getBoundingClientRect();
        return { w: Math.max(...parts.map(r => r.right)) - Math.min(...parts.map(r => r.left)), table: cafe.width * 0.36, receipt: document.querySelector('.zs-cut-receipt').getBoundingClientRect().width };
      });
      await along(page, cut - (cut - rest) * 0.15, 1600);
      const late = await folderBox();
      assert.ok(late.w > 0 && late.w < late.table && late.receipt > 0, `${at}: at 0.85 of the dive the open folder is smaller than the table (${Math.round(late.w)} < ${Math.round(late.table)} px), the bill inside`);
      await along(page, cut - (cut - rest) * 0.4, 1600);
      const opening = await page.evaluate(() => {
        const svg = document.querySelector('.zs-cutter');
        return { book: svg.classList.contains('zs-book'), cover: getComputedStyle(svg.querySelector('.zs-cut-cover')).display, inner: svg.querySelector('.zs-cut-cover').classList.contains('zs-cover-inner') };
      });
      assert.deepEqual(opening, { book: true, cover: 'inline', inner: true }, `${at}: the folder opens like a book, its cover turned past upright`);
      await along(page, cut - 0.0015, 1600);
      const scale = await page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('.zs-world').style.transform)?.[1]));
      assert.ok(scale <= 1.5001 * Math.min(1.12, 2), `${at}: no nearer than 1.5 times its first size (${scale})`);
      const cover = await page.evaluate(() => {
        const svg = document.querySelector('.zs-cutter'), poly = svg.querySelector('.zs-cut-pocket');
        const pts = poly.getAttribute('points').split(' ').map(q => q.split(',').map(Number));
        const inside = (x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4]; s += Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); } return Math.abs(s) === 4; };
        const cs = getComputedStyle(svg);
        return { shown: cs.visibility === 'visible' && cs.opacity === '1', corners: [[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]].every(([x, y]) => inside(x, y)), fill: getComputedStyle(poly).fill };
      });
      assert.deepEqual(cover, { shown: true, corners: true, fill: 'rgb(46, 45, 49)' }, `${at}: the pocket's charcoal covers the screen at the cut`);
      // Each station: its caption word for word, the rail's stops up to it, its picture in, nothing sideways.
      for (let i = 0; i < 5; i++) {
        await along(page, k[i], 1500);
        assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), SAY[i], `${at}: station ${i + 1}'s caption`);
        assert.equal(await page.locator('.zs-stop.on').count(), i + 1, `${at}: the rail at station ${i + 1}`);
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-cutter')).visibility), 'hidden', `${at}: no charcoal at a station`);
        const art = await page.locator('.zs-station').nth(i).locator('.zs-art img').evaluate(img => ({ src: img.currentSrc, w: img.naturalWidth }));
        await page.waitForFunction(i => document.querySelectorAll('.zs-station')[i].querySelector('.zs-art img').naturalWidth > 0, i, { timeout: 6000 });
        assert.match(art.src || (await page.locator('.zs-station').nth(i).locator('.zs-art img').evaluate(img => img.currentSrc)), /\/landing\/street-(bill|links|table|wallet|ledger)-(960|1600)\.(avif|webp)$/, `${at}: station ${i + 1}'s picture`);
        // The station stands in the screen, right of the captions.
        const box = await page.locator('.zs-station').nth(i).locator('.zs-tile').boundingBox();
        assert.ok(box.x + box.width * 0.5 > width * 0.45 && box.x + box.width * 0.5 < width * 0.85, `${at}: station ${i + 1} framed on the right (${Math.round(box.x)}, ${Math.round(box.width)})`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${at}: no sideways scroll at station ${i + 1}`);
        if (i === 1) {
          // The six link cards on their wires: the engine's split of the sample dinner.
          assert.deepEqual(await page.locator('.zs-links .zs-chip').evaluateAll(list => list.map(c => `${c.querySelector('b').textContent} ${c.querySelector('span').textContent}`)), CARDS, `${at}: the six cards`);
          assert.ok(await page.locator('.zs-links .zs-chip').evaluateAll(list => list.every(c => Number(getComputedStyle(c).opacity) > 0.9)), `${at}: named and shown in the middle of the stay`);
        }
        if (i === 2) assert.deepEqual(await page.locator('.zs-table .zs-tagname').allTextContents(), FRIENDS.slice(0, 3), `${at}: the names in the tags`);
      }
      // The end: the whole street, no caption; night falls on it (the stage's ground goes to the page's ink, the header
      // with it), and the stage lets go of the screen onto the band, which begins in the same ink.
      await along(page, 0.95, 1500);
      assert.equal(await page.locator('.zs-hud-say.on').count(), 0, `${at}: no caption over the whole street`);
      await along(page, 1, 1800);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zs-stage')).backgroundColor), 'rgb(11, 12, 15)', `${at}: night at the end`);
      assert.ok(await page.evaluate(() => document.documentElement.classList.contains('lz-night')), `${at}: night glass on the header`);
      assert.match(await page.locator('.lw-band').evaluate(el => getComputedStyle(el).backgroundImage), /^linear-gradient\(rgb\(11, 12, 15\)/, `${at}: the band begins in ink`);
      await page.evaluate(() => { const s = document.querySelector('.zs'); scrollTo(0, s.getBoundingClientRect().top + scrollY + s.offsetHeight); });
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => document.querySelector('.zs-stage').getBoundingClientRect().bottom <= 1), `${at}: the stage has gone up with the page`);
      const cls = await page.evaluate(() => window.__cls);
      if (cls !== null) assert.ok(cls < 0.1, `${at}: no layout shift while the stage is held (${cls.toFixed(3)})`);
      // Only this site's files; the 3D street was asked for once (and failed to start here), and the drawn street stayed.
      assert.deepEqual(requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')), [], `${at}: nothing from another site`);
      assert.equal(await page.locator('.zs-3d canvas').count(), 0, `${at}: the drawn street stayed`);
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }

    // ── Paused on a wide screen: stills only, at the first screen or a station ──
    {
      const at = `${engine} 1440 paused`;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', locale: 'en-US' });
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' }));
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.zs.zs-pinned').waitFor();
      const { k } = await centres(page);
      await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
      // Half way along the way from station 2 to 3, the camera stands at the nearer station's still.
      const world = () => page.evaluate(() => document.querySelector('.zs-world').style.transform);
      await along(page, k[1], 600);
      const still2 = await world();
      await along(page, k[1] + (k[2] - k[1]) * 0.3, 600);
      assert.equal(await world(), still2, `${at}: between stations the camera stays at the nearer still`);
      assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), SAY[1], `${at}: and its caption`);
      await along(page, k[1] + (k[2] - k[1]) * 0.7, 600);
      assert.notEqual(await world(), still2, `${at}: past half way it is the next station's still`);
      assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), SAY[2], `${at}: and its caption`);
      // Held still: nothing changes without a scroll.
      const a = await world();
      await page.waitForTimeout(1200);
      assert.equal(await world(), a, `${at}: nothing moves`);
      assert.equal(await page.evaluate(() => document.querySelector('.zs').getAnimations({ subtree: true }).filter(x => x.playState === 'running').length), 0, `${at}: no animation runs`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }

    // ── A phone with motion (the stage held, for the 3D street; here its drawn street): each station in the upper part
    //    of the screen, its caption and the rail under it ──
    {
      const at = `${engine} 390 motion`;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', locale: 'en-US', isMobile: engine !== 'webkit', hasTouch: true });
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' }));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/');
      await page.locator('.zs.zs-pinned.zs-portrait').waitFor();
      const { k } = await centres(page);
      const settle = async p => {
        await along(page, p, 200);
        await page.waitForFunction(want => Math.abs(Number(document.querySelector('.zs').dataset.p) - want) < 0.0015, p, { timeout: 15000, polling: 50 });
        await page.waitForTimeout(700);
      };
      for (let i = 0; i < 5; i++) {
        await settle(k[i]);
        assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), SAY[i], `${at}: station ${i + 1}'s caption`);
        const tile = await page.locator('.zs-station').nth(i).locator('.zs-tile').boundingBox();
        const say = await page.locator('.zs-hud-say.on').boundingBox();
        assert.ok(tile.y + tile.height / 2 < 844 * 0.5 && tile.x + tile.width / 2 > 120 && tile.x + tile.width / 2 < 270, `${at}: station ${i + 1} in the upper middle (${Math.round(tile.x)}, ${Math.round(tile.y)})`);
        assert.ok(say.y > 844 * 0.6 && say.x >= 0 && say.x + say.width <= 390, `${at}: its caption under it (${Math.round(say.y)})`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${at}: no sideways scroll at station ${i + 1}`);
      }
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }

    // ── Reduced motion, a laptop and a phone: still pictures with their captions, nothing held, nothing moving ──
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const at = `${engine} ${width} reduce`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'en-US' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/');
      await page.locator('.zs.zs-stacked').waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0, `${at}: nothing moves`);
      if (width >= 760) {
        // The picture of the dinner fits the first screen under the words, as with motion.
        const fit = await page.evaluate(() => { const r = document.querySelector('.zs-cafe .lz-art img').getBoundingClientRect(); return { bottom: r.bottom, vh: innerHeight }; });
        assert.ok(fit.bottom <= fit.vh - 16, `${at}: the dinner fits the first screen (${Math.round(fit.bottom)} of ${fit.vh})`);
      }
      assert.deepEqual((await page.locator('.zs-say').allTextContents()).map(flat), SAY, `${at}: every caption`);
      assert.ok(await page.locator('.zs-station-in').evaluateAll(list => list.every(el => getComputedStyle(el).position !== 'sticky')), `${at}: no station is held`);
      // After the last station night falls on the page itself: a fade from white to the band's ink.
      assert.match(await page.locator('.zs-nightfall').evaluate(el => getComputedStyle(el).backgroundImage), /linear-gradient\(rgb\(255, 255, 255\), rgb\(11, 12, 15\)\)/, `${at}: the page's own nightfall`);
      // The scenes as they stand in the middle of their stays: the cards named on their wires, the ring all but full, the names in their tags.
      assert.ok(await page.locator('.zs-links .zs-chip').evaluateAll(list => list.every(c => getComputedStyle(c).opacity === '1')), `${at}: the six cards are named`);
      assert.ok(await page.locator('.zs-ledger .zs-ring').evaluate(r => parseFloat(getComputedStyle(r).strokeDashoffset)) < 0.05, `${at}: the ring is all but full`);
      assert.ok(await page.locator('.zs-table .zs-tagname').evaluateAll(list => list.every(n => getComputedStyle(n).opacity === '1')), `${at}: the names are in their tags`);
      for (const sel of ['.zs-bill', '.zs-ledger']) {
        await page.locator(sel).scrollIntoViewIfNeeded();
        await page.waitForFunction(s => document.querySelector(s).querySelector('.zs-art img').naturalWidth > 0, sel, { timeout: 6000 });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${at}: no sideways scroll`);
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }
    // ── Reduced motion at the other laptop sizes: the dinner fits the first screen ──
    for (const [width, height] of [[1280, 720], [1366, 768], [1512, 860]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'en-US' });
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.zs.zs-stacked').waitFor();
      await page.waitForTimeout(200);
      const fit = await page.evaluate(() => { const r = document.querySelector('.zs-cafe .lz-art img').getBoundingClientRect(); return { bottom: r.bottom, vh: innerHeight }; });
      assert.ok(fit.bottom <= fit.vh - 16, `${engine} ${width} reduce: the dinner fits the first screen (${Math.round(fit.bottom)} of ${fit.vh})`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(`landing-street: ${visits} visits passed`);
