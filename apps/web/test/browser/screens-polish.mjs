// The non-first-run screens after the 12 Oct polish: contrast on light cards, phone tap targets and field sizes, the
// organiser's progress and keep-the-link step, the picker and table code wording, the pay heading and the wallets of
// the dated log, the demo's first screen, copy confirmations, reduced motion, and no request or storage on a visit.
// Test values only (the public ZIP 321 testnet example address); no wallet is opened and nothing is paid.
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8776 node test/browser/screens-polish.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { makeTab } from '../../src/tab.ts';
import { encodeTable, mineFragment } from '../../src/table-link.ts';
import { newTab } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8776';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const demoConfig = { version: 1, network: 'test', address: 'utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm', viewingKey: 'uviewtest1' + 'q'.repeat(60), birthday: 4489000 };
const at = '2026-10-12T11:39:00.000Z';
const tab = makeTab({ createdAt: at, from: 'Lena', label: 'Dinner, Friday', payee: address, fiat: 'USD', total: '300', ownShare: '', people: ['Ana', 'Dragan', 'Tomás', 'Priya', 'Jonas'].map(name => ({ name, amount: '' })), rate: { fiatPerZec: '1229.06', source: 'Manual entry', observedAt: at } });
assert.equal(tab.kind, 'tab');
const table = encodeTable(tab.rows.map(r => r.fragment), []);
assert.equal(table.kind, 'fragment');
const g = table.fragment;
const twins = makeTab({ createdAt: at, from: 'Lena', label: 'Twins', payee: address, fiat: 'USD', total: '90', ownShare: '', people: [{ name: 'Ana', amount: '' }, { name: 'Ana', amount: '' }], rate: { fiatPerZec: '100', source: 'Manual entry', observedAt: at } });
const twinTable = encodeTable(twins.rows.map(r => r.fragment), []);
const url = {
  pay: `${origin}/#${tab.rows[0].fragment}`,
  viaPicker: `${origin}/#${g}/0`,
  picker: `${origin}/#${g}`,
  twins: `${origin}/#${twinTable.fragment}`,
  code: `${origin}/#${g}/qr`,
  mine: `${origin}/#${mineFragment(g, [])}`,
  demo: `${origin}/?demo#demo/1791806400000/1234567890abcdef/00`,
};
// The wallets of the dated log, exactly as the help's table names them.
const LOG = ['Zodl · iPhone', 'Zingo 2.0.24 · Android emulator', 'YWallet 1.15.3 · Android emulator', 'Zkool 6.32.0 · Android emulator', 'Zingo PC 2.0.26 · desktop'];
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

// Every text on a light card meets 4.5:1 against what is under it (backgrounds with alpha are laid over the card).
const lowContrast = () => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const under = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 4 && c[3] === 0) continue; layers.push(c); if (c.length === 3 || c[3] === 1) break; }
    let base = layers.pop() || [255, 255, 255];
    while (layers.length) { const [r, g, b, a = 1] = layers.pop(); base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]; }
    return base;
  };
  const bad = [];
  for (const el of document.querySelectorAll('.card *, .person *')) {
    if (el.closest('.own, .testnet, [hidden], details:not([open]) > :not(summary)')) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) continue;
    if (el.closest('.copy-status.quiet')) continue;
    const fg = rgb(s.color), x = lum(fg), y = lum(under(el)), ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 40)}" ${ratio.toFixed(2)}`);
  }
  return bad;
};
const tapAndFields = () => {
  const out = [];
  for (const el of document.querySelectorAll('.tap-link, .table-back, .demo-nav a, .card button:not([hidden]), .card summary, .card a.button')) {
    const b = el.getBoundingClientRect(); if (!b.width || el.closest('details:not([open]) > :not(summary), [hidden]')) continue;
    if (b.height < 43.5) out.push(`target ${el.textContent.trim()} ${Math.round(b.height)}px`);
  }
  for (const el of document.querySelectorAll('.card input:not([type=checkbox]), .card select, .card textarea')) {
    if (!el.getBoundingClientRect().width || el.closest('details:not([open])')) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`field ${el.id} ${getComputedStyle(el).fontSize}`);
    const s = getComputedStyle(el);
    if (/hidden|clip/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) out.push(`clipped ${el.id}`);
  }
  if (document.documentElement.scrollWidth > innerWidth) out.push('page wider than the screen');
  return out;
};

for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    await context.addInitScript(() => {
      window.__storage = 0; window.__copied = [];
      for (const m of ['getItem', 'setItem', 'removeItem', 'clear']) { const old = Storage.prototype[m]; Storage.prototype[m] = function (...a) { window.__storage++; return old.apply(this, a); }; }
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied.push(t); } } });
    });
    await context.route('**/demo-receiver.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoConfig) }));
    const page = await context.newPage();
    const errors = [], hosts = new Set();
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => hosts.add(new URL(r.url()).origin));
    const open = async (to, ready) => { await page.goto('about:blank'); await page.goto(to); await page.locator(ready).first().waitFor(); await page.evaluate(() => document.fonts.ready); };
    const everyWidth = async (name, check) => {
      for (const width of [320, 390, 1280]) for (const colorScheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 }); await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        // Two frames, so the page has answered the resize (a button held at its width while it says Copied lets go).
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.deepEqual(await page.evaluate(lowContrast), [], `${engine} ${name} ${width} ${colorScheme}: text on light cards meets 4.5:1`);
        if (width < 600) assert.deepEqual(await page.evaluate(tapAndFields), [], `${engine} ${name} ${width} ${colorScheme}: 44 px targets, 16 px fields, nothing cut off`);
        else assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await check?.(width);
        if (shots) await page.screenshot({ path: `${shots}/${engine}-${name}-${width}-${colorScheme}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    };

    // The links screen, made through the guided steps (as stamps.mjs does): notes inside the light invite cards are
    // ink grey, 4.5:1 or more; the note on the dark page keeps the dark page's grey, so the page looks as before.
    await page.goto(origin);
    await newTab(page, { total: '90', address, rate: '100' });
    await page.locator('.results .mine-invite').waitFor();
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      assert.deepEqual(await page.locator('.results').evaluate(results => [...results.querySelectorAll('.card, .person')].flatMap(card => [...card.querySelectorAll('*')].map(el => [el, card]))
        .filter(([el, card]) => !card.matches('.own') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.matches('.note, .rate'))
        .map(([el]) => getComputedStyle(el).color).filter(c => c !== 'rgb(87, 82, 69)')), [], `${engine} ${colorScheme}: notes in light cards are ink grey`);
      assert.equal(await page.locator('.results > section > p.note').last().evaluate(e => getComputedStyle(e).color), 'rgb(169, 164, 150)', 'the note on the dark page keeps the page grey');
    }

    // Pay page: the label above, whose share and how much as the heading; the caution before the button.
    await open(url.pay, '.card.pay a.primary');
    assert.equal(await page.locator('.card.pay > .eyebrow').innerText(), 'Dinner, Friday');
    assert.equal((await page.locator('h1.owed').innerText()).replace(/\s+/g, ' '), 'Ana, your share is $50.00');
    const order = await page.locator('.card.pay > *').evaluateAll(els => els.map(e => e.className.split(' ')[0] || e.tagName.toLowerCase()));
    assert.ok(order.indexOf('testnet') === 0 && order.indexOf('caution') < order.indexOf('button') && order.indexOf('wallets-checked') < order.indexOf('wallet-help'), order.join(','));
    assert.ok(await page.locator('.card.pay a.primary').evaluate(e => e.getBoundingClientRect().bottom <= 844), 'Open in my wallet on the first phone screen');
    // Which wallet, without opening the help: only wallets, places and dates of the help's own dated log.
    assert.equal(await page.locator('.wallet-help').evaluate(d => d.open), false);
    // The claims review's wording, word for word (12 Oct 2026), with "Which wallet?" as the bold lead.
    const said = await page.locator('.wallets-checked > *').evaluateAll(els => els.flatMap(e => e.matches('ul') ? [...e.children] : [e]).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(said, ['Which wallet? We have tried these, 10–11 October 2026:', 'iPhone: Zodl (our own report)', 'Android emulator: Zingo 2.0.24, YWallet 1.15.3, Zkool 6.32.0', 'Desktop: Zingo PC 2.0.26 (testnet)', 'Each result and its limits are in the help below.']);
    assert.equal(await page.locator('.wallets-lead strong').textContent(), 'Which wallet?');
    await page.locator('.wallet-help > summary').click();
    assert.deepEqual(await page.locator('.wallet-checks th').allInnerTexts(), LOG, 'the log itself is unchanged');
    // Every wallet and place the box names is a row of the log, and every row of the log is in the box.
    const boxed = said.slice(1, 4).flatMap(line => { const [place, wallets] = line.split(': '); return wallets.replace(/ \([^)]*\)/g, '').split(', ').map(wallet => `${wallet} · ${place === 'Desktop' ? 'desktop' : place}`); });
    assert.deepEqual([...boxed].sort(), [...LOG].sort(), 'the box names exactly the rows of the log');
    assert.equal(await page.locator('.wallet-checks caption').innerText(), 'Wallet checks, 10–11 October 2026');
    // The request in the help is shown whole on a phone.
    const box = await page.locator('#wallet-request').evaluate(e => ({ size: parseFloat(getComputedStyle(e).fontSize), whole: e.scrollHeight <= e.clientHeight + 1 || getComputedStyle(e).overflowY === 'auto' }));
    assert.ok(box.size >= 16 && box.whole, JSON.stringify(box));
    assert.match(await page.locator('.stub .note').innerText(), /Scan the QR code with your phone/);
    // A copy confirmation: the button keeps its width, shows a drawn tick, and the word is said to a screen reader.
    const copy = page.getByRole('button', { name: 'Copy payment request', exact: true });
    const before = await copy.evaluate(e => e.getBoundingClientRect().width);
    await copy.click();
    const done = page.locator('.request-copy button.done');
    await done.waitFor();
    assert.equal(await done.innerText(), 'Copied');
    assert.ok(Math.abs(await done.evaluate(e => e.getBoundingClientRect().width) - before) < 1, 'same width while it says Copied');
    assert.deepEqual(await done.evaluate(e => { const s = getComputedStyle(e, '::before'); return [s.content, s.animationName]; }), ['""', 'none'], 'a drawn tick, still, with reduced motion');
    assert.deepEqual(await page.locator('.request-copy .copy-status').evaluate(e => [e.textContent, e.getBoundingClientRect().width <= 1]), ['Copied', true]);
    assert.equal(await page.evaluate(() => window.__copied.at(-1)), await page.locator('.card.pay a.primary').getAttribute('href'));
    await page.locator('.wallet-help > summary').click();
    await everyWidth('pay');

    // Coming from the name picker, the way back is a full tap target on the dark page.
    await open(url.viaPicker, '.card.pay a.primary');
    assert.ok(await page.locator('.table-back').evaluate(e => e.getBoundingClientRect().height >= 44));
    await everyWidth('pay-via-picker');

    // Name picker: no numbers under unique names; a number only tells two rows of one name apart.
    await open(url.picker, '.table-person');
    assert.equal(await page.locator('.table-person small').count(), 0);
    await everyWidth('picker');
    await open(url.twins, '.table-person');
    assert.deepEqual(await page.locator('.table-person small').allInnerTexts(), ['Share 1', 'Share 2']);

    // Table code: one word for it, and who can see the table is said before its link is copied.
    await open(url.code, '.table-qr svg');
    assert.equal(await page.locator('.table-code h1').innerText(), 'Table QR code');
    assert.equal(await page.locator('.table-qr').getAttribute('aria-label'), 'Table QR code: scan with your phone camera');
    const codeOrder = await page.locator('.table-code > *').evaluateAll(els => els.map(e => e.textContent));
    assert.ok(codeOrder.findIndex(t => t.startsWith('Anyone with this table link')) < codeOrder.findIndex(t => t.includes('Copy table link')));
    await everyWidth('table-code');

    // Organiser: one box of caution and how to tick, then the count and its bar.
    await open(url.mine, '.mine-person');
    assert.equal(await page.locator('.table-mine .caution').first().innerText(), 'Your own record. Ztab cannot see payments on its own.');
    assert.deepEqual(await page.locator('.mine-guide > p').allInnerTexts(), ['Your own record. Ztab cannot see payments on its own.', 'Tick a person when you see their payment in your wallet. A tick does not check anything: it is your mark.']);
    const fill = () => page.locator('.mine-bar > i').evaluate(e => getComputedStyle(e).getPropertyValue('--done').trim());
    assert.equal(await page.locator('.mine-count').innerText(), '0 of 5 ticked');
    assert.equal(await fill(), '0');
    assert.equal(await page.locator('.mine-bar').getAttribute('aria-hidden'), 'true', 'the count is announced, the bar is not');
    const keepButton = page.getByRole('button', { name: 'Copy this page’s link', exact: true });
    // Read after the colour has settled: buttons keep their short colour fade.
    const gold = async () => { await page.waitForTimeout(250); return keepButton.evaluate(e => getComputedStyle(e).backgroundColor); };
    assert.equal(await page.locator('.mine-saved').isVisible(), false);
    assert.notEqual(await gold(), 'rgb(244, 183, 40)', 'before a tick it is not the main action');
    // The whole-tab disclosure stays in front of the copy action it qualifies.
    const keepOrder = await page.locator('.mine-keep > *').evaluateAll(els => els.map(e => e.textContent));
    assert.ok(keepOrder.indexOf('Anyone with this link can see the whole tab.') < keepOrder.findIndex(t => t.includes('Copy this page’s link')));
    // The first tick: saved line, gold button, the bar a fifth full, the address written as before.
    await page.locator('.mine-person input').nth(1).check();
    assert.match(page.url(), /\/mine\/01000$/);
    assert.equal(await page.locator('.mine-count').innerText(), '1 of 5 ticked');
    assert.equal(await fill(), '0.2');
    assert.equal(await page.locator('.mine-saved').innerText(), 'Ticks are saved in this link.');
    assert.equal(await gold(), 'rgb(244, 183, 40)', 'after the first tick copying the link is the main action');
    assert.equal(await page.locator('.mine-person').nth(1).evaluate(li => getComputedStyle(li.querySelector('input')).animationName), 'none', 'no bounce with reduced motion');
    await keepButton.click();
    assert.equal(await page.evaluate(() => window.__copied.at(-1)), page.url());
    await everyWidth('organiser', async width => { if (width === 320) assert.equal(await page.locator('.mine-person').first().locator('.mine-head strong').evaluate(e => e.getBoundingClientRect().width >= 100), true); });
    // Unticking the last tick takes the step back to a quiet one.
    await page.locator('.mine-person input').nth(1).uncheck();
    assert.equal(await page.locator('.mine-saved').isVisible(), false);
    assert.match(page.url(), /\/mine$/);
    // With motion allowed, a tick made here bounces once; a box ticked by the link does not.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.mine-person input').nth(2).check();
    assert.equal(await page.locator('.mine-person').nth(2).evaluate(li => getComputedStyle(li.querySelector('input')).animationName), 'mine-tick');
    await page.locator('.mine-person.just-ticked').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.reload(); await page.locator('.mine-person').first().waitFor();
    assert.equal(await page.locator('.mine-person.just-ticked').count(), 0, 'ticks read from the link do not bounce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Every box ticked: the bar is full and the settled record shows.
    for (const i of [0, 1, 3, 4]) await page.locator('.mine-person input').nth(i).check();
    assert.equal(await fill(), '1');
    await page.getByRole('heading', { name: 'Settled in your record', exact: true }).waitFor();
    assert.ok(await page.locator('.mine-new .tap-link').evaluate(e => e.getBoundingClientRect().height >= 44));

    // Demo: the caution in full, then the button, on a phone's first screen; what a payment needs follows.
    for (const [width, height] of [[390, 844], [320, 800], [360, 740]]) {
      await page.setViewportSize({ width, height });
      await open(url.demo, 'button.primary');
      assert.ok(await page.getByRole('button', { name: 'Load sample dinner', exact: true }).evaluate((e, h) => e.getBoundingClientRect().bottom <= h, height), `Load sample dinner on the first screen at ${width}×${height}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const intro = await page.locator('.demo-intro > *').evaluateAll(els => els.map(e => e.textContent));
    const caution = intro.indexOf('This is a public testnet demo. Use test coins only. Anyone can read payments and notes sent to this sample receiver with its public viewing key. Do not send personal information.');
    assert.ok(caution > 0 && caution < intro.findIndex(t => t === 'Load sample dinner'), 'the caution is read before the button');
    const needs = (await page.locator('.demo-needs').textContent()).replace(/\s+/g, ' ');
    for (const part of ['No wallet is needed to look for the example.', 'We tested Zingo PC 2.0.26; support in other wallets may differ.', 'Get test coins from the Valar faucet for your own testnet wallet. This opens another site.']) assert.ok(needs.includes(part), part);
    await everyWidth('demo');
    await page.getByRole('button', { name: 'Load sample dinner', exact: true }).click();
    await page.getByText('Sample ready. Testnet only.').waitFor();
    await everyWidth('demo-loaded');
    await page.getByRole('link', { name: 'Make your own bill', exact: true }).waitFor();

    assert.equal(await page.evaluate(() => window.__storage), 0, `${engine}: no storage call on these screens`);
    assert.deepEqual([...hosts].filter(h => h !== 'null'), [new URL(origin).origin], `${engine}: no request to another origin`);
    assert.deepEqual(errors, []);
    console.log(`${engine}: contrast, 44 px targets, 16 px fields, pay heading and wallets of the log, picker and code wording, organiser progress and keep step, demo first screen, copy confirmation, reduced motion, no storage or other origin at 320/390/1280 light/dark PASS`);
  } finally { await browser.close(); }
}
