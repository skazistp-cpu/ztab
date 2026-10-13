// The opening: its words and ways in, the ticker of example bills, the dinner on the first screen (Jarvis's picture with
// the ribbons, the lit phones and the share cards drawn over it from the engine's split), the navigation, the last band,
// with motion and with reduced motion, every width, and a quiet visit.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TICKER, tickerLine } from '../../src/landing-ticker.ts';
import { LANDING_SAMPLE } from '../../src/landing-sample.ts';
const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8764').replace(/\/$/, '');
const flat = text => text.replace(/\s+/g, ' ').trim();
const SAMPLE = 'Try a sample dinner on Zcash’s test network, with test coins only.';
const LEAD = 'Ztab splits a restaurant bill and gives each friend a link to pay their share in Zcash, from their own wallet.';
const CLAIM = 'There is no account and no custody. The tab lives in the links.';
// The six cards over the phones: the engine-checked split of the sample dinner (landing-sample.ts).
const SHARES = LANDING_SAMPLE.shares.map(s => [s.name, `$${s.fiatShare}`]);
// The files of a visit: the page, one script, one stylesheet, the two faces (Geist for the words, Inter inside the
// app's pieces), and the picture of the dinner.
const BASE = [/^\/$/, /^\/assets\/index-[\w-]+\.js$/, /^\/assets\/index-[\w-]+\.css$/, /^\/assets\/geist-latin-wght-normal-[\w-]+\.woff2$/, /^\/assets\/inter-latin-wght-normal-[\w-]+\.woff2$/];
const files = (requests, base) => [...new Set(requests.filter(url => url.startsWith(base)).map(url => new URL(url).pathname))];
/** The name a screen reader gives the focused control. */
const focused = page => page.evaluate(() => { const el = document.activeElement; return el?.getAttribute('aria-label') || el?.textContent?.trim(); });

for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  const tab = engine === 'webkit' ? 'Alt+Tab' : 'Tab'; // WebKit, like Safari, leaves links out of Tab unless asked
  try {
    // ── With motion, on a wide screen ──
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', locale: 'en-US' });
    await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const requests = []; page.on('request', r => requests.push(r.url()));
    await page.goto(origin + '/');
    await page.locator('#app h1:visible').waitFor();
    await page.evaluate(() => document.fonts.ready);

    // The words, the ways in, and nothing that claims more.
    assert.equal(flat(await page.locator('#app h1:visible').innerText()), 'Each share is a link.');
    assert.equal(await page.locator('.landing .lz-lead').innerText(), LEAD);
    const words = flat(await page.locator('.landing').innerText());
    for (const sentence of [CLAIM, 'Amounts are examples.']) assert.ok(words.includes(sentence), sentence);
    for (const claim of ['paid ✓', 'payment received', 'confirmed', 'every wallet', 'any wallet', 'all wallets', 'private payments', 'guarantee', 'illustration']) assert.ok(!words.toLowerCase().includes(claim), claim);
    assert.ok(!/[—–]/.test(words), 'no dashes for punctuation');
    assert.equal(await page.getByRole('button', { name: 'Start a tab', exact: true }).count(), 1, 'one control named Start a tab');
    assert.equal(await page.getByRole('button', { name: 'Start a tab now', exact: true }).count(), 1, 'and Start a tab now in the last band');
    assert.equal(await page.getByRole('button', { name: 'Open Ztab', exact: true }).count(), 1, 'and Open Ztab in the navigation');
    const samples = page.locator('.lz-hero, .lz-cta').getByRole('link', { name: 'Try a sample dinner', exact: true });
    assert.deepEqual(await samples.evaluateAll(links => links.map(link => link.getAttribute('href'))), ['/?demo', '/?demo']);
    assert.deepEqual((await page.locator('.landing .lz-sample').allTextContents()).map(flat), [SAMPLE, SAMPLE], 'the approved sentence, word for word, twice');
    // The display face is Geist; the headline is set large.
    const type = await page.locator('.lz-hero h1').evaluate(el => { const cs = getComputedStyle(el); return [cs.fontFamily.split(',')[0].replace(/['"]/g, ''), parseFloat(cs.fontSize)]; });
    assert.equal(type[0], 'Geist');
    assert.ok(type[1] >= 72, `the headline is large (${type[1]} px)`);
    assert.ok(await page.evaluate(() => document.fonts.check('500 40px Geist')), 'Geist is loaded');

    // The ticker: the example bills, word for word, running; it holds still under the pointer.
    assert.deepEqual(await page.locator('.lz-hero .lz-run:not([aria-hidden]) .lz-tick').allTextContents(), TICKER.map(tickerLine));
    const strip = () => page.locator('.lz-hero .lz-track').evaluate(track => track.getAnimations().map(a => a.playState).join());
    assert.equal(await strip(), 'running');
    await page.locator('.lz-hero .lz-ticker').hover();
    assert.equal(await strip(), 'paused', 'the ticker pauses under the pointer');
    await page.mouse.move(2, 600);
    assert.equal(await strip(), 'running');

    // The dinner: the picture and what is drawn over it, none of it reachable.
    const scene = page.locator('.lz-scene');
    assert.equal(await scene.getAttribute('aria-hidden'), 'true');
    assert.equal(await scene.locator('a, button, input, select, textarea, [tabindex]').count(), 0, 'nothing in it can be focused');
    const art = await scene.locator('.lz-art img').evaluate(img => ({ srcset: img.getAttribute('srcset'), alt: img.getAttribute('alt'), w: img.getAttribute('width'), h: img.getAttribute('height'), source: img.closest('picture')?.querySelector('source')?.getAttribute('type') }));
    assert.match(art.srcset, /\/landing\/dinner-wide-1200\.webp 1200w, \/landing\/dinner-wide-1600\.webp 1600w, \/landing\/dinner-wide-2400\.webp 2400w/);
    assert.deepEqual([art.alt, art.w, art.h, art.source], ['', '2400', '1350', 'image/avif']);
    assert.equal(await scene.locator('.lz-line').count(), 6, 'six ribbons, one to each phone');
    assert.equal(await scene.locator('.lz-lit').count(), 6, 'six phones to light');
    assert.equal(await scene.locator('.lz-lamp').count(), 7, 'the lamps of the string lights');
    assert.deepEqual(await scene.locator('.lz-tag').evaluateAll(cards => cards.map(c => [c.querySelector('.lz-tag-name').textContent, c.querySelector('.lz-tag-amt').textContent])), SHARES, 'each card: a name and the engine’s share');
    assert.equal(await scene.locator('.lz-tag.lz-own .lz-tag-link').count(), 0, 'the organiser’s own share has no link mark');
    assert.equal(await scene.locator('.lz-tag:not(.lz-own) .lz-tag-link').count(), 5, 'the five friends’ cards show a link');
    // The intro: the ribbons draw, the phones light and the cards pop; then a calm loop runs on.
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-tag-in')].every(el => getComputedStyle(el).opacity === '1'), null, { timeout: 8000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-line')].every(path => Math.abs(parseFloat(getComputedStyle(path).strokeDashoffset)) < 1), null, { timeout: 8000 });
    await page.waitForTimeout(600);
    const loop = await page.evaluate(() => document.querySelector('.lz-scene').getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length);
    assert.ok(loop >= 24, `the calm loop runs (${loop} loops)`);
    // A wide screen holds the street on the screen: the first screen is its start.
    assert.ok(await page.locator('.zs.zs-pinned').count(), 'the street is held on a wide screen');

    // The navigation: How it works takes the page down to the street's first station; Sample dinner opens the demo.
    const nav = page.getByRole('navigation', { name: 'Opening' });
    assert.equal(await nav.getByRole('link', { name: 'Sample dinner', exact: true }).getAttribute('href'), '/?demo');
    await nav.getByRole('button', { name: 'How it works', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.zs-hud-say.on') !== null && scrollY > innerHeight, null, { timeout: 6000 });
    assert.equal(flat(await page.locator('.zs-hud-say.on').innerText()), 'Split it equally or by item, with a tip.');
    await page.evaluate(() => scrollTo(0, 0));

    // The last band's claim comes up through its mask when it is seen, and is then there to read.
    await page.evaluate(() => { const el = document.querySelector('.lz-cta h2'); scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight / 2); });
    await page.waitForFunction(() => { const h2 = document.querySelector('.lz-cta h2'); return !h2.classList.contains('lz-masked') && getComputedStyle(h2.firstElementChild ?? h2).clipPath === 'none'; }, null, { timeout: 4000 });
    await page.waitForTimeout(1200);
    assert.equal(flat(await page.locator('.lz-cta h2').innerText()), CLAIM, 'the claim is there to read');
    await page.evaluate(() => scrollTo(0, 0));

    // Start a tab opens the first step on the same page, its question ready for the screen reader; so does the last band's.
    for (const name of ['Start a tab', 'Start a tab now']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.matches('.flow .step-title'));
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'What’s the bill?');
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash, '/', `${name}: no route change`);
      assert.ok(await page.evaluate(() => document.documentElement.classList.contains('cut-off')), 'the steps are on the dark page again');
      await page.goBack();
      await page.locator('.landing').waitFor();
      assert.ok(await page.evaluate(() => !document.documentElement.classList.contains('cut-off')), 'back on the white page');
    }

    // The keyboard meets the logo, the navigation (with Pause motion before Open Ztab), then the ways in, in the order they are seen.
    await page.goto(origin + '/');
    const order = [];
    for (let i = 0; i < 7; i++) { await page.keyboard.press(tab); order.push(await focused(page)); }
    assert.deepEqual(order, ['Ztab, start a new tab', 'How it works', 'Sample dinner', 'Pause motion', 'Open Ztab', 'Start a tab', 'Try a sample dinner']);

    // A quiet visit: this site's own files only (the page, its script and style, two faces and the picture), nothing kept.
    assert.ok(requests.every(url => url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')), 'nothing from another site');
    assert.ok(!requests.some(url => /demo-|wire-|wasm/.test(url)));
    // (The street's pictures and the 3D street come with the scroll of How it works, and the wallet band, its code and
    // the app's monospace face with the scroll down to Start a tab now; landing-street*.mjs and landing-sections.mjs test them.)
    const visit = files(requests, origin).filter(f => !/^\/landing\/street-/.test(f) && !/^\/assets\/(jetbrains-mono|street3d|wallet-band)-/.test(f));
    for (const file of BASE) assert.ok(visit.some(f => file.test(f)), `${engine}: ${file}`);
    assert.deepEqual(visit.filter(f => !BASE.some(file => file.test(f))).map(f => f.replace(/-\d+\.(avif|webp)$/, '')), ['/landing/dinner-wide'], `${engine}: one picture of the dinner (${visit.join(' ')})`);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, '']);
    // The sample dinner is an ordinary navigation to the existing demo.
    await samples.first().click();
    await page.getByRole('button', { name: 'Load sample dinner', exact: true }).waitFor({ timeout: 4000 });
    assert.match(page.url(), /\/\?demo#demo\//);
    assert.deepEqual(errors, []);
    await context.close();

    // ── With motion, on a phone: the tall picture, How it works left out, the street one station under another ──
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', locale: 'en-US', isMobile: engine !== 'webkit', hasTouch: true });
    await phone.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
    const small = await phone.newPage();
    const smallErrors = []; small.on('pageerror', e => smallErrors.push(e.message));
    await small.goto(origin + '/');
    await small.locator('.lz-scene .lz-art img').waitFor();
    assert.equal(await small.getByRole('button', { name: 'How it works', exact: true }).count(), 0, 'How it works is left out on a phone');
    assert.equal(await small.getByRole('link', { name: 'Sample dinner', exact: true }).isVisible(), true);
    assert.match(await small.locator('.lz-scene .lz-art img').getAttribute('srcset'), /\/landing\/dinner-tall-720\.webp 720w, \/landing\/dinner-tall-840\.webp 840w, \/landing\/dinner-tall-1080\.webp 1080w/);
    assert.deepEqual(await small.locator('.lz-tag').evaluateAll(cards => cards.map(c => [c.querySelector('.lz-tag-name').textContent, c.querySelector('.lz-tag-amt').textContent])), SHARES);
    // With WebGL 2 the stage is held on a phone too (for the 3D street; its drawn street framed for the phone stands in).
    assert.ok(await small.locator('.zs.zs-pinned.zs-portrait').count(), 'the street is held on a phone');
    assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    assert.deepEqual(smallErrors, []);
    await phone.close();

    // ── Reduced motion: one composed still ──
    const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    await calm.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
    const still = await calm.newPage();
    const stillErrors = []; still.on('pageerror', e => stillErrors.push(e.message)); still.on('console', m => { if (m.type() === 'error') stillErrors.push(m.text()); });
    const stillRequests = []; still.on('request', r => stillRequests.push(r.url()));
    await still.goto(origin + '/');
    await still.locator('.lz-scene .lz-art img').waitFor();
    await still.evaluate(() => document.fonts.ready);
    await still.waitForTimeout(400);
    assert.equal(await still.evaluate(() => document.getAnimations().length), 0, 'nothing moves');
    // Every ribbon drawn, every phone lit, every card shown.
    assert.ok(await still.locator('.lz-line').evaluateAll(list => list.every(path => Math.abs(parseFloat(getComputedStyle(path).strokeDashoffset)) < 1)), 'the ribbons are drawn');
    assert.ok(await still.locator('.lz-tag-in').evaluateAll(list => list.every(el => getComputedStyle(el).opacity === '1')), 'every card shown');
    const quiet = files(stillRequests, origin);
    assert.equal(quiet.length, BASE.length + 1, quiet.join(' '));
    for (const file of [...BASE, /^\/landing\/dinner-tall-(720|840|1080)\.(avif|webp)$/]) assert.ok(quiet.some(f => file.test(f)), `${engine}: ${file}`);
    // The keyboard on a phone: the logo, Sample dinner, then the ways in.
    const phoneOrder = [];
    for (let i = 0; i < 5; i++) { await still.keyboard.press(tab); phoneOrder.push(await focused(still)); }
    assert.deepEqual(phoneOrder, ['Ztab, start a new tab', 'Sample dinner', 'Open Ztab', 'Start a tab', 'Try a sample dinner']);
    await still.evaluate(() => document.activeElement?.blur());
    // Every width and scheme: no sideways scroll, and the way in on a phone's first screen.
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900], [1440, 900]]) {
      for (const colorScheme of ['light', 'dark']) {
        await still.setViewportSize({ width, height });
        await still.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await still.evaluate(() => scrollTo(0, 0));
        await still.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.ok(await still.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${engine} ${width} ${colorScheme}: no overflow`);
        if (height >= 844) {
          const box = await still.getByRole('button', { name: 'Start a tab', exact: true }).boundingBox();
          assert.ok(box && box.y + box.height <= height, `${engine} ${width}: Start a tab on the first screen`);
        }
        const cut = await still.evaluate(() => [...document.querySelectorAll('.lz-tag-in')].flatMap(card => [...card.querySelectorAll('.lz-tag-name, .lz-tag-amt')]
          .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)));
        assert.deepEqual(cut, [], `${engine} ${width} ${colorScheme}: nothing cut off in the cards`);
        if (process.env.SHOTS) {
          mkdirSync(process.env.SHOTS, { recursive: true });
          await still.screenshot({ path: `${process.env.SHOTS}/${engine}-landing-${width}-${colorScheme}.png` });
        }
      }
    }
    assert.deepEqual(stillErrors, []);
    await calm.close();
    console.log(`${engine}: words, both ways in and the last band's, Geist, the ticker (word for word, paused under the pointer), the dinner (picture, six ribbons, six lit phones, six cards from the engine, seven lamps, the intro and the calm loop, nothing focusable), the street held on a wide screen, How it works, Start a tab and Start a tab now, keyboard order, quiet visits, demo link, the phone's picture and held street, reduced motion, 320–1440 light/dark PASS`);
  } finally {
    await browser.close();
  }
}
