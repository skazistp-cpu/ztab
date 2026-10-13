// The two sections under the opening's first screen: the grid of five tiles and the band of ink with the phone.
// Chromium and WebKit, a phone and a laptop, light and dark, with and without motion: the approved sentences word for
// word, the sample link, the figures against the app's own code, loops that stop off screen, a still picture with
// reduced motion, the phone's page moved on by the scroll, no sideways scroll, and no request to another origin.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/landing-sections.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { splitItems } from '../../src/items.ts';
import { DEMO_ITEMS } from '../../src/demo.ts';
import { LANDING_SAMPLE } from '../../src/landing-sample.ts';
import { makeTab } from '../../src/tab.ts';
import { formatFiat } from '../../src/money.ts';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8764').replace(/\/$/, '');
const flat = text => text.replace(/\s+/g, ' ').trim();

// Word for word, as approved.
const TITLE = 'Split the bill. Get paid back in Zcash.';
const TILES = [
  'Split it equally or by item, with a tip.',
  'Each link opens one standard ZIP 321 payment request for one person.',
  'At the table, show one QR: each friend scans it and chooses their name.',
  'They pay from their own Zcash wallet.',
  'Try a sample dinner on Zcash’s test network, with test coins only.',
];
const BAND = 'They pay from their own Zcash wallet.';
// In the order of the phone's page: the request, the wallets tried, then the code.
const LINES = [
  'A wallet that reads the request fills in the address and the amount, and the note if it supports one.',
  'We have tried the requests in Zodl, Zingo, YWallet and Zkool.',
  'Ztab cannot see payments on its own.',
];

// The sample dinner, split by the app's own code: what the items tile ends on and what the receipt prints.
const usd = amount => `$${amount}`;
// The ring's twelve friends: the sample dinner's five, then two more tabs split by makeTab.
const ringTab = (label, fiat, total, rate, names) => {
  const at = '2026-10-12T00:00:00.000Z';
  const tab = makeTab({ createdAt: at, from: 'Lena', label, payee: 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez', fiat, total, ownShare: '', people: names.map(name => ({ name, amount: '' })), rate: { fiatPerZec: rate, source: 'Manual entry', observedAt: at } });
  assert.equal(tab.kind, 'tab');
  return tab.rows.map(row => `${row.name} ${formatFiat(row.fiatShare, fiat)}`);
};
const RING = [
  ...LANDING_SAMPLE.shares.filter(s => !s.own).map(s => `${s.name} ${usd(s.fiatShare)}`),
  ...ringTab('Pizza night', 'USD', '92.00', '1229.06', ['Mia', 'Noah', 'Sara', 'Leo']),
  ...ringTab('Brunch', 'EUR', '109.20', '1052.40', ['Eva', 'Marek', 'Zoe']),
];
assert.equal(RING.length, 12);
const dinner = splitItems(['Lena', 'Ana', 'Ben'], DEMO_ITEMS, '10');
assert.equal(dinner.kind, 'split');

/** Animations inside a part of the page, as the browser reports them. */
const running = (page, selector) => page.evaluate(sel => {
  const root = document.querySelector(sel);
  return root ? root.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length : -1;
}, selector);
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
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', e => errors.push(e.message));
          page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
          const requests = [];
          page.on('request', r => requests.push(r.url()));
          await page.goto(origin + '/');
          await page.locator('.ls .ls-bento').waitFor();
          await page.evaluate(() => document.fonts.ready);
          if (motion === 'reduce') {
            // From the first frames on, nothing in the sections moves, not even a transition.
            await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => document.querySelector('.ls').getAnimations({ subtree: true }).length), 0, `${at}: nothing moves on arrival`);
          }

          // The recording: muted, inline, looped, nothing fetched for it on arrival.
          const video = page.locator('.ls-phone video');
          assert.deepEqual(await video.evaluate(v => [v.muted, v.hasAttribute('playsinline'), v.loop, v.autoplay, v.preload, v.controls]), [true, true, true, false, 'none', false], `${at}: the recording's settings`);
          assert.ok(!requests.some(url => /\/landing\/sections-pay/.test(url)), `${at}: the recording waits until the band is near`);

          // The words, exactly; no em dash anywhere in them.
          const text = flat(await page.locator('.ls').innerText());
          assert.ok(!text.includes('—'), `${at}: no em dash`);
          assert.equal(flat(await page.locator('.ls-title').textContent()), TITLE, `${at}: the grid's title`);
          assert.deepEqual((await page.locator('.ls-say').allTextContents()).map(flat), TILES, `${at}: the five tiles, in order`);
          assert.equal(flat(await page.locator('.ls-band-title').textContent()), BAND, `${at}: the band's heading`);
          assert.deepEqual((await page.locator('.ls-line').allTextContents()).map(flat), LINES, `${at}: the band's three lines`);
          assert.equal(await page.locator('.ls h2').count(), 2, `${at}: one heading for each section`);

          // The sample link: its words, where it goes, and a ring when it has the focus.
          const sample = page.locator('.ls-e .ls-say a');
          assert.equal(await sample.textContent(), 'Try a sample dinner', `${at}: the sample link's words`);
          const href = await sample.getAttribute('href');
          assert.equal(new URL(href, origin + '/').search, '?demo', `${at}: the sample link opens ?demo`);
          assert.equal(new URL(href, origin + '/').origin, origin, `${at}: the sample link stays on this site`);

          // Pictures of the app are named for a screen reader, and nothing in them can be pressed.
          for (const label of await page.locator('.ls [role="img"]').evaluateAll(list => list.map(el => el.getAttribute('aria-label') ?? ''))) {
            assert.ok(label.length > 40, `${at}: a picture is named (${label})`);
          }
          assert.equal(await page.locator('.ls button, .ls input').count(), 0, `${at}: nothing in the pictures can be pressed`);
          assert.deepEqual(await page.locator('.ls [tabindex]').evaluateAll(list => list.map(el => el.classList.contains('ls-ring-stage'))), [true], `${at}: only the ring takes the focus (to stop it)`);
          // The ring: twelve friends of three tabs, by the engine, and the approved caption.
          const ring = await page.locator('.ls-ring-card').evaluateAll(list => list.map(c => `${c.querySelector('.ls-ring-name').textContent} ${c.querySelector('.ls-ring-amount').textContent}`));
          assert.deepEqual(ring, RING, `${at}: the ring's cards`);
          assert.equal(flat(await page.locator('.ls-ring-caption').textContent()), TILES[1], `${at}: the ring's caption`);
          // The counts: four facts, each counted up to its figure once the strip is seen (at once with reduced motion).
          assert.deepEqual(await page.locator('.ls-count-label').allTextContents(), ['ZIP 321 conformance tests passed', 'currencies', 'wallets tried', 'accounts'], `${at}: the counts' words`);
          await scrollToEl(page, '.ls-counts', -200);
          await page.waitForFunction(() => [...document.querySelectorAll('.ls-count-num')].map(n => n.textContent).join() === '67,6,4,0', null, { timeout: 4000 });
          assert.deepEqual((await page.locator('.ls-count').allTextContents()).map(flat), ['6767 ZIP 321 conformance tests passed', '66 currencies', '44 wallets tried', '00 accounts'], `${at}: each figure also said once, in full`);
          // The longer first label may take two lines; the words of the others still start where its words start.
          const labelTops = await page.locator('.ls-count-label').evaluateAll(list => list.map(el => Math.round(el.getBoundingClientRect().top)));
          assert.deepEqual(width < 760 ? [labelTops[0] - labelTops[1], labelTops[2] - labelTops[3]] : [labelTops[0] - labelTops[1], labelTops[1] - labelTops[2], labelTops[2] - labelTops[3]], width < 760 ? [0, 0] : [0, 0, 0], `${at}: the four labels start level (${labelTops})`);
          assert.equal(await page.locator('.ls a').count(), 1, `${at}: the sample link is the only link`);


          // Both sections keep their own ground in a dark system too: paper for the grid, ink for the band.
          const grounds = await page.evaluate(() => [getComputedStyle(document.querySelector('.ls-bento')).backgroundColor, getComputedStyle(document.querySelector('.ls-band')).backgroundColor, getComputedStyle(document.querySelector('.ls-title')).color, getComputedStyle(document.querySelector('.ls-band-title')).color]);
          // Slate on paper, near-white on ink, as the landing sets them (#2B2F3A, #F2F5F7).
          assert.deepEqual(grounds, ['rgb(251, 248, 241)', 'rgb(16, 18, 22)', 'rgb(43, 47, 58)', 'rgb(242, 245, 247)'], `${at}: grounds and headings`);

          // Every tile, in view: no sideways scroll, and with motion each one moves.
          for (const tile of ['.ls-a', '.ls-b', '.ls-c', '.ls-d', '.ls-e']) {
            await scrollToEl(page, tile, -40);
            await page.waitForTimeout(150);
            await noSideways(page, `${at} ${tile}`);
            if (motion === 'reduce') {
              await page.waitForTimeout(250);
              const moving = await page.evaluate(sel => document.querySelector(sel).getAnimations({ subtree: true }).length, tile);
              assert.equal(moving, 0, `${at}: ${tile} is still with reduced motion`);
            } else {
              // Something in the tile moves within its first few seconds on screen.
              const moved = await page.waitForFunction(sel => document.querySelector(sel).getAnimations({ subtree: true }).length > 0, tile, { timeout: 3000, polling: 50 }).then(() => true, () => false);
              assert.ok(moved, `${at}: ${tile} moves when in view`);
            }
          }

          if (motion === 'reduce') {
            // The still picture: every line of the sample dinner has its people, and the totals are the app's own.
            const picked = await page.locator('.ls-item').evaluateAll(items => items.map(item => [...item.querySelectorAll('.ls-pick')].map(p => p.classList.contains('on'))));
            assert.deepEqual(picked, DEMO_ITEMS.map(item => ['Lena', 'Ana', 'Ben'].map(id => item.people.includes(id))), `${at}: who had what`);
            const figures = await page.locator('.ls-totals .ls-fig').allTextContents();
            assert.deepEqual(figures, [usd(dinner.tip), usd(dinner.total), ...dinner.shares.map(s => usd(s.total))], `${at}: the totals, by splitItems`);
            const receipt = await page.locator('.ls-receipt .ls-rl').evaluateAll(list => list.map(p => [...p.children].map(c => c.textContent).filter(Boolean).join(' ')));
            assert.deepEqual(receipt, [...DEMO_ITEMS.map(i => `${i.name} ${i.amount}`), `Tip / service ${dinner.tip}`, `Total ${dinner.total}`], `${at}: the receipt`);
            assert.equal(await page.locator('.ls-pr.on').count(), 1, `${at}: one name chosen on the picker`);
            // The band does not hold the screen; all three lines are there to read.
            assert.ok(await page.locator('.ls-band.ls-still').count(), `${at}: the band is still`);
            assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ls-band-stage')).position), 'relative', `${at}: no sticky stage`);
            await scrollToEl(page, '.ls-band');
            await page.waitForTimeout(150);
            const shown = await page.locator('.ls-line').evaluateAll(list => list.map(el => getComputedStyle(el).opacity));
            assert.deepEqual(shown, ['1', '1', '1'], `${at}: every line shown`);
            assert.equal(await running(page, '.ls'), 0, `${at}: nothing runs`);
            await noSideways(page, `${at} band`);
            // The recording's still only: no files for it, nothing plays.
            await page.waitForFunction(() => document.querySelector('.ls-phone video')?.getAttribute('poster'), null, { timeout: 4000 });
            assert.deepEqual(await page.locator('.ls-phone video').evaluate(v => [v.paused, v.querySelectorAll('source').length]), [true, 0], `${at}: the recording is a still`);
            assert.ok(!requests.some(url => /\/landing\/sections-pay\.(webm|mp4)$/.test(url)), `${at}: no video is fetched`);
          } else {
            // The ring turns while it is seen, stops under the pointer, and stops off screen.
            await scrollToEl(page, '.ls-ring', -60);
            await page.waitForTimeout(300);
            const turning = () => page.evaluate(() => document.querySelector('.ls-ring-spin').getAnimations().filter(a => a.playState === 'running').length);
            assert.equal(await turning(), 1, `${at}: the ring turns`);
            await page.locator('.ls-ring-stage').hover({ position: { x: 20, y: 20 } });
            await page.waitForTimeout(150);
            assert.equal(await turning(), 0, `${at}: and stops under the pointer`);
            await page.mouse.move(1, 1);
            // The items tile's figures roll to the app's own totals, from nothing.
            await scrollToEl(page, '.ls-a', -40);
            await page.waitForFunction(total => document.querySelector('.ls-totals .ls-grand .ls-fig span:last-child')?.textContent === total, usd(dinner.total), { timeout: 9000 });
            const each = await page.locator('.ls-totals .ls-share .ls-fig').evaluateAll(list => list.map(f => f.lastElementChild?.textContent));
            assert.deepEqual(each, dinner.shares.map(s => usd(s.total)), `${at}: each person pays, by splitItems`);
            // The link cards copy, the picker lights up a name after a scan.
            await scrollToEl(page, '.ls-b', -40);
            await page.waitForSelector('.ls-b .ls-btn-ink.done', { timeout: 6000 });
            await scrollToEl(page, '.ls-c', -40);
            await page.waitForSelector('.ls-c .ls-pr.on', { timeout: 6000 });
            // Off screen, the loops stop and go back to their first frame.
            await page.evaluate(() => scrollTo(0, 0));
            await page.waitForTimeout(400);
            assert.equal(await running(page, '.ls-bento'), 0, `${at}: the grid's loops stop off screen`);
            assert.equal(await page.locator('.ls-pick.on').count(), 0, `${at}: and start again from nothing`);
            assert.equal(await page.evaluate(() => document.querySelector('.ls-ring-spin').getAnimations().length), 0, `${at}: the ring stops off screen`);

            // The band: it holds the screen while the lines come in one by one, and the recording plays while it is seen.
            const track = await page.evaluate(() => { const r = document.querySelector('.ls-track').getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; });
            const view = await page.evaluate(() => innerHeight);
            const seen = [];
            for (const part of [0.04, 0.5, 0.96]) {
              await page.evaluate(y => scrollTo(0, y), track.top + (track.height - view) * part);
              await page.waitForTimeout(700);
              seen.push({
                state: await page.evaluate(() => document.querySelector('.ls-band').dataset.state),
                lines: await page.locator('.ls-line.on').count(),
                sticky: await page.evaluate(() => Math.round(document.querySelector('.ls-band-stage').getBoundingClientRect().top)),
              });
              await noSideways(page, `${at} band ${part}`);
            }
            assert.deepEqual(seen.map(s => [s.state, s.lines]), [['0', 1], ['1', 2], ['2', 3]], `${at}: the lines follow the scroll`);
            assert.ok(seen.every(s => s.sticky === 0), `${at}: the band holds the screen (${seen.map(s => s.sticky)})`);
            await page.waitForFunction(() => { const v = document.querySelector('.ls-phone video'); return v && !v.paused && v.currentTime > 0.2; }, null, { timeout: 8000 });
            assert.equal(await video.getAttribute('poster'), '/landing/sections-pay-poster.webp', `${at}: the recording's still`);
            assert.ok(requests.some(url => /\/landing\/sections-pay\.(webm|mp4)$/.test(url)), `${at}: the recording is fetched when the band is near`);
            // The phone fits the screen while the band holds it.
            const frame = await page.evaluate(() => { const r = document.querySelector('.ls-phone').getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; });
            assert.ok(frame[0] >= 0 && frame[1] <= view + 1 && frame[2] >= 0 && frame[3] <= width, `${at}: the phone fits the screen (${frame.map(Math.round)})`);
            // Off screen it stops.
            await page.evaluate(() => scrollTo(0, 0));
            await page.waitForTimeout(400);
            assert.equal(await video.evaluate(v => v.paused), true, `${at}: the recording stops off screen`);
          }

          // A quiet visit: everything comes from this site.
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

// The figures the tiles show come from the app's own sample data.
assert.equal(LANDING_SAMPLE.shares[1].fiatShare, '56.00');
// The recording's files: each video at most 350 KB, the still at most 400 KB.
for (const [file, most] of [['sections-pay.webm', 350_000], ['sections-pay.mp4', 350_000], ['sections-pay-poster.webp', 400_000]]) {
  const response = await fetch(`${origin}/landing/${file}`);
  assert.equal(response.status, 200, file);
  const size = (await response.arrayBuffer()).byteLength;
  assert.ok(size > 1000 && size <= most, `${file}: ${size} bytes`);
}
console.log(`landing-sections: ${checks} visits passed`);
