// Old links open exactly as before. The fixture holds links of every format (s1, s2, s3, g1, g2 with their picker,
// table code, person and organiser routes, and a demo session) and what the build at 1c820e9 gave for each: the wallet
// request, every copied text, the address, note, rate and caution lines, the picker rows and the tick address.
// A presentation change must give the same. Test values only; no wallet is opened and nothing is paid.
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8776 node test/browser/old-links-requests.mjs
// To write the fixture again from a build of 1c820e9:  WRITE_FIXTURE=1 TAB_ORIGIN=<that build> node test/browser/old-links-requests.mjs
// (test/browser/old-links.mjs compares the whole screen with a reference build; this file holds what was asked for.)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8776';
const fixtureFile = new URL('../fixtures/old-links.json', import.meta.url);
const write = process.env.WRITE_FIXTURE === '1';
const vector = JSON.parse(readFileSync(new URL('../fixtures/finder-vector.json', import.meta.url), 'utf8'));
const demoConfig = { version: 1, network: 'test', address: 'utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm', viewingKey: vector.key, birthday: 4489000 };
const HERE = '{origin}';
const local = value => typeof value === 'string' ? value.split(origin).join(HERE)
  : Array.isArray(value) ? value.map(local)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, local(v)]))
  : value;

async function cases() {
  if (!write) return JSON.parse(readFileSync(fixtureFile, 'utf8')).cases;
  // Made once, by the engine of 1c820e9, and kept as text from then on.
  const { encodeShare } = await import('../../../../packages/engine/src/index.ts');
  const { encodeTable, mineFragment } = await import('../../src/table-link.ts');
  const sapling = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
  const unified = demoConfig.address, transparent = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';
  const rate = (fiat, fiatPerZec) => ({ fiat, fiatPerZec, source: 'Manual entry', observedAt: '2026-10-10T18:00:00Z' });
  const share = (over) => ({ network: 'test', payee: sapling, label: 'Dinner', name: 'Ana', from: 'Miro', fiatShare: '30.00', zatoshis: '30000000', rate: rate('USD', '100'), ...over });
  const fragment = (s) => { const e = encodeShare(s); if (e.kind !== 'fragment') throw new Error(JSON.stringify(e)); return e.fragment; };
  const at = { createdAt: '2026-10-10T18:00:00Z' };
  const v3 = { ...at, memoBrand: 'Ztab' };
  const list = [
    ['s1 sapling', fragment(share({}))],
    ['s2 sapling', fragment(share(at))],
    ['s3 sapling', fragment(share(v3))],
    ['s3 unified, EUR', fragment(share({ ...v3, payee: unified, rate: rate('EUR', '50'), fiatShare: '12.50', zatoshis: '25000000' }))],
    ['s3 transparent', fragment(share({ ...v3, payee: transparent }))],
    ['s3 no label, no names', fragment(share({ ...v3, label: '', name: '', from: '' }))],
  ].map(([name, f]) => ({ name, kind: 'pay', fragment: f }));
  const g1 = encodeTable([fragment(share({ ...at, name: 'Ana' })), fragment(share({ ...at, name: 'Ben', fiatShare: '20.00', zatoshis: '20000000' }))], []);
  const g2 = encodeTable([fragment(share({ ...v3, name: 'Ana' })), fragment(share({ ...v3, name: 'Ana', fiatShare: '20.00', zatoshis: '20000000' })), fragment(share({ ...v3, name: 'Cara' }))], ['Dan']);
  if (g1.kind !== 'fragment' || g2.kind !== 'fragment' || !g1.fragment.startsWith('g1.') || !g2.fragment.startsWith('g2.')) throw new Error('tables');
  for (const [name, g, n] of [['g1', g1.fragment, 2], ['g2', g2.fragment, 3]]) {
    list.push({ name: `${name} picker`, kind: 'picker', fragment: g });
    list.push({ name: `${name} table code`, kind: 'qr', fragment: `${g}/qr` });
    for (let i = 0; i < n; i++) list.push({ name: `${name} person ${i}`, kind: 'pay', fragment: `${g}/${i}` });
    list.push({ name: `${name} organiser`, kind: 'mine', fragment: mineFragment(g, []) });
    list.push({ name: `${name} organiser, first ticked`, kind: 'mine', fragment: mineFragment(g, Array.from({ length: n }, (_, i) => i === 0)) });
    list.push({ name: `${name} organiser, all ticked`, kind: 'mine', fragment: mineFragment(g, Array.from({ length: n }, () => true)) });
  }
  list.push({ name: 'demo session', kind: 'demo', fragment: 'demo/1791806400000/1234567890abcdef/10' });
  return list;
}

const texts = (page, selector) => page.locator(selector).evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
async function copied(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.count())) return null;
  await button.first().click();
  return local(await page.evaluate(() => window.__copied.at(-1)));
}

async function capture(page, item) {
  // Each link is opened as a fresh page, as when it is opened from a message.
  await page.goto('about:blank');
  await page.goto(`${origin}/${item.kind === 'demo' ? '?demo' : ''}#${item.fragment}`);
  if (item.kind === 'pay') {
    const wallet = page.getByRole('link', { name: 'Open in my wallet', exact: true });
    await wallet.waitFor();
    return {
      request: await wallet.getAttribute('href'),
      amount: (await texts(page, '.owed .amount'))[0],
      zec: (await texts(page, '.card.pay > .lead .zec'))[0],
      strip: await texts(page, '.testnet'),
      pays: await texts(page, '.pays'),
      caution: await texts(page, '.card.pay > .caution'),
      address: await texts(page, '.card.pay > .address'),
      warnings: await texts(page, '.card.pay .warning'),
      memo: await texts(page, '.card.pay > .memo'),
      rate: await texts(page, '.card.pay > .rate'),
      fixed: await texts(page, '.card.pay > .fixed'),
      qr: await page.locator('.pay .stub .qr').getAttribute('aria-label'),
      back: local(await page.getByRole('link', { name: 'Choose a different name', exact: true }).evaluateAll(as => as.map(a => a.href))),
      copyRequest: await copied(page, 'Copy payment request'),
      copyAddressAndAmount: await copied(page, 'Copy address and amount'),
    };
  }
  if (item.kind === 'picker') {
    await page.locator('.table-person').first().waitFor();
    return {
      rows: local(await page.locator('.table-person').evaluateAll(as => as.map(a => [a.href, a.querySelector('strong').textContent, a.querySelector('.amount').textContent]))),
      caution: await texts(page, '.table-picker > .caution'),
      zero: await texts(page, '.table-zero p'),
    };
  }
  if (item.kind === 'qr') {
    await page.locator('.table-qr svg').waitFor();
    return { link: await copied(page, 'Copy table link'), picker: local(await page.getByRole('link', { name: 'Open name picker', exact: true }).evaluate(a => a.href)) };
  }
  if (item.kind === 'mine') {
    await page.locator('.mine-person').first().waitFor();
    const rows = await page.locator('.mine-person').evaluateAll(lis => lis.map(li => ({
      name: li.querySelector('.mine-head strong').textContent,
      ticked: li.querySelector('input').checked,
      amount: li.querySelector('.mine-head .amount').textContent,
      zec: li.querySelector('.mine-zec').textContent,
      memo: li.querySelector('.mine-memo').textContent,
    })));
    // Each row's own button, by position: two rows may carry the same name.
    const links = [];
    for (let i = 0; i < rows.length; i++) {
      await page.locator('.mine-person').nth(i).locator('.actions button').first().click();
      links.push(local(await page.evaluate(() => window.__copied.at(-1))));
    }
    const summary = await page.locator('#settled-summary').inputValue();
    const page_ = await copied(page, 'Copy this page’s link');
    // Ticking the first open box writes the same address as before.
    const open = page.locator('.mine-person input:not(:checked)');
    let after = null;
    if (await open.count()) { await open.first().check(); after = local(page.url()); }
    return { rows, links, summary, page: page_, count: (await texts(page, '.mine-count'))[0], afterTick: after };
  }
  if (item.kind === 'demo') {
    await page.getByRole('button', { name: 'Load sample dinner', exact: true }).click();
    await page.getByText('Sample ready. Testnet only.').waitFor();
    return {
      requests: await page.locator('a[href^="zcash:"]').evaluateAll(as => as.map(a => a.href)),
      memos: await texts(page, '.demo-memo'),
      ticks: await page.locator('.demo-tick input').evaluateAll(xs => xs.map(x => x.checked)),
      url: local(page.url()),
    };
  }
  throw new Error(item.kind);
}

const list = await cases();
for (const engine of write ? ['chromium'] : (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    await context.addInitScript(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied.push(t); } } });
    });
    await context.route('**/demo-receiver.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoConfig) }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const item of list) {
      const seen = await capture(page, item);
      if (write) item.expect = seen;
      else assert.deepEqual(seen, item.expect, `${engine}: ${item.name} opens as before`);
    }
    assert.deepEqual(errors, []);
    if (!write) console.log(`${engine}: ${list.length} old links (s1, s2, s3, g1, g2, picker, table code, people, organiser and ticks, demo) open with the same requests, copied text and tick addresses PASS`);
  } finally { await browser.close(); }
}
if (write) {
  writeFileSync(fixtureFile, JSON.stringify({ madeFrom: '1c820e9', note: 'What each link gave at 1c820e9. {origin} stands for the page origin.', cases: list }, null, 1) + '\n');
  console.log(`wrote ${list.length} cases`);
}
