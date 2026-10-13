// The sections after the street: the band of night with the recording of the pay page, the ring of link cards and the
// counts. Chromium and WebKit, a phone and a laptop, light and dark, with and without motion: the approved sentences
// word for word, the figures against the app's own code, the recording fetched only when near, loops that stop off
// screen, a still picture with reduced motion, the light fading into and out of the band, no sideways scroll, and no
// request to another origin.
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
          await page.locator('.ls-band').waitFor();
          await page.evaluate(() => document.fonts.ready);

          // The recording: muted, inline, looped, nothing fetched for it on arrival.
          const video = page.locator('.ls-phone video');
          assert.deepEqual(await video.evaluate(v => [v.muted, v.hasAttribute('playsinline'), v.loop, v.autoplay, v.preload, v.controls]), [true, true, true, false, 'none', false], `${at}: the recording's settings`);
          assert.ok(!requests.some(url => /\/landing\/sections-pay/.test(url)), `${at}: the recording waits until the band is near`);

          // The words, exactly; no em dash anywhere in them.
          assert.deepEqual((await page.locator('.ls-line').allTextContents()).map(flat), LINES, `${at}: the band's two lines`);
          assert.equal(await page.locator('.ls-band h2').count(), 1, `${at}: the band's heading is its first line`);
          const words = flat(await page.locator('.ls-band, .ls-ring, .ls-counts').allInnerTexts().then(list => list.join(' ')));
          assert.ok(!/[—–]/.test(words), `${at}: no dashes`);

          // The ring: twelve friends of three tabs, by the engine; only the ring takes the focus (to stop it).
          const ring = await page.locator('.ls-ring-card').evaluateAll(list => list.map(c => `${c.querySelector('.ls-ring-name').textContent} ${c.querySelector('.ls-ring-amount').textContent}`));
          assert.deepEqual(ring, RING, `${at}: the ring's cards`);
          assert.deepEqual(await page.locator('.ls-band [tabindex], .ls-ring [tabindex], .ls-counts [tabindex]').evaluateAll(list => list.map(el => el.classList.contains('ls-ring-stage'))), [true], `${at}: only the ring takes the focus`);
          assert.ok((await page.locator('.ls-ring-stage').getAttribute('aria-label')).length > 40, `${at}: the ring is named`);
          assert.ok((await page.locator('.ls-phone').getAttribute('aria-label')).length > 40, `${at}: the recording is named`);

          // The counts: four facts, each counted up to its figure once the strip is seen (at once with reduced motion).
          assert.deepEqual(await page.locator('.ls-count-label').allTextContents(), ['ZIP 321 conformance tests passed', 'currencies', 'wallets tried', 'accounts'], `${at}: the counts' words`);
          await scrollToEl(page, '.ls-counts', -200);
          await page.waitForFunction(() => [...document.querySelectorAll('.ls-count-num')].map(n => n.textContent).join() === '67,6,4,0', null, { timeout: 4000 });
          assert.deepEqual((await page.locator('.ls-count').allTextContents()).map(flat), ['6767 ZIP 321 conformance tests passed', '66 currencies', '44 wallets tried', '00 accounts'], `${at}: each figure also said once, in full`);

          // The light: the band begins in ink (the street before it ends at night) and fades out to white in its own
          // padding at its foot, where there are no words; the words on ink.
          const ground = await page.locator('.ls-band').evaluate(el => [getComputedStyle(el).backgroundImage, parseFloat(getComputedStyle(el).paddingBottom)]);
          assert.match(ground[0], /^linear-gradient\(rgb\(11, 12, 15\).*rgb\(11, 12, 15\).*rgb\(255, 255, 255\)/, `${at}: ink to white`);
          assert.ok(ground[1] >= 100, `${at}: the fade sits in the band's padding (${ground[1]})`);
          // The wallets of the second line, by name only, beside the phone (a screen reader has them in the line).
          assert.deepEqual(await page.locator('.ls-wallet-chip').allTextContents(), ['Zodl', 'Zingo', 'YWallet', 'Zkool'], `${at}: the four names`);
          assert.equal(await page.locator('.ls-wallets').getAttribute('aria-hidden'), 'true', `${at}: hidden from a screen reader`);
          assert.equal(await page.locator('.ls-wallets img, .ls-wallets svg:not(.ls-chip-check)').count(), 0, `${at}: no logos`);
          assert.deepEqual(await page.locator('.ls-chip-check path').evaluateAll(list => [...new Set(list.map(p => p.getAttribute('d')))]), ['M2.4 6.3l2.4 2.4 4.8-5.2'], `${at}: each name has only a check to draw`);
          assert.equal(await page.locator('.ls-line').first().evaluate(el => getComputedStyle(el).color), 'rgb(242, 245, 247)', `${at}: the lines are light`);
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
            // The band does not hold the screen; both lines are there to read; nothing runs; no video is fetched.
            assert.ok(await page.locator('.ls-band.ls-still').count(), `${at}: the band is still`);
            assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ls-band-stage')).position), 'relative', `${at}: no sticky stage`);
            await scrollToEl(page, '.ls-band');
            await page.waitForTimeout(150);
            assert.deepEqual(await page.locator('.ls-line').evaluateAll(list => list.map(el => getComputedStyle(el).opacity)), ['1', '1'], `${at}: every line shown`);
            assert.equal(await page.locator('.ls-wallet-chip.on').count(), 4, `${at}: every name lit`);
            assert.equal(await page.evaluate(() => document.getAnimations().length), 0, `${at}: nothing runs`);
            await noSideways(page, `${at} band`);
            await page.waitForFunction(() => document.querySelector('.ls-phone video')?.getAttribute('poster'), null, { timeout: 4000 });
            assert.deepEqual(await video.evaluate(v => [v.paused, v.querySelectorAll('source').length]), [true, 0], `${at}: the recording is a still`);
            assert.ok(!requests.some(url => /\/landing\/sections-pay\.(webm|mp4)$/.test(url)), `${at}: no video is fetched`);
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
            // The band: it holds the screen while its lines light in turn, and the recording plays while it is seen.
            const track = await page.evaluate(() => { const r = document.querySelector('.ls-track').getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; });
            const view = await page.evaluate(() => innerHeight);
            const seen = [];
            for (const part of [0.15, 0.85]) {
              await page.evaluate(y => scrollTo(0, y), track.top + (track.height - view) * part);
              await page.waitForTimeout(700);
              seen.push({
                state: await page.evaluate(() => document.querySelector('.ls-band').dataset.state),
                now: await page.locator('.ls-line.now').count(),
                sticky: await page.evaluate(() => Math.round(document.querySelector('.ls-band-stage').getBoundingClientRect().top)),
              });
              await noSideways(page, `${at} band ${part}`);
            }
            assert.deepEqual(seen.map(s => [s.state, s.now]), [['0', 1], ['1', 1]], `${at}: the lines follow the scroll`);
            // The heading came up through its mask and is there to read (not left clipped).
            assert.ok(await page.locator('.ls-band h2').evaluate(h2 => !h2.classList.contains('lz-masked') && getComputedStyle(h2.firstElementChild ?? h2).clipPath === 'none'), `${at}: the band's heading is not left masked`);
            assert.ok(seen.every(s => s.sticky === 0), `${at}: the band holds the screen (${seen.map(s => s.sticky)})`);
            await page.waitForFunction(() => { const v = document.querySelector('.ls-phone video'); return v && !v.paused && v.currentTime > 0.2; }, null, { timeout: 8000 });
            assert.equal(await video.getAttribute('poster'), '/landing/sections-pay-poster.webp', `${at}: the recording's still`);
            assert.ok(requests.some(url => /\/landing\/sections-pay\.(webm|mp4)$/.test(url)), `${at}: the recording is fetched when the band is near`);
            // The phone stands large: its top under the header, most of it on the screen (its foot runs into the ink).
            const frame = await page.evaluate(() => { const r = document.querySelector('.ls-phone').getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; });
            const shown = (Math.min(frame[1], view) - Math.max(frame[0], 0)) / (frame[1] - frame[0]);
            assert.ok(frame[0] >= 56 && shown >= 0.7 && frame[2] >= 0 && frame[3] <= width, `${at}: the phone's top and most of it on the screen (${frame.map(Math.round)}, ${shown.toFixed(2)})`);
            // While the band holds the screen, the gold reaches each wallet's name in turn: all four lit by the end.
            assert.equal(await page.locator('.ls-wallet-chip.on').count(), 4, `${at}: every name lit at the end of the hold`);
            // The phone is straight once the band holds the screen.
            assert.equal(await page.locator('.ls-tilt').evaluate(el => el.style.getPropertyValue('--rx')), '0.00deg', `${at}: the phone is straight`);
            // Off screen it stops; so does the ring.
            await page.evaluate(() => scrollTo(0, 0));
            await page.waitForTimeout(500);
            assert.equal(await video.evaluate(v => v.paused), true, `${at}: the recording stops off screen`);
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

// The recording's files: each video at most 350 KB, the still at most 400 KB.
for (const [file, most] of [['sections-pay.webm', 350_000], ['sections-pay.mp4', 350_000], ['sections-pay-poster.webp', 400_000]]) {
  const response = await fetch(`${origin}/landing/${file}`);
  assert.equal(response.status, 200, file);
  const size = (await response.arrayBuffer()).byteLength;
  assert.ok(size > 1000 && size <= most, `${file}: ${size} bytes`);
}
console.log(`landing-sections: ${checks} visits passed`);
