// The wallet band in its lab, in Chromium and WebKit, at 1512 × 860 and 390 × 844: the words are the approved
// sentences, word for word; the phone shows the app's own pay page for Ana, inert; after p = 0.85 the sheet's fields
// hold what the engine reads from her request; nothing overflows sideways; paused, nothing changes for a second;
// with reduced motion the band is a still that no scroll moves. Scrubbing the story makes no request.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs TAB_ORIGIN=http://127.0.0.1:8799 node test/band-lab.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { BAND_S1, BAND_S2, WALLETS } from '../../web/src/landing-band/text.ts';
import { demoRequest } from '../../web/src/landing-band/demo.ts';
import { LANDING_SAMPLE } from '../../web/src/landing-sample.ts';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const req = demoRequest();
const ana = LANDING_SAMPLE.shares.find(share => share.name === 'Ana');
const flat = text => text.replace(/\s+/g, ' ').trim();
const SIZES = [[1512, 860], [390, 844]];

/** Everything the band draws, as computed style, so a change anywhere shows. */
const snapshot = () => [...document.querySelectorAll('.wb, .wb *')].map(el => {
  const cs = getComputedStyle(el);
  return [cs.transform, cs.opacity, cs.color, cs.backgroundColor, cs.boxShadow, cs.borderRadius, cs.textShadow, el.childElementCount ? '' : el.textContent].join('|');
}).join('\n');
const fields = () => ({
  to: document.querySelector('.wb-field[data-f="to"] .wb-val').textContent,
  amount: document.querySelector('.wb-field[data-f="amount"] .wb-val').textContent,
  note: document.querySelector('.wb-field[data-f="note"] .wb-val').textContent,
});
// The page never scrolls sideways, and the band's box stays inside the screen (what it clips inside itself is its own).
const wide = () => {
  const box = document.querySelector('.wb').getBoundingClientRect();
  return document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth && box.left >= 0 && box.right <= innerWidth;
};

/** The words and the page, the same in motion and still. */
async function words(page, at) {
  assert.equal(await page.locator('.wb-s1').evaluate(el => el.textContent), BAND_S1, `${at} first sentence`);
  assert.equal(await page.locator('.wb-s1').evaluate(el => el.innerText.replace(/\s+/g, ' ').trim()), BAND_S1, `${at} first sentence as read`);
  assert.equal(await page.locator('.wb-s2').evaluate(el => el.textContent), BAND_S2, `${at} second sentence`);
  assert.deepEqual(await page.locator('.wb-key').evaluateAll(els => els.map(el => el.textContent)), ['the address', 'the amount', 'the note']);
  assert.deepEqual(await page.locator('.wb-wallet').evaluateAll(els => els.map(el => el.textContent)), [...WALLETS]);
  // No line of the second sentence starts with punctuation (a name, its check and its comma stay together).
  assert.ok(await page.locator('.wb-s2').evaluate(el => {
    const range = document.createRange();
    const tops = new Set();
    let starts = '';
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        for (let i = 0; i < node.length; i++) {
          range.setStart(node, i); range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          if (!rect.width) continue;
          const top = Math.round(rect.top);
          if (!tops.has(top)) { tops.add(top); starts += node.data[i]; }
        }
      } else node.childNodes.forEach(walk);
    };
    walk(el);
    return !/[,.]/.test(starts);
  }), `${at} no line of the second sentence starts with a comma or a full stop`);
  // The phone's page is the app's own pay page for Ana, and nothing on it can be reached.
  const card = page.locator('.wb .card.pay');
  const text = flat(await card.evaluate(el => el.textContent));
  for (const part of ['Testnet: not real ZEC', LANDING_SAMPLE.label, 'Ana, your share is', `$${ana.fiatShare}`, `That is ${ana.zec} ZEC.`, 'Pays Lena', req.addressShort, 'Pay only if Lena sent you this link. Check the address with them if you are unsure.', 'Open in my wallet']) {
    assert.ok(text.includes(part), `${at} pay page has “${part}”`);
  }
  assert.equal(await card.locator('.button.primary').getAttribute('href'), req.uri, `${at} the button carries the engine’s request`);
  assert.equal(await page.locator('.wb-screen').getAttribute('inert'), '', `${at} the screen is inert`);
  assert.equal(await page.locator('.wb-screen').getAttribute('aria-hidden'), 'true');
  assert.ok((await page.locator('.wb-phone').getAttribute('aria-label')).includes('Ana'), `${at} the phone is described`);
  const sheet = flat(await page.locator('.wb-sheet').evaluate(el => el.textContent));
  assert.doesNotMatch(sheet, /sent|paid|success|complete|done/i, `${at} the sheet never says a payment was made`);
  assert.ok(await page.evaluate(wide), `${at} no sideways overflow`);
}

for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const [width, height] of SIZES) {
      const at = `${engine} ${width}×${height}`;
      const phone = width < 760;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', locale: 'en-US', ...(phone ? { isMobile: engine !== 'webkit', hasTouch: true } : {}) });
      await context.addInitScript(() => { window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => { window.__frames++; return raf(cb); }; });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const requests = []; page.on('request', r => requests.push(r.url()));
      await page.goto(`${origin}/?hud=0`);
      await page.locator('.wb').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.wb.wb-static').count(), 0, `${at} in motion, not the still`);
      await words(page, at);

      // The fields are empty before the sheet fills them, and hold the engine's values after p = 0.85.
      await page.evaluate(() => window.lab.setProgress(0.4));
      assert.deepEqual(await page.evaluate(fields), { to: '', amount: '', note: '' }, `${at} empty before the fill`);
      await page.evaluate(() => window.lab.setProgress(0.86));
      assert.deepEqual(await page.evaluate(fields), { to: req.addressShort, amount: `${req.zec} ZEC`, note: req.note }, `${at} the engine’s values after p = 0.85`);
      assert.equal(req.zec, ana.zec, 'the amount is the ribbon’s figure for Ana');
      assert.equal(await page.locator('.wb-field[data-f="to"] .wb-val').evaluate(el => el.textContent), await page.locator('.wb .pays .ends').evaluate(el => el.textContent), `${at} To is the address as the pay page shows it`);
      await page.evaluate(() => window.lab.setProgress(1));
      assert.equal(await page.locator('.wb-key.lit').count(), 3, `${at} the three phrases are lit at the end`);
      assert.equal(await page.locator('.wb-wallet.lit').count(), 4, `${at} the four wallets are lit at the end`);
      assert.deepEqual(await page.evaluate(fields), { to: req.addressShort, amount: `${req.zec} ZEC`, note: req.note }, `${at} the values stay`);

      // No sideways overflow at the start, the middle and the end of the span.
      for (const p of [0, 0.5, 1]) {
        await page.evaluate(v => window.lab.scrollTo(v), p);
        await page.waitForTimeout(150);
        assert.ok(await page.evaluate(wide), `${at} no sideways overflow at p = ${p}`);
      }

      // Paused, nothing changes for a second; played, the lamps drift again.
      await page.evaluate(() => { window.lab.scrollTo(0.5); window.lab.setProgress(0.5); });
      await page.waitForTimeout(300);
      await page.evaluate(() => window.lab.setPaused(true));
      await page.waitForTimeout(80);
      const held = await page.evaluate(snapshot);
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(snapshot), held, `${at} paused, no computed style changed over a second`);
      await page.evaluate(() => window.lab.setPaused(false));
      await page.waitForTimeout(400);
      const lamps = () => [...document.querySelectorAll('.wb-lamp')].map(el => getComputedStyle(el).transform).join();
      const drifting = await page.evaluate(lamps);
      await page.waitForTimeout(250);
      assert.notEqual(await page.evaluate(lamps), drifting, `${at} played, the lamps drift`);

      // Scrubbing the whole story asks the network for nothing.
      const before = requests.length;
      for (let i = 0; i <= 20; i++) await page.evaluate(v => window.lab.setProgress(v), i / 20);
      await page.waitForTimeout(300);
      assert.equal(requests.length, before, `${at} no request while scrubbing`);
      assert.deepEqual(errors, [], `${at} no page errors`);
      await context.close();
    }

    // Reduced motion: the still, complete, and no scroll moves it.
    for (const [width, height] of SIZES) {
      const at = `${engine} ${width}×${height} reduced motion`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'en-US' });
      await context.addInitScript(() => { window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => { window.__frames++; return raf(cb); }; });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${origin}/?hud=0`);
      await page.locator('.wb.wb-static').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await words(page, at);
      assert.deepEqual(await page.evaluate(fields), { to: req.addressShort, amount: `${req.zec} ZEC`, note: req.note }, `${at} the fields are filled`);
      assert.equal(await page.locator('.wb-key.lit').count(), 3, `${at} the phrases are lit`);
      assert.equal(await page.locator('.wb-wallet.lit').count(), 4, `${at} the wallets are lit`);
      assert.deepEqual(await page.locator('.wb-ul, .wb-ck').evaluateAll(els => els.map(el => el.style.getPropertyValue('--d'))), Array(8).fill('0.000'), `${at} every underline and check is drawn`);
      // The underline and the check are out of the flow: the name's box is the word alone.
      assert.ok(await page.locator('.wb-wallet').evaluateAll(els => els.every(el => { const r = el.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(el.firstChild); const w = range.getBoundingClientRect(); return Math.abs(r.width - w.width) < 1; })), `${at} nothing drawn beside a name takes room in the line`);
      assert.equal(await page.locator('.wb-li').evaluateAll(els => els.every(el => getComputedStyle(el).opacity === '1')), true, `${at} every line is up`);
      const first = await page.evaluate(snapshot);
      await page.evaluate(() => { window.__frames = 0; });
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => window.__frames), 0, `${at} no animation frame is asked for`);
      assert.equal(await page.evaluate(snapshot), first, `${at} nothing changed`);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(snapshot), first, `${at} scrolling moves nothing`);
      assert.ok(await page.evaluate(wide), `${at} no sideways overflow`);
      assert.deepEqual(errors, [], `${at} no page errors`);
      await context.close();
    }
    console.log(`${engine} wallet band PASS: the approved words, the app’s pay page inert, the engine’s values after p = 0.85, no sideways overflow, pause holds, reduced motion is a still`);
  } finally {
    await browser.close();
  }
}
