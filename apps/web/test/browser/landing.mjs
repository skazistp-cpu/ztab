// The opening: its words and ways in, the ticker of example bills, the centrepiece (the app's own screens in a phone
// among the app's cards, and the cut that fills the friends' cards), the last band, with motion and with reduced
// motion, every width, and a quiet visit.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { TICKER, tickerLine } from '../../src/landing-ticker.ts';
import { decoyCode } from '../../src/landing-hero.ts';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const flat = text => text.replace(/\s+/g, ' ').trim();
const SAMPLE = 'Try a sample dinner on Zcash’s test network, with test coins only.';
const LEAD = 'Ztab splits a restaurant bill and gives each friend a link to pay their share in Zcash, from their own wallet.';
const CLAIM = 'There is no account and no custody. The tab lives in the links.';
// The friends' cards, with the engine-checked example values (landing-sample.ts): who, how much, the start of the link.
const FRIENDS = [['Ana', '$56.00'], ['Dragan', '$56.00'], ['Tomás', '$56.00'], ['Priya', '$56.00'], ['Jonas', '$20.00']];
const SCREENS = ['bill', 'people', 'rate', 'links', 'pay'];
// The files of a visit: the page, one script, one stylesheet, the three faces, and the phone's screens.
const BASE = [/^\/$/, /^\/assets\/index-[\w-]+\.js$/, /^\/assets\/index-[\w-]+\.css$/, /^\/assets\/inter-latin-wght-normal-[\w-]+\.woff2$/, /^\/assets\/jetbrains-mono-latin-wght-normal-[\w-]+\.woff2$/];
const files = (requests, base) => [...new Set(requests.filter(url => url.startsWith(base)).map(url => new URL(url).pathname))];
/** The name a screen reader gives the focused control. */
const focused = page => page.evaluate(() => { const el = document.activeElement; return el?.getAttribute('aria-label') || el?.textContent?.trim(); });
/** Every animation of the centrepiece, held still at one moment of its loop (ms); then what the cards and the phone show. */
const at = (page, ms) => page.evaluate(ms => {
  const stage = document.querySelector('.lz-stage');
  for (const a of document.getAnimations()) if (stage.contains(a.effect?.target ?? null)) { a.pause(); a.currentTime = ms; }
  const cards = [...stage.querySelectorAll('.lz-friend')].filter(card => !card.closest('.lz-layer').hidden);
  return {
    cards: cards.map(card => [card.querySelector('.lz-name').textContent, getComputedStyle(card.querySelector('.lz-amount')).opacity, getComputedStyle(card.querySelector('.lz-chip')).opacity]),
    shown: [...stage.querySelectorAll('.lz-shot')].findIndex(img => { const m = new DOMMatrixReadOnly(getComputedStyle(img).transform); return Math.abs(m.m41) < 1 && getComputedStyle(img).opacity === '1'; }),
  };
}, ms);

for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  const tab = engine === 'webkit' ? 'Alt+Tab' : 'Tab'; // WebKit, like Safari, leaves links out of Tab unless asked
  try {
    // ── With motion, on a wide screen ──
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', locale: 'en-US' });
    // When each phone screen is given its picture, and when the page first paints.
    await context.addInitScript(() => {
      window.__src = {};
      new MutationObserver(list => { for (const m of list) if (m.target.classList?.contains('lz-shot') && m.target.getAttribute('src')) window.__src[m.target.getAttribute('src')] ??= performance.now(); })
        .observe(document, { subtree: true, attributes: true, attributeFilter: ['src'], childList: true });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const requests = []; page.on('request', r => requests.push(r.url()));
    await page.goto(origin);
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
    // The first screen's and the last band's sample links (the sections below may have their own).
    const samples = page.locator('.lz-hero, .lz-cta').getByRole('link', { name: 'Try a sample dinner', exact: true });
    assert.deepEqual(await samples.evaluateAll(links => links.map(link => link.getAttribute('href'))), ['/?demo', '/?demo']);
    assert.deepEqual((await page.locator('.landing .lz-sample').allTextContents()).map(flat), [SAMPLE, SAMPLE], 'the approved sentence, word for word, twice');
    // The ticker: the example bills, word for word, running; it holds still under the pointer.
    assert.deepEqual(await page.locator('.lz-hero .lz-run:not([aria-hidden]) .lz-tick').allTextContents(), TICKER.map(tickerLine));
    const strip = () => page.locator('.lz-hero .lz-track').evaluate(track => track.getAnimations().map(a => a.playState).join());
    assert.equal(await strip(), 'running');
    await page.locator('.lz-hero .lz-ticker').hover();
    assert.equal(await strip(), 'paused', 'the ticker pauses under the pointer');
    await page.mouse.move(2, 600);
    assert.equal(await strip(), 'running');

    // The centrepiece: a phone with the app's own five screens and the app's cards, none of it reachable.
    const stage = page.locator('.lz-stage');
    assert.equal(await stage.getAttribute('aria-hidden'), 'true');
    assert.equal(await stage.locator('a, button, input, select, textarea, [tabindex]').count(), 0, 'nothing in it can be focused');
    const shots = await page.locator('.lz-shot').evaluateAll(list => list.map(img => (img.getAttribute('src') ?? img.dataset.src ?? '').replace(/^.*\//, '')));
    assert.deepEqual(shots.map(name => name.replace(/-sm(?=\.webp$)/, '')), SCREENS.map(name => `screen-${name}.webp`));
    // The first screen with the page; the other four only once the page has loaded, and all five arrive whole.
    // Then the phone starts turning through them.
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-shot')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 8000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-shot')].every(img => img.getAnimations().length > 0), null, { timeout: 4000 });
    const timing = await page.evaluate(() => ({
      loaded: performance.getEntriesByType('navigation')[0]?.loadEventEnd,
      src: window.__src,
      first: document.querySelector('.lz-shot').getAttribute('src'),
    }));
    const later = Object.entries(timing.src).filter(([src]) => src !== timing.first);
    assert.equal(later.length, 4, `four more screens: ${JSON.stringify(timing.src)}`);
    for (const [src, when] of later) assert.ok(when >= timing.loaded, `${engine}: ${src} only after the page has loaded (${Math.round(when)} ≥ ${Math.round(timing.loaded)} ms)`);
    // The table card's code is a fixed drawing that is not a QR code.
    assert.equal(await page.locator('.lz-table .lz-qr path').getAttribute('d'), decoyCode(0x5eed2a));
    // The loop: before the cut the friends' cards are empty; after it each shows its share, then its link; the phone
    // shows the five screens one after another.
    const before = await at(page, 300);
    assert.deepEqual(before.cards, FRIENDS.map(([name]) => [name, '0', '0']), 'before the cut');
    const after = await at(page, 3200);
    assert.deepEqual(after.cards, FRIENDS.map(([name]) => [name, '1', '1']), 'after the cut: every share and every link');
    assert.deepEqual(await page.locator('.lz-friend').evaluateAll(cards => cards.map(card => [card.querySelector('.lz-name').textContent, card.querySelector('.lz-amount').textContent])), FRIENDS);
    for (const [i] of SCREENS.entries()) assert.equal((await at(page, i * 1600 + 900)).shown, i, `${engine}: screen ${i + 1} in the phone at ${i * 1600 + 900} ms`);
    await page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });

    // The navigation: How it works scrolls down the page; Sample dinner opens the demo.
    const nav = page.getByRole('navigation', { name: 'Opening' });
    assert.equal(await nav.getByRole('link', { name: 'Sample dinner', exact: true }).getAttribute('href'), '/?demo');
    const how = nav.getByRole('button', { name: 'How it works', exact: true });
    await how.click();
    // It scrolls (smoothly) until its section is at the top, or the page can go no further.
    await page.waitForFunction(() => {
      const target = document.querySelector('#how-it-works') ?? document.querySelector('.lz-cta');
      const end = scrollY + innerHeight >= document.documentElement.scrollHeight - 1;
      return scrollY > 0 && (Math.abs(target.getBoundingClientRect().top) < 4 || end);
    }, null, { timeout: 4000 });
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
      assert.ok(await page.evaluate(() => !document.documentElement.classList.contains('cut-off')), 'back on the paper page');
    }

    // The keyboard meets the logo, the navigation (with Pause motion before Open Ztab), then the ways in, in the order they are seen.
    await page.goto(origin);
    const order = [];
    for (let i = 0; i < 7; i++) { await page.keyboard.press(tab); order.push(await focused(page)); }
    assert.deepEqual(order, ['Ztab, start a new tab', 'How it works', 'Sample dinner', 'Pause motion', 'Open Ztab', 'Start a tab', 'Try a sample dinner']);

    // A quiet visit: this site's own files only (with motion, all five screens), nothing kept in the browser.
    assert.ok(requests.every(url => url.startsWith(origin)), 'nothing from another site');
    assert.ok(!requests.some(url => /demo-|wire-|wasm|gl-/.test(url)));
    const visit = files(requests, origin);
    assert.equal(visit.length, BASE.length + SCREENS.length, visit.join(' '));
    for (const file of BASE) assert.ok(visit.some(f => file.test(f)), `${engine}: ${file}`);
    for (const name of SCREENS) assert.ok(visit.some(f => new RegExp(`^/landing/screen-${name}(-sm)?\\.webp$`).test(f)), `${engine}: screen ${name}`);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, '']);
    // The sample dinner is an ordinary navigation to the existing demo.
    await samples.first().click();
    await page.getByRole('button', { name: 'Load sample dinner', exact: true }).waitFor({ timeout: 4000 });
    assert.match(page.url(), /\/\?demo#demo\//);
    assert.deepEqual(errors, []);
    await context.close();

    // ── With motion, on a phone: its own composition, How it works left out, three cards ──
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', locale: 'en-US', isMobile: engine !== 'webkit', hasTouch: true });
    const small = await phone.newPage();
    const smallErrors = []; small.on('pageerror', e => smallErrors.push(e.message));
    await small.goto(origin);
    await small.locator('.lz-stage').waitFor();
    assert.equal(await small.getByRole('button', { name: 'How it works', exact: true }).count(), 0, 'How it works is left out on a phone');
    assert.equal(await small.getByRole('link', { name: 'Sample dinner', exact: true }).isVisible(), true);
    assert.deepEqual(await small.locator('.lz-layer:not([hidden]) .lz-name').allTextContents(), ['Dinner, Friday', 'Ana', 'Jonas']);
    await small.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.deepEqual((await at(small, 300)).cards, [['Ana', '0', '0'], ['Jonas', '0', '0']]);
    assert.deepEqual((await at(small, 3200)).cards, [['Ana', '1', '1'], ['Jonas', '1', '1']]);
    assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    assert.deepEqual(smallErrors, []);
    await phone.close();

    // ── Reduced motion: one composed still ──
    const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    const still = await calm.newPage();
    const stillErrors = []; still.on('pageerror', e => stillErrors.push(e.message)); still.on('console', m => { if (m.type() === 'error') stillErrors.push(m.text()); });
    const stillRequests = []; still.on('request', r => stillRequests.push(r.url()));
    await still.goto(origin);
    await still.locator('.lz-stage').waitFor();
    await still.evaluate(() => document.fonts.ready);
    await still.waitForTimeout(400);
    assert.equal(await still.evaluate(() => document.getAnimations().length), 0, 'nothing moves');
    // The phone keeps its first screen, the only picture loaded; every card shows its share and its link.
    const pictures = await still.locator('.lz-shot').evaluateAll(list => list.map(img => img.getAttribute('src')));
    assert.match(pictures[0] ?? '', /\/landing\/screen-bill(-sm)?\.webp$/);
    assert.deepEqual(pictures.slice(1), [null, null, null, null], 'no other screen is loaded');
    assert.ok(await still.locator('.lz-shot').first().evaluate(img => { const m = new DOMMatrixReadOnly(getComputedStyle(img).transform); return Math.abs(m.m41) < 1; }), 'the first screen in the phone');
    assert.ok(await still.locator('.lz-friend').evaluateAll(cards => cards.every(card => getComputedStyle(card.querySelector('.lz-amount')).opacity === '1' && getComputedStyle(card.querySelector('.lz-chip')).opacity === '1')), 'every card filled');
    const quiet = files(stillRequests, origin);
    assert.equal(quiet.length, BASE.length + 1, quiet.join(' '));
    for (const file of [...BASE, /^\/landing\/screen-bill(-sm)?\.webp$/]) assert.ok(quiet.some(f => file.test(f)), `${engine}: ${file}`);
    // The keyboard on a phone: the logo, Sample dinner, then the ways in.
    const phoneOrder = [];
    for (let i = 0; i < 5; i++) { await still.keyboard.press(tab); phoneOrder.push(await focused(still)); }
    assert.deepEqual(phoneOrder, ['Ztab, start a new tab', 'Sample dinner', 'Open Ztab', 'Start a tab', 'Try a sample dinner']);
    await still.evaluate(() => document.activeElement?.blur());
    // Every width and scheme: no sideways scroll, the ways in on a phone's first screen, and no word cut off in the cards
    // (only a link's chip may end in an ellipsis, as the app's own chips do).
    for (const [width, height] of [[320, 568], [390, 844], [1280, 900], [1440, 900]]) {
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
        const cut = await still.evaluate(() => [...document.querySelectorAll('.lz-layer:not([hidden]) .lz-card')].flatMap(card => {
          const box = card.getBoundingClientRect();
          return [...card.querySelectorAll('.lz-name, .lz-label, .lz-amount, .lz-total')]
            .filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > box.right + 1)
            .map(el => `${card.querySelector('.lz-name').textContent}: ${el.textContent}`);
        }));
        assert.deepEqual(cut, [], `${engine} ${width} ${colorScheme}: nothing cut off in the cards`);
        if (process.env.SHOTS) {
          mkdirSync(process.env.SHOTS, { recursive: true });
          await still.screenshot({ path: `${process.env.SHOTS}/${engine}-landing-${width}-${colorScheme}.png` });
        }
      }
    }
    assert.deepEqual(stillErrors, []);
    await calm.close();
    console.log(`${engine}: words, both ways in and the last band's, the navigation, the ticker (word for word, paused under the pointer), the centrepiece (five screens, the first with the page and four after it has loaded, cards filled by the cut, the decoy code, nothing focusable), the phone's composition, Start a tab and Start a tab now, keyboard order, quiet visits, demo link, reduced motion, 320–1440 light/dark PASS`);
  } finally {
    await browser.close();
  }
}
