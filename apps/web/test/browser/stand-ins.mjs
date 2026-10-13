// The live preview works with stand-ins (a fixed testnet address, a rate of 1000) until the organiser's own are typed.
// They must never reach anything that leaves the page: links, Copy link, Copy all, Send, QR codes, the table and
// organiser links, storage, or the page itself. Here the organiser's address and rate differ from both stand-ins.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/stand-ins.mjs
import assert from 'node:assert/strict';
import qrcode from 'qrcode-generator';
import { decodeShare } from '../../../../packages/engine/src/index.ts';
import { decodeTable } from '../../src/table-link.ts';
import { requestFor } from '../../src/pay.ts';
import { fillIn, makeLinks, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const STANDIN_PAYEE = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const STANDIN_RATE = '1000';
const REAL = 'utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm';
const RATE = '1327.32';
const clean = (text, where) => {
  assert.ok(!text.includes(STANDIN_PAYEE), `${where}: no stand-in address`);
  assert.ok(!/1 ZEC = \$1,000\b|"1000"/.test(text), `${where}: no stand-in rate`);
};
const share = (fragment, where) => {
  const d = decodeShare(fragment);
  assert.equal(d.kind, 'share', `${where}: a whole share link`);
  assert.equal(d.share.payee, REAL, `${where}: pays the organiser's own address`);
  assert.equal(d.share.rate.fiatPerZec, RATE, `${where}: at the organiser's own rate`);
  assert.notEqual(d.share.rate.fiatPerZec, STANDIN_RATE);
  return d.share;
};
const pathOf = svg => /<path[^>]* d="([^"]+)"/.exec(svg)?.[1];
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    for (const mode of ['equal', 'items']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
      await context.addInitScript(() => {
        window.__shared = []; window.__copied = [];
        Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__shared.push(data); } });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied.push(text); } } });
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      // The preview runs on the stand-ins first: shares on People, the rate step before a rate, the address step empty.
      if (mode === 'items') {
        await openStep(page, 'Bill');
        await page.getByRole('radio', { name: 'Split by item', exact: true }).check();
      } else {
        await fillIn(page, 'Total', '90');
      }
      await fillIn(page, 'What was it for?', 'Dinner');
      await fillIn(page, 'Your name', 'Miro');
      await fillIn(page, 'Name of person 1', 'Ana');
      await fillIn(page, 'Name of person 2', 'Ben');
      if (mode === 'items') {
        await openStep(page, 'Items');
        const line = page.locator('.bill-item').first();
        await line.getByLabel('Item 1 name', { exact: true }).fill('Dinner');
        await line.getByLabel('Item 1 price', { exact: true }).fill('90');
        await line.getByRole('button', { name: 'Everyone', exact: true }).click();
        await page.getByRole('button', { name: 'Add an item', exact: true }).click();
        const fixed = page.locator('.bill-item').nth(1);
        await fixed.getByLabel('Item 2 name', { exact: true }).fill('Ben’s share');
        await fixed.getByLabel('Item 2 price', { exact: true }).fill('20');
        await fixed.getByRole('checkbox', { name: 'Ben', exact: true }).check();
      }
      await openStep(page, 'Rate');
      await openStep(page, 'Get paid');
      clean(await page.locator('body').innerHTML(), `${engine} ${mode} before the organiser's own`);
      await fillIn(page, 'Rate: one ZEC in that currency', RATE);
      await fillIn(page, 'Your Zcash address', REAL);
      await (await page.getByLabel('Remember my address and names on this device')).check();
      await makeLinks(page);
      await page.locator('.links .ready h1').waitFor();
      const where = `${engine} ${mode}`;
      // Every link on the screen, and what Copy link, Copy all and Send hand over.
      const previews = await page.getByRole('link', { name: 'Preview', exact: true }).evaluateAll(as => as.map(a => a.href));
      assert.equal(previews.length, 2, `${where}: a link for each friend`);
      const shares = previews.map((href, i) => share(new URL(href).hash.slice(1), `${where} preview ${i + 1}`));
      for (const button of await page.getByRole('button', { name: 'Copy link', exact: true }).all()) await button.click();
      for (const button of await page.getByRole('button', { name: 'Send', exact: true }).all()) await button.click();
      await page.getByRole('button', { name: 'Copy all', exact: true }).click();
      const { copied, sent } = await page.evaluate(() => ({ copied: window.__copied, sent: window.__shared.map(s => s.text) }));
      assert.deepEqual(copied.slice(0, 2), previews, `${where}: Copy link hands over the link on the card`);
      assert.equal(sent.length, 2, `${where}: Send hands over each friend's message`);
      for (const text of [...copied, ...sent]) {
        clean(text, `${where} handed over`);
        for (const link of text.match(/#s3\.[\w-]+/g) ?? []) share(link.slice(1), `${where} handed-over link`);
      }
      // The QR codes: each is the payment request of its own link, nothing else.
      for (const [i, summary] of (await page.locator('.person details.code summary').all()).entries()) {
        await summary.click();
        const svg = await page.locator('.person details.code').nth(i).locator('.qr').innerHTML();
        const request = requestFor(shares[i]);
        assert.equal(request.kind, 'request');
        assert.ok(request.uri.includes(REAL) && !request.uri.includes(STANDIN_PAYEE), `${where}: the request pays the organiser`);
        const qr = qrcode(0, 'M'); qr.addData(request.uri, 'Byte'); qr.make();
        assert.equal(pathOf(svg), pathOf(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true })), `${where}: QR code ${i + 1} holds exactly its request`);
      }
      // The table code and the organiser's own page carry the same shares.
      for (const name of ['Show Table QR', 'Open my page']) {
        const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
        const table = decodeTable(href.slice(1).replace(/\/(qr|mine.*)$/, ''));
        assert.equal(table.kind, 'table', `${where}: ${name} is a whole table link`);
        for (const row of table.rows) { assert.equal(row.share.payee, REAL); assert.equal(row.share.rate.fiatPerZec, RATE); }
      }
      // What Remember keeps, and the page itself.
      const kept = await page.evaluate(() => ({ local: JSON.stringify({ ...localStorage }), session: sessionStorage.length }));
      assert.match(kept.local, new RegExp(REAL), `${where}: Remember keeps the organiser's own address`);
      clean(kept.local, `${where} storage`);
      assert.equal(kept.session, 0);
      clean(await page.locator('body').innerHTML(), `${where} the page`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(`${engine}: with an address and rate unlike the stand-ins, equal and by item: links, Copy link, Copy all, Send, QR codes, table and organiser links, storage and the page carry only the organiser's own PASS`);
  } finally {
    await browser.close();
  }
}
