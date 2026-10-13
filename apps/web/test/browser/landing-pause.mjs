// Pause motion (WCAG 2.2.2): one button in the opening's navigation holds everything that moves and plays it again.
// Chromium and WebKit, a phone and a laptop: the button (its name says what it will do, with no aria-pressed; where it
// sits and how it looks), a pause that holds every element still for 1.5 s with no animation frame asked for, the
// street held at its stills while the page is scrolled (the camera stands at the first screen or at a station), the
// sections coming into view while paused (nothing starts, the recording stays stopped), a resize while paused, playing
// again (the dinner, the street, the ring, the recording), a pause in the middle of the camera's move, the choice kept
// for the visit and not beyond it, the keyboard, a press in the very first moments, the system's reduce-motion
// setting, and the CSS loops that hold while their picture is off screen.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing-pause.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8764').replace(/\/$/, '');
const shots = process.env.SHOTS;
const flat = text => text.replace(/\s+/g, ' ').trim();
if (shots) mkdirSync(shots, { recursive: true });


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
/** Where the street's camera stands: the transform of its world. */
const camera = page => page.evaluate(() => document.querySelector('.zs-world').style.transform);
/** Scrolls to progress p of the street's stage (0 to 1). */
const along = (page, p) => page.evaluate(v => { const s = document.querySelector('.zs'); scrollTo(0, s.getBoundingClientRect().top + scrollY + v * Math.max(0, s.offsetHeight - innerHeight)); }, p);
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
        await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
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
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
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
      const wide = width >= 760;
      // The stage is held on a phone too where the 3D street can be tried (WebGL 2), as in both engines here.
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', locale: 'en-US' });
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
      await context.addInitScript(countFrames);
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      // The dinner's intro is over and its calm loop runs: everything of the first screen is moving.
      await page.waitForFunction(() => [...document.querySelectorAll('.lz-tag-in')].every(el => getComputedStyle(el).opacity === '1'), null, { timeout: 8000 });
      await page.waitForTimeout(2600);
      const pause = page.getByRole('button', { name: 'Pause motion', exact: true });
      const play = page.getByRole('button', { name: 'Play motion', exact: true });
      assert.deepEqual(await pictured(pause), [false, false], `${at}: no aria-pressed, and two bars while it moves`);
      assert.equal(await page.getByRole('button', { name: 'Start a tab', exact: true }).count(), 1, `${at}: one control named Start a tab`);

      // It moves before the pause: otherwise holding it still would prove nothing.
      const s1 = await snapshot(page);
      await page.waitForTimeout(600);
      assert.notDeepEqual(moved(s1, await snapshot(page)), [], `${at}: the opening moves before it is paused`);
      const before = await running(page);
      for (const wanted of ['lz-marquee', 'lz-bob', 'lz-twinkle']) assert.ok(before.includes(wanted), `${at}: ${wanted} runs (${[...new Set(before)].join(', ')})`);
      assert.ok(before.some(name => name.startsWith('script')), `${at}: and so do the animations made in script`);
      const loopTime = () => page.locator('.lz-pack').first().evaluate(el => el.getAnimations().find(a => a.effect.getTiming().iterations === Infinity)?.currentTime ?? -1);

      // ── Pause, at the top ──
      if (shots) await page.screenshot({ path: `${shots}/${engine}-pause-${width}-running.png`, clip: { x: 0, y: 0, width, height: 140 } });
      await pause.click();
      await page.mouse.move(1, 1);
      assert.equal(await play.count(), 1, `${at}: the button now reads Play motion`);
      assert.deepEqual(await pictured(play), [false, true], `${at}: still no aria-pressed: its name flipped, and the picture is a triangle`);
      assert.equal(await page.getByRole('button', { name: 'Pause motion', exact: true }).count(), 0, `${at}: Pause motion is gone while it is paused`);
      assert.ok(await page.evaluate(() => document.querySelector('.landing').classList.contains('lz-paused')), `${at}: the root class is on`);
      await stays(page, `${at} paused at the top`);
      const heldAt = await loopTime();
      if (wide) {
        // How it works goes to the first station at once while paused, and the camera stands there.
        await page.getByRole('button', { name: 'How it works', exact: true }).click();
        await page.waitForTimeout(150);
        assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), 'Split it equally or by item, with a tip.', `${at}: How it works jumps to the first station while paused`);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(200);
      }
      if (shots) await page.screenshot({ path: `${shots}/${engine}-pause-${width}-paused.png`, clip: { x: 0, y: 0, width, height: 140 } });

      // ── Scroll through while it is paused: the street at its stills, nothing starts, the figures are there, the recording stays stopped ──
      const pinned = await page.locator('.zs.zs-pinned').count() > 0;
      if (pinned) {
        const stills = new Set();
        for (const p of [0.05, 0.2, 0.33, 0.47, 0.6, 0.74, 0.88, 0.97]) {
          await along(page, p);
          await page.waitForTimeout(150);
          assert.deepEqual(await running(page), [], `${at}: nothing eases in at ${p} of the street while paused`);
          await page.waitForTimeout(250);
          await stays(page, `${at} paused at ${p} of the street`, 700);
          stills.add(await camera(page));
        }
        assert.ok(stills.size >= 4 && stills.size <= 7, `${at}: the camera stood only at stills: the first screen, the stations, the street at night (${stills.size})`);
      }
      for (const section of ['.zs-links', '.ls-band', '.ls-ring', '.ls-counts', '.lz-cta']) {
        if (section === '.zs-links' && pinned) continue;
        await scrollToEl(page, section, section === '.ls-band' ? 360 : 0);
        await page.waitForTimeout(150);
        assert.deepEqual(await running(page), [], `${at}: nothing eases in as ${section} comes into view while paused`);
        await page.waitForTimeout(450);
        await stays(page, `${at} paused at ${section}`, 1000);
        if (section === '.zs-links') assert.ok(await page.locator('.zs-links .zs-chip').evaluateAll(list => list.every(c => getComputedStyle(c).opacity === '1')), `${at}: the station is its still, the six cards named`);
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

      // ── A resize while paused lays the street out again; what it makes does not move ──
      await scrollToEl(page, '.landing', 0);
      await page.setViewportSize({ width: width - 40, height });
      await page.waitForTimeout(900);
      await stays(page, `${at} paused after a resize`, 1000);
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(900);
      await stays(page, `${at} paused after the size is back`, 1000);

      // ── Play ──
      await play.click();
      await page.mouse.move(1, 1);
      assert.equal(await pause.count(), 1, `${at}: the button reads Pause motion again`);
      assert.deepEqual(await pictured(pause), [false, false], `${at}: with no aria-pressed, and two bars`);
      assert.equal(await page.evaluate(() => document.querySelector('.landing').classList.contains('lz-paused')), false, `${at}: the root class is off`);
      await frames(page, 3);
      // The dinner's loop carries on from where it stopped; it does not jump ahead by the time it was held.
      const playedAt = await loopTime();
      assert.ok(heldAt >= 0 && Math.abs(playedAt - heldAt) < 400, `${at}: the dinner's loop carries on from where it stopped (${Math.round(heldAt)} -> ${Math.round(playedAt)})`);
      const asked = await frameCount(page);
      const t1 = await snapshot(page);
      await page.waitForTimeout(900);
      assert.notDeepEqual(moved(t1, await snapshot(page)), [], `${at}: it moves again`);
      const again = await running(page);
      for (const wanted of ['lz-marquee', 'lz-bob', 'lz-twinkle']) assert.ok(again.includes(wanted), `${at}: ${wanted} runs again`);
      assert.ok(again.some(name => name.startsWith('script')), `${at}: and so do the animations made in script`);
      if (wide) {
        // The street follows the scroll again, easing; paused in the middle of the move, the camera goes to a still and holds.
        // (0.445 is in the second station's stay; 0.53 is on the way to the third, nearer the third.)
        await along(page, 0.445);
        await page.waitForTimeout(120);
        assert.ok(await frameCount(page) > asked, `${at}: the camera asks for frames again`);
        await page.waitForTimeout(1200);
        const settled = await camera(page);
        await along(page, 0.53);
        await page.waitForTimeout(60);
        await press(page);
        await frames(page, 3);
        const still = await camera(page);
        assert.notEqual(still, settled, `${at}: the move was under way`);
        await stays(page, `${at} paused in the middle of the camera's move`, 900);
        await press(page);
        await page.waitForTimeout(1400);
        assert.notEqual(await camera(page), still, `${at}: played, the camera goes on to where the scroll is`);
      }
      // The ring turns again; paused while it turns, it is held, and it turns on from there.
      await scrollToEl(page, '.ls-ring', -60);
      await page.waitForTimeout(600);
      assert.deepEqual(await page.locator('.ls-ring-spin').evaluate(el => el.getAnimations().map(a => a.playState)), ['running'], `${at}: the ring turns again`);
      const turn = () => page.locator('.ls-ring-spin').evaluate(el => getComputedStyle(el).transform);
      await press(page);
      await stays(page, `${at} paused while the ring turns`);
      const ringHeld = await turn();
      await press(page);
      await page.waitForTimeout(600);
      assert.notEqual(await turn(), ringHeld, `${at}: the ring turns on from there`);
      // The recording plays when seen; a pause stops it and it holds its place; playing carries on.
      await scrollToEl(page, '.ls-band', 360);
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
      await page.waitForTimeout(300);
      await pause.click();
      await page.getByRole('button', { name: 'Start a tab', exact: true }).first().click();
      await page.waitForFunction(() => document.activeElement?.matches('.flow .step-title'));
      await page.goBack();
      await page.locator('.landing').waitFor();
      assert.equal(await play.count(), 1, `${at}: still reads Play motion after the steps are opened and closed`);
      // (The pointer is left over Start a tab by the click; its hover is not motion: move it away first.)
      await page.mouse.move(1, 1);
      await page.waitForTimeout(150);
      await stays(page, `${at} paused after Back`);
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, ''], `${at}: nothing is kept in the browser`);
      await page.reload();
      await page.locator('.landing h1').waitFor();
      assert.equal(await pause.count(), 1, `${at}: a new visit starts with motion, and reads Pause motion`);
      assert.deepEqual(errors, [], `${at}: no errors`);
      await context.close();
      visits++;
      console.log(`ok ${at}: pause, the street at its stills, scroll, resize, play, pause mid-move, the visit`);
    }

    // ── The keyboard: the button comes after Sample dinner and before Open Ztab, shows its focus, and works with Enter and Space ──
    for (const width of [390, 1280]) {
      const at = `${engine} ${width} keyboard`;
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, reducedMotion: 'no-preference', locale: 'en-US' });
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
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
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
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
      const look = await page.evaluate(() => ['.lz-key', '.lz-ticker', '.lz-hero .lz-actions', '.lz-art'].map(sel => {
        const cs = getComputedStyle(document.querySelector(sel));
        // An animation that has reached its end still reports its transform as a matrix: the identity is "in place".
        const inPlace = cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)';
        return [sel, cs.opacity, inPlace, sel === '.lz-key' ? cs.color : '', sel === '.lz-key' ? cs.textShadow.replace(/rgba?\([^)]*\)\s*/, '') : ''];
      }));
      assert.deepEqual(look, [
        ['.lz-key', '1', true, 'rgb(68, 71, 91)', '0px 0px 0px'],
        ['.lz-ticker', '1', true, '', ''],
        ['.lz-hero .lz-actions', '1', true, '', ''],
        ['.lz-art', '1', true, '', ''],
      ], `${at}: nothing is left half drawn`);
      // The dinner's cards and ribbons are there whole: the intro was brought to its end.
      assert.ok(await page.locator('.lz-tag-in').evaluateAll(list => list.every(el => getComputedStyle(el).opacity === '1')), `${at}: every card is there`);
      assert.ok(await page.locator('.lz-line').evaluateAll(list => list.every(p => Math.abs(parseFloat(getComputedStyle(p).strokeDashoffset)) < 1)), `${at}: every ribbon is drawn`);
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
      await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
      const page = await context.newPage();
      await page.goto(origin + '/');
      await page.locator('.landing h1').waitFor();
      const states = (selector) => page.evaluate(sel => [...document.querySelectorAll(sel)].flatMap(el => el.getAnimations()).map(a => a.playState), selector);
      const loops = async () => [...await states('.lz-tag-in'), ...await states('.lz-lamp')];
      const floats = await loops();
      assert.ok(floats.length >= 10 && floats.every(s => s === 'running'), `${at}: the cards' float and the lamps run while the dinner is on screen (${floats})`);
      // (A picture that is exactly edge to edge with the screen still counts as seen: go a little past it.)
      await scrollToEl(page, '.ls-ring', 0);
      await page.waitForTimeout(500);
      assert.ok((await loops()).every(s => s === 'paused'), `${at}: and are held when it is off screen`);
      await scrollToEl(page, '.lz-cta', 300);
      await page.waitForFunction(() => document.querySelector('.lz-cta').classList.contains('lz-in'), null, { timeout: 5000 });
      await page.waitForTimeout(500);
      assert.deepEqual(await states('.lz-m-shine'), ['running'], `${at}: the light along the Z runs while the Z is on screen`);
      await scrollToEl(page, '.ls-ring', 0);
      await page.waitForTimeout(500);
      assert.deepEqual(await states('.lz-m-shine'), ['paused'], `${at}: and is held when the Z is off screen`);
      await scrollToEl(page, '.landing', 0);
      await page.waitForTimeout(500);
      assert.ok((await loops()).every(s => s === 'running'), `${at}: the dinner's loops run again when it is back`);
      await context.close();
      visits++;
      console.log(`ok ${at}`);
    }
  } finally {
    await browser.close();
  }
}
console.log(`landing-pause: ${visits} visits passed`);
