// Pause motion (WCAG 2.2.2): one button in the opening's navigation holds everything that moves and plays it again.
// Chromium and WebKit, a phone and a laptop: the button (its name says what it will do, with no aria-pressed; where it
// sits and how it looks), a pause that holds every element still for 1.5 s with no animation frame asked for, the
// sections coming into view while paused (nothing starts, the recording stays stopped), a resize while paused, playing
// again (the hero, the tiles, the ring, the recording), a pause in the middle of a running tile, the choice kept for
// the visit and not beyond it, the keyboard, a press in the very first moments, the system's reduce-motion setting,
// and the CSS loops that hold while their picture is off screen.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing-pause.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { splitItems } from '../../src/items.ts';
import { DEMO_ITEMS } from '../../src/demo.ts';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8764').replace(/\/$/, '');
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const dinner = splitItems(['Lena', 'Ana', 'Ben'], DEMO_ITEMS, '10');
assert.equal(dinner.kind, 'split');
const TICKS = DEMO_ITEMS.reduce((sum, item) => sum + item.people.length, 0);

// ── What the page reports ──
/** Counts the animation frames the page's own code asks for. */
const countFrames = () => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => { window.__frames++; return raf(callback); };
};
const frameCount = page => page.evaluate(() => window.__frames);
/** Waits for `n` frames (a pause is applied to the animations on the next one). */
const frames = (page, n = 2) => page.evaluate(count => new Promise(resolve => { const next = left => (left ? requestAnimationFrame(() => next(left - 1)) : resolve()); next(count); }), n);
/** Everything that can move, for every element of the opening and its two pseudo-elements: transforms, opacity, and the box. */
const snapshot = page => page.evaluate(() => {
  const name = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '');
  const rows = [];
  for (const el of document.querySelectorAll('.landing, .landing *')) {
    const row = [];
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      row.push(cs.transform, cs.translate, cs.rotate, cs.scale, cs.opacity);
    }
    const box = el.getBoundingClientRect();
    row.push(box.x.toFixed(2), box.y.toFixed(2), box.width.toFixed(2), box.height.toFixed(2));
    rows.push([name(el), row.join(' | ')]);
  }
  return rows;
});
/** What changed between two snapshots (the first few). */
const moved = (a, b) => (a.length !== b.length ? ['the number of elements changed'] : a.flatMap(([name, row], i) => (b[i][1] === row ? [] : [`${name}: ${row} -> ${b[i][1]}`]))).slice(0, 6);
/** The animations of the opening that are running, by name. */
const running = (page, root = '.landing') => page.evaluate(sel => document.querySelector(sel).getAnimations({ subtree: true })
  .filter(a => a.playState === 'running')
  .map(a => a.animationName || (a.transitionProperty ? `transition ${a.transitionProperty}` : `script ${a.effect?.target?.className || a.effect?.target?.tagName}`)), root);
/** The depth the cards are given by the pointer and the scroll: the transforms of the hero's layers, the translate of a tile's cards. */
const depthOfHero = page => page.locator('.lz-layer').evaluateAll(list => list.map(el => getComputedStyle(el).transform));
const depthOfTile = page => page.locator('.ls-a .ls-app').evaluateAll(list => list.map(el => getComputedStyle(el).translate));
const recording = page => page.evaluate(() => { const v = document.querySelector('.ls-phone video'); return { paused: v.paused, time: v.currentTime }; });
const scrollToEl = (page, selector, offset = 0) => page.evaluate(([sel, off]) => {
  const el = document.querySelector(sel);
  scrollTo(0, el.getBoundingClientRect().top + scrollY + off);
}, [selector, offset]);
/** Presses the button without scrolling to it, as an assistive technology or a keyboard shortcut can from anywhere. */
const press = page => page.evaluate(() => document.querySelector('.lz-motion').click());
/** What a button says of its state besides its name: no aria-pressed (the name says what it will do), and the picture. */
const pictured = button => button.evaluate(el => [el.hasAttribute('aria-pressed'), el.classList.contains('lz-play')]);
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Holds the page still: nothing of the opening changes in `ms`, and no frame is asked for. */
async function stays(page, where, ms = 1500) {
  await frames(page, 2);
  const a = await snapshot(page);
  const asked = await frameCount(page);
  const video = await recording(page);
  await page.waitForTimeout(ms);
  const b = await snapshot(page);
  assert.deepEqual(moved(a, b), [], `${where}: nothing moves for ${ms} ms`);
  assert.equal(await frameCount(page), asked, `${where}: no animation frame is asked for`);
  assert.deepEqual(await running(page), [], `${where}: no animation runs`);
  assert.deepEqual(await recording(page), video, `${where}: the recording holds`);
}

let visits = 0;
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  const tab = engine === 'webkit' ? 'Alt+Tab' : 'Tab'; // WebKit, like Safari, leaves links out of Tab unless asked
  try {
    // ── The button's place on every phone and laptop width: clear of the logo and of its neighbours ──
    for (const [width, height] of [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [1280, 900]]) {
      for (const motion of ['no-preference', 'reduce']) {
        const at = `${engine} ${width} ${motion}`;
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion, locale: 'en-US' });
        const page = await context.newPage();
        await page.goto(origin + '/');
        await page.locator('.landing h1').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const name = motion === 'reduce' ? 'Play motion' : 'Pause motion';
        const button = page.getByRole('button', { name, exact: true });
        assert.equal(await button.count(), 1, `${at}: one button`);
        const nav = page.getByRole('navigation', { name: 'Opening' });
        const items = await nav.evaluate(el => [...el.querySelectorAll('a, button')].filter(x => x.getClientRects().length).map(x => x.textContent.trim()));
        assert.deepEqual(items, width < 760 ? ['Sample dinner', name, 'Open Ztab'] : ['How it works', 'Sample dinner', name, 'Open Ztab'], `${at}: the button sits before Open Ztab`);
        const box = await button.boundingBox();
        const logo = await page.locator('.brand svg').boundingBox();
        assert.ok(box.height === 36 && (width < 760 ? box.width === 36 : box.width > 100), `${at}: 36 px tall, a picture alone on a phone (${box.width} × ${box.height})`);
        assert.ok(box.x >= logo.x + logo.width && box.x + box.width <= width, `${at}: between the logo and the edge (${Math.round(box.x)}–${Math.round(box.x + box.width)})`);
        for (const other of await nav.locator('a:visible, button:visible').all()) {
          if ((await other.textContent()).trim() === name) continue;
          assert.ok(!overlap(box, await other.boundingBox()), `${at}: clear of ${(await other.textContent()).trim()}`);
        }
        assert.ok(overlap(box, logo) === false, `${at}: clear of the logo`);
        const ticker = await page.locator('.lz-hero .lz-ticker').boundingBox();
        assert.ok(box.y + box.height <= ticker.y + 1, `${at}: above the ticker (${Math.round(box.y + box.height)} ≤ ${Math.round(ticker.y)})`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${at}: no sideways scroll`);
        // The words are there at every width: shown on a laptop, kept for a screen reader on a phone.
        const label = await button.locator('.lz-motion-label').evaluate(el => ({ text: el.textContent, shown: el.getBoundingClientRect().width > 4 }));
        assert.deepEqual(label, { text: name, shown: width >= 760 }, `${at}: the words`);
        // Made of the landing's own tokens: its grey fill, slate words, ui face, pill radius.
        const same = await button.evaluate(el => {
          const probe = document.createElement('i');
          probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--lz-grey);color:var(--lz-slate);font-family:var(--lz-ui);border-radius:var(--lz-radius-pill)';
          el.closest('.landing').append(probe);
          const own = getComputedStyle(el), want = getComputedStyle(probe);
          const result = { fill: own.backgroundColor === want.backgroundColor, ink: own.color === want.color, face: own.fontFamily === want.fontFamily, pill: own.borderTopLeftRadius === want.borderTopLeftRadius };
          probe.remove();
          return result;
        });
        assert.deepEqual(same, { fill: true, ink: true, face: true, pill: true }, `${at}: styled with the landing's tokens`);
        if (shots && (width === 390 || width === 1280)) await page.screenshot({ path: `${shots}/${engine}-pause-nav-${width}-${motion}.png`, clip: { x: 0, y: 0, width, height: 140 } });
        await context.close();
        visits++;
        console.log(`ok ${at}: the button's place`);
      }
    }

    // ── Reduce motion: the opening is already still; the button is there, reading Play motion, and cannot be pressed ──
    for (const width of [390, 1280]) {
      const at = `${engine} ${width} reduce`;
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, reducedMotion: 'reduce', locale: 'en-US' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const button = page.getByRole('button', { name: 'Play motion', exact: true });
      assert.deepEqual(await button.evaluate(el => [el.hasAttribute('aria-pressed'), el.disabled, el.title, el.classList.contains('lz-play')]), [false, true, 'Your device is set to reduce motion, so the page stays still.', true], `${at}: no aria-pressed, not available, says why, and shows the play picture`);
      assert.equal(await page.evaluate(() => document.querySelector('.landing').classList.contains('lz-paused')), false, `${at}: nothing was paused`);
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0, `${at}: the stills are kept, nothing moves`);
      // It is left out of the keyboard's way: the logo, the navigation, then the ways in.
      const order = [];
      for (let i = 0; i < 6; i++) { await page.keyboard.press(tab); order.push(await page.evaluate(() => { const el = document.activeElement; return el?.getAttribute('aria-label') || el?.textContent?.trim(); })); }
      assert.ok(!order.includes('Play motion'), `${at}: not in the tab order (${order.join(', ')})`);
      assert.equal(await page.getByRole('button', { name: 'Start a tab', exact: true }).count(), 1, `${at}: one control named Start a tab`);
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}: still, and the button says so`);
    }

    // ── With motion: pause, scroll through, resize, play, pause again in the middle of things ──
    for (const width of [390, 1280]) {
      const at = `${engine} ${width}`;
      const height = width < 600 ? 844 : 800;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', locale: 'en-US' });
      await context.addInitScript(countFrames);
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      // The phone's five screens are in and turning: everything of the first screen is moving.
      await page.waitForFunction(() => [...document.querySelectorAll('.lz-shot')].every(img => img.getAnimations().length > 0), null, { timeout: 8000 });
      await page.waitForTimeout(1900); // the entrance of the first screen is over
      const pause = page.getByRole('button', { name: 'Pause motion', exact: true });
      const play = page.getByRole('button', { name: 'Play motion', exact: true });
      assert.deepEqual(await pictured(pause), [false, false], `${at}: no aria-pressed, and two bars while it moves`);
      assert.equal(await page.getByRole('button', { name: 'Start a tab', exact: true }).count(), 1, `${at}: one control named Start a tab`);

      // It moves before the pause: otherwise holding it still would prove nothing.
      const s1 = await snapshot(page);
      await page.waitForTimeout(600);
      assert.notDeepEqual(moved(s1, await snapshot(page)), [], `${at}: the opening moves before it is paused`);
      const before = await running(page);
      for (const wanted of ['lz-marquee', 'lz-float']) assert.ok(before.includes(wanted), `${at}: ${wanted} runs (${[...new Set(before)].join(', ')})`);
      assert.ok(before.some(name => name.startsWith('script')), `${at}: and so do the animations made in script`);
      const coin = () => page.locator('.lz-coin').first().evaluate(el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return [m.m41, m.m42]; });

      // ── Pause, at the top ──
      if (shots) await page.screenshot({ path: `${shots}/${engine}-pause-${width}-running.png`, clip: { x: 0, y: 0, width, height: 140 } });
      await pause.click();
      await page.mouse.move(1, 1);
      assert.equal(await play.count(), 1, `${at}: the button now reads Play motion`);
      assert.deepEqual(await pictured(play), [false, true], `${at}: still no aria-pressed: its name flipped, and the picture is a triangle`);
      assert.equal(await page.getByRole('button', { name: 'Pause motion', exact: true }).count(), 0, `${at}: Pause motion is gone while it is paused`);
      assert.ok(await page.evaluate(() => document.querySelector('.landing').classList.contains('lz-paused')), `${at}: the root class is on`);
      await stays(page, `${at} paused at the top`);
      // The page scrolls, and the hero's cards keep the depth they had: the scroll no longer moves them against each other.
      const layers = await depthOfHero(page);
      await page.evaluate(() => scrollBy(0, 150));
      await page.waitForTimeout(400);
      assert.deepEqual(await depthOfHero(page), layers, `${at}: the hero's cards ignore the scroll while paused`);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      if (width >= 760) {
        // How it works goes there at once while paused (a smooth scroll is still on its way after 120 ms).
        await page.getByRole('button', { name: 'How it works', exact: true }).click();
        await page.waitForTimeout(120);
        const top = await page.evaluate(() => Math.round(document.querySelector('#how-it-works').getBoundingClientRect().top));
        assert.ok(Math.abs(top) < 4, `${at}: How it works jumps, it does not scroll smoothly, while paused (${top} px from the top)`);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(200);
      }
      if (shots) await page.screenshot({ path: `${shots}/${engine}-pause-${width}-paused.png`, clip: { x: 0, y: 0, width, height: 140 } });

      // ── Scroll through while it is paused: nothing starts, each tile is a still, the figures are there, the recording stays stopped ──
      for (const section of ['.ls-a', '.ls-b', '.ls-c', '.ls-d', '.ls-e', '.ls-ring', '.ls-counts', '.ls-band', '.lz-cta']) {
        await scrollToEl(page, section, section === '.ls-band' || section === '.lz-cta' ? 0 : -40);
        await page.waitForTimeout(150);
        assert.deepEqual(await running(page), [], `${at}: nothing eases in as ${section} comes into view while paused`);
        await page.waitForTimeout(450);
        await stays(page, `${at} paused at ${section}`, 1000);
        if (section === '.ls-a') {
          const cards = await depthOfTile(page);
          await page.evaluate(() => scrollBy(0, 90));
          await page.waitForTimeout(300);
          assert.deepEqual(await depthOfTile(page), cards, `${at}: the tile's cards ignore the scroll while paused`);
          await page.evaluate(() => scrollBy(0, -90));
          await page.waitForTimeout(200);
          assert.equal(await page.locator('.ls-a .ls-pick.on').count(), TICKS, `${at}: the items tile is its still, every line has its people`);
          assert.equal(await page.locator('.ls-a .ls-grand .ls-fig span:last-child').textContent(), `$${dinner.total}`, `${at}: and the app's own total`);
        }
        if (section === '.ls-b') {
          // Playing with the tile in view starts it from the beginning; pausing again holds it where it has got to.
          assert.equal(await page.locator('.ls-b .ls-btn-ink.done').count(), 0, `${at}: the links tile is its still`);
          await press(page);
          await page.waitForSelector('.ls-b .ls-btn-ink.done', { timeout: 9000 });
          await press(page);
          await stays(page, `${at} paused again in the middle of the links tile`, 800);
        }
        if (section === '.ls-c') assert.equal(await page.locator('.ls-c .ls-pr.on').count(), 1, `${at}: one name chosen on the picker`);
        if (section === '.ls-d') assert.deepEqual(await page.locator('.ls-d .ls-pay-in').evaluate(el => [el.classList.contains('ls-away'), getComputedStyle(el).opacity]), [false, '1'], `${at}: the pay page is shown`);
        if (section === '.ls-e') assert.equal(await page.locator('.ls-e .ls-receipt').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42), 0, `${at}: the receipt is printed`);
        if (section === '.ls-ring') {
          assert.deepEqual(await page.locator('.ls-ring-spin').evaluate(el => el.getAnimations().map(a => a.playState)), ['paused'], `${at}: the ring is held`);
        }
        if (section === '.ls-counts') assert.equal((await page.locator('.ls-count-num').allTextContents()).join(), '67,6,4,0', `${at}: the figures are there, none half counted`);
        if (section === '.ls-band') {
          assert.equal((await recording(page)).paused, true, `${at}: the recording does not start when the phone comes into view`);
          assert.equal(await page.locator('.ls-phone video').getAttribute('poster'), '/landing/sections-pay-poster.webp', `${at}: it shows its still`);
        }
        if (section === '.lz-cta') {
          assert.equal(await page.locator('.lz-cta').evaluate(el => el.classList.contains('lz-in')), false, `${at}: the Z does not assemble while paused`);
          assert.equal(await page.locator('.lz-m1').evaluate(el => getComputedStyle(el).opacity), '1', `${at}: it is whole`);
          // Played with it in view, it comes together; paused in the middle of that, it is brought to its end.
          await press(page);
          await page.waitForFunction(() => document.querySelector('.lz-cta').classList.contains('lz-in'), null, { timeout: 3000 });
          await page.waitForTimeout(250);
          await press(page);
          await frames(page, 3);
          assert.deepEqual(await page.locator('.lz-m1, .lz-m2, .lz-m3').evaluateAll(list => list.map(el => [getComputedStyle(el).opacity, new DOMMatrixReadOnly(getComputedStyle(el).transform).isIdentity])), [['1', true], ['1', true], ['1', true]], `${at}: paused as it came together, the Z is whole`);
          await stays(page, `${at} paused again at the Z`, 800);
        }
      }

      // ── A resize while paused makes the hero lay itself out again; what it makes does not move ──
      await scrollToEl(page, '.landing', 0);
      await page.setViewportSize({ width: width - 40, height });
      await page.waitForTimeout(900);
      await stays(page, `${at} paused after a resize`, 1000);
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(900);
      await stays(page, `${at} paused after the size is back`, 1000);

      // ── Play ──
      const held = await coin();
      await play.click();
      await page.mouse.move(1, 1);
      assert.equal(await pause.count(), 1, `${at}: the button reads Pause motion again`);
      assert.deepEqual(await pictured(pause), [false, false], `${at}: with no aria-pressed, and two bars`);
      assert.equal(await page.evaluate(() => document.querySelector('.landing').classList.contains('lz-paused')), false, `${at}: the root class is off`);
      await frames(page, 3);
      // The orbit carries on from where it stopped; it does not jump ahead by the time it was held.
      const [x0, y0] = held, [x1, y1] = await coin();
      assert.ok(Math.hypot(x1 - x0, y1 - y0) < 25, `${at}: the orbit carries on from where it stopped (${Math.round(Math.hypot(x1 - x0, y1 - y0))} px)`);
      const layersNow = await depthOfHero(page);
      await page.evaluate(() => scrollBy(0, 150));
      await page.waitForTimeout(500);
      assert.notDeepEqual(await depthOfHero(page), layersNow, `${at}: the hero's cards follow the scroll again`);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(300);
      const asked = await frameCount(page);
      const t1 = await snapshot(page);
      await page.waitForTimeout(900);
      assert.notDeepEqual(moved(t1, await snapshot(page)), [], `${at}: it moves again`);
      assert.ok(await frameCount(page) > asked, `${at}: the parallax and the orbit ask for frames again`);
      const again = await running(page);
      for (const wanted of ['lz-marquee', 'lz-float']) assert.ok(again.includes(wanted), `${at}: ${wanted} runs again`);
      assert.ok(again.some(name => name.startsWith('script')), `${at}: and so do the animations made in script`);
      // The tiles that were stills start from the beginning when they are seen again; the ring turns; the recording plays.
      await scrollToEl(page, '.ls-a', -40);
      await page.waitForFunction(ticks => { const on = document.querySelectorAll('.ls-a .ls-pick.on').length; return on > 0 && on < ticks; }, TICKS, { timeout: 9000, polling: 40 });
      const cardsNow = await depthOfTile(page);
      await page.evaluate(() => scrollBy(0, 90));
      await page.waitForTimeout(400);
      assert.notDeepEqual(await depthOfTile(page), cardsNow, `${at}: the tile's cards follow the scroll again`);
      await scrollToEl(page, '.ls-ring', -60);
      await page.waitForTimeout(500);
      assert.deepEqual(await page.locator('.ls-ring-spin').evaluate(el => el.getAnimations().map(a => a.playState)), ['running'], `${at}: the ring turns again`);
      await scrollToEl(page, '.ls-band', 0);
      await page.waitForFunction(() => { const v = document.querySelector('.ls-phone video'); return v && !v.paused && v.currentTime > 0.2; }, null, { timeout: 9000 });

      // ── Pause in the middle of things (pressed from where it cannot be seen: a keyboard shortcut, a screen reader) ──
      await scrollToEl(page, '.ls-a', -40);
      await page.waitForFunction(() => document.querySelectorAll('.ls-a .ls-pick.on').length > 0, null, { timeout: 9000 });
      const tile = () => page.evaluate(() => [...document.querySelectorAll('.ls-a .ls-pick')].map(p => +p.classList.contains('on')).join('') + document.querySelector('.ls-a .ls-grand .ls-fig').textContent);
      await press(page);
      await stays(page, `${at} paused in the middle of the items tile`);
      const frozen = await tile();
      await press(page);
      await page.waitForFunction(was => {
        const now = [...document.querySelectorAll('.ls-a .ls-pick')].map(p => +p.classList.contains('on')).join('') + document.querySelector('.ls-a .ls-grand .ls-fig').textContent;
        return now !== was;
      }, frozen, { timeout: 12000 });
      await scrollToEl(page, '.ls-ring', -60);
      await page.waitForTimeout(500);
      const turn = () => page.locator('.ls-ring-spin').evaluate(el => getComputedStyle(el).transform);
      await press(page);
      await stays(page, `${at} paused while the ring turns`);
      const ringHeld = await turn();
      await press(page);
      await page.waitForTimeout(600);
      assert.notEqual(await turn(), ringHeld, `${at}: the ring turns on from there`);
      await scrollToEl(page, '.ls-band', 0);
      await page.waitForFunction(() => { const v = document.querySelector('.ls-phone video'); return v && !v.paused && v.currentTime > 0.2; }, null, { timeout: 9000 });
      await press(page);
      await frames(page, 2);
      const stopped = await recording(page);
      assert.equal(stopped.paused, true, `${at}: the recording is stopped by the pause`);
      await page.waitForTimeout(1200);
      assert.deepEqual(await recording(page), stopped, `${at}: and holds its place`);
      await press(page);
      await page.waitForFunction(was => { const v = document.querySelector('.ls-phone video'); return !v.paused && v.currentTime > was + 0.3; }, stopped.time, { timeout: 9000 });

      // ── The choice is for this visit: it stays when the steps are opened and closed, and a new visit starts with motion ──
      await scrollToEl(page, '.landing', 0);
      await pause.click();
      await page.getByRole('button', { name: 'Start a tab', exact: true }).first().click();
      await page.waitForFunction(() => document.activeElement?.matches('.flow .step-title'));
      await page.goBack();
      await page.locator('.landing').waitFor();
      assert.equal(await play.count(), 1, `${at}: still reads Play motion after the steps are opened and closed`);
      await stays(page, `${at} paused after Back`);
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, ''], `${at}: nothing is kept in the browser`);
      await page.reload();
      await page.locator('.landing h1').waitFor();
      assert.equal(await pause.count(), 1, `${at}: a new visit starts with motion, and reads Pause motion`);
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}: pause, scroll, resize, play, pause mid-turn, the visit`);
    }

    // ── The keyboard: the button comes after Sample dinner and before Open Ztab, shows its focus, and works with Enter and Space ──
    for (const width of [390, 1280]) {
      const at = `${engine} ${width} keyboard`;
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, reducedMotion: 'no-preference', locale: 'en-US' });
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      const order = [];
      for (let i = 0; i < 6; i++) { await page.keyboard.press(tab); order.push(await page.evaluate(() => { const el = document.activeElement; return el?.getAttribute('aria-label') || el?.textContent?.trim(); })); }
      assert.deepEqual(order, width < 760
        ? ['Ztab, start a new tab', 'Sample dinner', 'Pause motion', 'Open Ztab', 'Start a tab', 'Try a sample dinner']
        : ['Ztab, start a new tab', 'How it works', 'Sample dinner', 'Pause motion', 'Open Ztab', 'Start a tab'], `${at}: tab order`);
      // Back on the button by the keyboard alone.
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      for (let i = 0; i <= order.indexOf('Pause motion'); i++) await page.keyboard.press(tab);
      const state = () => page.evaluate(() => [document.activeElement?.classList.contains('lz-motion'), document.activeElement?.hasAttribute('aria-pressed'), document.activeElement?.textContent.trim()]);
      assert.deepEqual(await state(), [true, false, 'Pause motion'], `${at}: the keyboard is on the button`);
      assert.deepEqual(await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return [cs.outlineStyle, cs.outlineWidth]; }), ['solid', '2px'], `${at}: it shows its focus`);
      await page.keyboard.press('Enter');
      assert.deepEqual(await state(), [true, false, 'Play motion'], `${at}: Enter pauses, the name flips, and the focus stays`);
      await page.keyboard.press('Space');
      assert.deepEqual(await state(), [true, false, 'Pause motion'], `${at}: Space plays, the name flips back, and the focus stays`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }

    // ── Pressed in the very first moments: the entrance is brought to its end, not left half drawn ──
    {
      const at = `${engine} first moments`;
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference', locale: 'en-US' });
      await context.addInitScript(countFrames);
      let midway = false;
      let page;
      for (let attempt = 0; attempt < 4 && !midway; attempt++) {
        page = await context.newPage();
        await page.goto(origin + '/', { waitUntil: 'commit' });
        await page.waitForFunction(() => document.querySelector('.lz-key')?.getAnimations().some(a => a.playState === 'running'), null, { timeout: 8000 });
        midway = await page.evaluate(() => {
          const was = document.querySelector('.lz-key').getAnimations().some(a => a.playState === 'running' && a.currentTime < 1200);
          document.querySelector('.lz-motion').click();
          return was;
        });
        if (!midway) await page.close();
      }
      assert.ok(midway, `${at}: pressed while the headline was still coming in`);
      await frames(page, 3);
      const look = await page.evaluate(() => ['.lz-key', '.lz-ticker', '.lz-hero .lz-actions', '.lz-stage'].map(sel => {
        const cs = getComputedStyle(document.querySelector(sel));
        // An animation that has reached its end still reports its transform as a matrix: the identity is "in place".
        const inPlace = cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)';
        return [sel, cs.opacity, inPlace, sel === '.lz-key' ? cs.color : '', sel === '.lz-key' ? cs.textShadow.replace(/rgba?\([^)]*\)\s*/, '') : ''];
      }));
      assert.deepEqual(look, [
        ['.lz-key', '1', true, 'rgb(43, 47, 58)', '0px 0px 0px'],
        ['.lz-ticker', '1', true, '', ''],
        ['.lz-hero .lz-actions', '1', true, '', ''],
        ['.lz-stage', '1', true, '', ''],
      ], `${at}: nothing is left half drawn`);
      // The loops the hero makes after the press (the phone's screens come in a moment after the page has loaded) are made paused.
      await page.waitForFunction(() => [...document.querySelectorAll('.lz-shot')].every(img => img.getAnimations().length > 0), null, { timeout: 9000 });
      await stays(page, `${at} paused`);
      assert.equal(await page.getByRole('button', { name: 'Play motion', exact: true }).count(), 1, `${at}: it reads Play motion`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }

    // ── The CSS loops that run on their own hold while their picture is off screen ──
    for (const width of [390, 1280]) {
      const at = `${engine} ${width} loops`;
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, reducedMotion: 'no-preference', locale: 'en-US' });
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      const states = (selector) => page.evaluate(sel => [...document.querySelectorAll(sel)].flatMap(el => el.getAnimations()).map(a => a.playState), selector);
      const floats = await states('.lz-float');
      assert.ok(floats.length >= 4 && floats.every(s => s === 'running'), `${at}: the floating cards run while the stage is on screen (${floats})`);
      // (A picture that is exactly edge to edge with the screen still counts as seen: go a little past it.)
      await scrollToEl(page, '.ls-bento', 40);
      await page.waitForTimeout(500);
      assert.ok((await states('.lz-float')).every(s => s === 'paused'), `${at}: and are held when it is off screen`);
      await scrollToEl(page, '.lz-cta', 0);
      await page.waitForFunction(() => document.querySelector('.lz-cta').classList.contains('lz-in'), null, { timeout: 5000 });
      await page.waitForTimeout(500);
      assert.deepEqual(await states('.lz-m-shine'), ['running'], `${at}: the light along the Z runs while the Z is on screen`);
      await scrollToEl(page, '.ls-bento', 40);
      await page.waitForTimeout(500);
      assert.deepEqual(await states('.lz-m-shine'), ['paused'], `${at}: and is held when the Z is off screen`);
      await scrollToEl(page, '.landing', 0);
      await page.waitForTimeout(500);
      assert.ok((await states('.lz-float')).every(s => s === 'running'), `${at}: the floats run again when the stage is back`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }
  } finally {
    await browser.close();
  }
}
console.log(`landing-pause: ${visits} visits passed`);
