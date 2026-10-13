// The sections after the street: the band of night (the wallet band: Ana's pay page, the tap, a wallet's Send sheet
// filling from the request), the ring of link cards and the counts. Chromium and WebKit, a phone and a laptop, light and
// dark, with and without motion: the approved sentences word for word, the figures against the app's own code, the band
// built only when near, loops that stop off screen, a still picture with reduced motion, the light fading into and out
// of the band, no sideways scroll, and no request to another origin.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing-sections.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { LANDING_SAMPLE } from '../../src/landing-sample.ts';
import { makeTab } from '../../src/tab.ts';
import { formatFiat } from '../../src/money.ts';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8764').replace(/\/$/, '');
const flat = text => text.replace(/\s+/g, ' ').trim();

// In the order of the phone's page: the request, then the wallets tried.
const LINES = [
  'A wallet that reads the request fills in the address and the amount, and the note if it supports one.',
  'We have tried the requests in Zodl, Zingo, YWallet and Zkool.',
];
// The ring's twelve friends: the sample dinner's five, then two more tabs split by makeTab.
const ringTab = (label, fiat, total, rate, names) => {
  const at = '2026-10-12T00:00:00.000Z';
  const tab = makeTab({ createdAt: at, from: 'Lena', label, payee: 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez', fiat, total, ownShare: '', people: names.map(name => ({ name, amount: '' })), rate: { fiatPerZec: rate, source: 'Manual entry', observedAt: at } });
  assert.equal(tab.kind, 'tab');
  return tab.rows.map(row => `${row.name} ${formatFiat(row.fiatShare, fiat)}`);
};
const RING = [
  ...LANDING_SAMPLE.shares.filter(s => !s.own).map(s => `${s.name} $${s.fiatShare}`),
  ...ringTab('Pizza night', 'USD', '92.00', '1229.06', ['Mia', 'Noah', 'Sara', 'Leo']),
  ...ringTab('Brunch', 'EUR', '109.20', '1052.40', ['Eva', 'Marek', 'Zoe']),
];
assert.equal(RING.length, 12);

const scrollToEl = (page, selector, offset = 0) => page.evaluate(([sel, off]) => {
  const el = document.querySelector(sel);
  scrollTo(0, el.getBoundingClientRect().top + scrollY + off);
}, [selector, offset]);
const innerHeightOf = width => (width < 600 ? 844 : 800);
const noSideways = async (page, where) => {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(scroll <= inner, `${where}: no sideways scroll (${scroll} > ${inner})`);
};

let checks = 0;
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const width of [390, 1280]) {
      for (const scheme of ['light', 'dark']) {
        for (const motion of ['no-preference', 'reduce']) {
          const at = `${engine} ${width} ${scheme} ${motion}`;
          const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 800 }, colorScheme: scheme, reducedMotion: motion, locale: 'en-US' });
          await context.route(/\/assets\/street3d-[\w-]+\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: 'export const mountStreet = () => Promise.reject(new Error("left out of this test"));' })); // the 3D street: landing-street3d.mjs
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', e => errors.push(e.message));
          page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
          const requests = [];
          page.on('request', r => requests.push(r.url()));
          await page.goto(origin + '/');
          await page.locator('.lw-band').waitFor();
          await page.evaluate(() => document.fonts.ready);

          // The band is built only as it comes near (its pay page uses the app's monospace face): on arrival there is
          // nothing of it but its two sentences, for a screen reader, and the face is not fetched.
          assert.equal(await page.locator('.wb').count(), 0, `${at}: the band waits until it is near`);
          assert.deepEqual((await page.locator('.lw-words-sr > *').allTextContents()).map(flat), LINES, `${at}: its two sentences, for a screen reader`);
          assert.equal(await page.locator('.lw-words-sr h2').count(), 1, `${at}: the first a heading`);
          assert.ok(!requests.some(url => /jetbrains/i.test(url)), `${at}: no monospace face on arrival`);
          // Built once it is near: the same words, exactly; no em dash anywhere in the sections' words.
          await scrollToEl(page, '.lw-band', -innerHeightOf(width) * 0.5);
          await page.locator('.wb').waitFor({ timeout: 4000 });
          assert.equal(flat(await page.locator('.wb-s1').textContent()), LINES[0], `${at}: the band's first sentence`);
          assert.equal(flat(await page.locator('.wb-s2').textContent()), LINES[1], `${at}: the band's second sentence`);
          assert.equal(await page.locator('.lw-words-sr').count(), 0, `${at}: the screen reader's copy goes once the band is built`);
          assert.equal(await page.locator('.wb').getAttribute('aria-labelledby'), 'wb-s1', `${at}: the band is named by its first sentence`);
          // (The phone's screen is the app's own pay page, drawn: a picture, inert and hidden from a screen reader.)
          const words = flat(await page.locator('.wb-words, .ls-ring, .ls-counts').allInnerTexts().then(list => list.join(' ')));
          assert.ok(!/[—–]/.test(words), `${at}: no dashes`);

          // The ring: twelve friends of three tabs, by the engine; only the ring takes the focus (to stop it).
          const ring = await page.locator('.ls-ring-card').evaluateAll(list => list.map(c => `${c.querySelector('.ls-ring-name').textContent} ${c.querySelector('.ls-ring-amount').textContent}`));
          assert.deepEqual(ring, RING, `${at}: the ring's cards`);
          assert.deepEqual(await page.locator('.lw-band [tabindex], .ls-ring [tabindex], .ls-counts [tabindex]').evaluateAll(list => list.map(el => el.classList.contains('ls-ring-stage'))), [true], `${at}: only the ring takes the focus`);
          assert.ok((await page.locator('.ls-ring-stage').getAttribute('aria-label')).length > 40, `${at}: the ring is named`);
          assert.ok((await page.locator('.wb-phone').getAttribute('aria-label')).length > 40, `${at}: the phone is named`);
          assert.ok(await page.locator('.wb-screen').evaluate(el => el.inert && el.getAttribute('aria-hidden') === 'true'), `${at}: the page on the phone is a picture (inert)`);

          // The counts: four facts, each counted up to its figure once the strip is seen (at once with reduced motion).
          assert.deepEqual(await page.locator('.ls-count-label').allTextContents(), ['ZIP 321 conformance tests passed', 'currencies', 'wallets tried', 'accounts'], `${at}: the counts' words`);
          await scrollToEl(page, '.ls-counts', -200);
          await page.waitForFunction(() => [...document.querySelectorAll('.ls-count-num')].map(n => n.textContent).join() === '67,6,4,0', null, { timeout: 4000 });
          assert.deepEqual((await page.locator('.ls-count').allTextContents()).map(flat), ['6767 ZIP 321 conformance tests passed', '66 currencies', '44 wallets tried', '00 accounts'], `${at}: each figure also said once, in full`);
          // Each figure's own picture, hidden from a screen reader: 67 ticks (all on once counted), the six currencies'
          // signs from the app's codes, the four wallets' names, and the ghost of an account.
          assert.equal(await page.locator('.ls-dial').count(), 4, `${at}: four figures`);
          assert.ok(await page.locator('.ls-viz').evaluateAll(list => list.length >= 4 && list.every(el => el.getAttribute('aria-hidden') === 'true')), `${at}: their pictures hidden from a screen reader`);
          await page.waitForFunction(() => document.querySelectorAll('.ls-viz-ticks .ls-tick.on').length === 67, null, { timeout: 4000 });
          assert.equal(await page.locator('.ls-viz-ticks .ls-tick').count(), 67, `${at}: 67 ticks`);
          assert.deepEqual(await page.locator('.lk-orbit-front .ls-sign').evaluateAll(list => list.map(el => el.dataset.t)), ['$', '€', '£', 'Kč', 'zł', 'CHF'], `${at}: the six currencies' signs`);
          assert.deepEqual(await page.locator('.ls-mark').evaluateAll(list => list.map(el => el.dataset.t)), ['Zodl', 'Zingo', 'YWallet', 'Zkool'], `${at}: the four wallets' names`);
          assert.equal(await page.locator('.ls-viz-ghost .ls-ghost-card').count(), 1, `${at}: an account's ghost`);
          // The brand band: the six links of the sample dinner round the Z (hidden from a screen reader with the Z).
          assert.deepEqual(await page.locator('.lz-mark .lk-orbit-front .lz-sat-card .lz-tag-name').allTextContents(), LANDING_SAMPLE.shares.map(s => s.name), `${at}: the six links round the Z`);
          assert.equal(await page.locator('.lz-mark').getAttribute('aria-hidden'), 'true', `${at}: the constellation is hidden from a screen reader`);

          // The light: the band begins in ink (the street before it ends at night) and fades out to white in its own
          // padding at its foot, where there are no words; the words on ink.
          const ground = await page.locator('.lw-band').evaluate(el => [getComputedStyle(el).backgroundImage, parseFloat(getComputedStyle(el).paddingBottom)]);
          assert.match(ground[0], /^linear-gradient\(rgb\(11, 12, 15\).*rgb\(11, 12, 15\).*rgb\(255, 255, 255\)/, `${at}: ink to white`);
          assert.ok(ground[1] >= 100, `${at}: the fade sits in the band's padding (${ground[1]})`);
          // The wallets of the second sentence, by name only (no logos), and the words that light in the first.
          assert.deepEqual(await page.locator('.wb-wallet').evaluateAll(list => list.map(el => el.firstChild.textContent)), ['Zodl', 'Zingo', 'YWallet', 'Zkool'], `${at}: the four names`);
          assert.equal(await page.locator('.wb img, .wb-words img').count(), 0, `${at}: no logos`);
          assert.deepEqual(await page.locator('.wb-key').allTextContents(), ['the address', 'the amount', 'the note'], `${at}: the words that light`);
          assert.equal(await page.locator('.wb-s1').evaluate(el => getComputedStyle(el).color), 'rgb(242, 245, 247)', `${at}: the words are light on the ink`);
          // The figure that is seen: the odometer's wheels with motion (each resting on its digit), the plain figure without.
          const seenFigure = await page.evaluate(() => {
            const odo = document.querySelector('.ls-counts.ls-odo-on .ls-odo');
            const el = odo || document.querySelector('.ls-count-num');
            const digits = odo ? [...document.querySelectorAll('.ls-count')].map(c => [...c.querySelectorAll('.ls-odo-strip')].map(s => Math.round(-new DOMMatrix(getComputedStyle(s).transform).m42 / parseFloat(getComputedStyle(s).fontSize)) % 10).join('')).join() : '';
            return { color: getComputedStyle(el).color, digits };
          });
          assert.equal(seenFigure.color, 'rgb(68, 71, 91)', `${at}: the counts are slate on white`);
          if (motion !== 'reduce') assert.equal(seenFigure.digits, '67,6,4,0', `${at}: the wheels rest on the figures`);

          if (motion === 'reduce') {
            // The band does not hold the screen: it is the module's still, every line, field and name in its end state.
            assert.ok(await page.locator('.lw-band.lw-still .wb.wb-static').count(), `${at}: the band is still`);
            assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.lw-stage')).position), 'relative', `${at}: no sticky stage`);
            await scrollToEl(page, '.lw-band');
            await page.waitForTimeout(150);
            assert.ok(await page.locator('.wb-li').evaluateAll(list => list.every(el => getComputedStyle(el).opacity === '1')), `${at}: every line shown`);
            assert.equal(await page.locator('.wb-wallet.lit').count(), 4, `${at}: every name lit`);
            assert.equal(await page.locator('.wb-key.lit').count(), 3, `${at}: the three words lit`);
            assert.equal(await page.evaluate(() => document.getAnimations().length), 0, `${at}: nothing runs`);
            await noSideways(page, `${at} band`);
          } else {
            // The ring turns while it is seen, turns slowly under a mouse (its front card comes forward), and stops off screen.
            await scrollToEl(page, '.ls-ring', -60);
            await page.waitForTimeout(400);
            const turning = () => page.evaluate(() => document.querySelector('.ls-ring-spin').getAnimations().filter(a => a.playState === 'running').length);
            const pace = () => page.evaluate(() => document.querySelector('.ls-ring-spin').getAnimations()[0]?.playbackRate);
            assert.equal(await turning(), 1, `${at}: the ring turns`);
            await page.locator('.ls-ring-stage').hover({ position: { x: 20, y: 20 } });
            await page.waitForTimeout(400);
            const slow = await pace();
            assert.ok(await turning() === 1 && slow > 0 && slow < 0.5, `${at}: and turns slowly under the pointer (${slow})`);
            assert.equal(await page.locator('.ls-ring-card.ls-lift').count(), 1, `${at}: its front card comes forward`);
            await page.mouse.move(1, 1);
            await page.waitForTimeout(150);
            assert.equal(await pace(), 1, `${at}: and at its own pace again when the pointer leaves`);
            assert.equal(await page.locator('.ls-ring-card.ls-lift').count(), 0, `${at}: the card goes back`);
            // The band: it holds the screen over its span while its story follows the scroll: the sentence first, the
            // fields filling with their words lit, then the second sentence with each wallet's name lit by the end.
            const track = await page.evaluate(() => { const r = document.querySelector('.lw-track').getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; });
            const view = await page.evaluate(() => innerHeight);
            const seen = [];
            for (const part of [0.15, 0.62, 1]) {
              await page.evaluate(y => scrollTo(0, y), track.top + (track.height - view) * part);
              await page.waitForTimeout(700);
              seen.push({
                sticky: await page.evaluate(() => Math.round(document.querySelector('.lw-stage').getBoundingClientRect().top)),
                keys: await page.locator('.wb-key.lit').count(),
                wallets: await page.locator('.wb-wallet.lit').count(),
                s2: await page.locator('.wb-s2').evaluate(el => Number(getComputedStyle(el).opacity)),
              });
              await noSideways(page, `${at} band ${part}`);
            }
            assert.ok(seen.every(s => s.sticky === 0), `${at}: the band holds the screen (${seen.map(s => s.sticky)})`);
            assert.deepEqual(seen.map(s => [s.keys, s.wallets, s.s2 > 0.99]), [[0, 0, false], [1, 0, false], [3, 4, true]], `${at}: the story follows the scroll (${JSON.stringify(seen)})`);
            // The phone stands on the screen under the header: whole on a laptop; on a phone, under the words, most of it
            // on the screen (its foot runs into the ink).
            const frame = await page.evaluate(() => { const r = document.querySelector('.wb-phone').getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; });
            const shown = (Math.min(frame[1], view) - Math.max(frame[0], 0)) / (frame[1] - frame[0]);
            assert.ok(frame[0] >= 56 && shown >= (width < 600 ? 0.6 : 0.99) && frame[2] >= 0 && frame[3] <= width, `${at}: the phone on the screen, under the header (${frame.map(Math.round)}, ${shown.toFixed(2)})`);
            // Off screen the ring stops.
            await page.evaluate(() => scrollTo(0, 0));
            await page.waitForTimeout(500);
            assert.equal(await page.evaluate(() => document.querySelector('.ls-ring-spin').getAnimations().length), 0, `${at}: the ring stops off screen`);
          }

          const foreign = requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'));
          assert.deepEqual(foreign, [], `${at}: no request to another origin`);
          assert.deepEqual(errors, [], `${at}: no errors`);
          await context.close();
          checks++;
          console.log(`ok ${at}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
}

console.log(`landing-sections: ${checks} visits passed`);
