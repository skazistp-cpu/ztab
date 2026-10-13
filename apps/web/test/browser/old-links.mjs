// Links made before the new first screen open exactly as they did: the same screen, byte for byte, and the same files.
// Compares this build with a reference build of the commit it started from, served side by side:
// PLAYWRIGHT_MODULE=… TAB_ORIGIN=http://127.0.0.1:8764 REFERENCE_ORIGIN=http://127.0.0.1:8765 node test/browser/old-links.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeShare } from '../../../../packages/engine/src/index.ts';
import { encodeTable, mineFragment } from '../../src/table-link.ts';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const reference = process.env.REFERENCE_ORIGIN;
if (!reference) throw new Error('Set REFERENCE_ORIGIN to a build of the commit before the change.');

// The share from the existing link tests, and the testnet table from the payment-finder test.
const share = { network: 'test', payee: 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez', label: 'Dinner', name: 'Ana', from: 'Miro', fiatShare: '10.00', zatoshis: '1000000', rate: { fiat: 'USD', fiatPerZec: '1000', source: 'Manual', observedAt: '2026-10-10T00:00:00Z' }, createdAt: '2026-10-10T00:00:00Z' };
const fragment = value => { const e = encodeShare(value); if (e.kind !== 'fragment') throw new Error('fixture'); return e.fragment; };
const s1 = fragment({ ...share, createdAt: undefined });
const s2 = fragment(share);
const s3 = fragment({ ...share, memoBrand: 'Ztab' });
const s3ben = fragment({ ...share, name: 'Ben', fiatShare: '12.50', zatoshis: '1250000', memoBrand: 'Ztab' });
const transparent = fragment({ ...share, network: 'main', payee: 't1gjjQFKaVgq8FwhxuWnx867bhiLDeKAPkQ', memoBrand: 'Ztab' });
const table = (fragments, zero) => { const e = encodeTable(fragments, zero); if (e.kind !== 'fragment') throw new Error('table fixture'); return e.fragment; };
const g1 = table([s2], []);
const g2 = table([s3, s3ben], ['Nobody']);
const vector = JSON.parse(readFileSync(new URL('../fixtures/finder-vector.json', import.meta.url), 'utf8'));
const finderPayee = 'utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm';
const finderTable = 'g2.' + Buffer.from(JSON.stringify([['test', finderPayee, 'Dinner, Friday', 'Lena', 'USD', '1235.605', 'Manual entry', '2026-10-11T18:59:00.000Z', '2026-10-11T19:00:00.000Z'], [['Ana', '45.46', vector.zatoshis], ['Ben', '22.91', '1854153']], []])).toString('base64url');
assert.match(s1, /^s1\./); assert.match(s2, /^s2\./); assert.match(s3, /^s3\./); assert.match(g1, /^g1\./); assert.match(g2, /^g2\./);

const links = {
  's1 pay link': `/#${s1}`,
  's2 pay link': `/#${s2}`,
  's3 pay link': `/#${s3}`,
  's3 transparent mainnet': `/#${transparent}`,
  'g1 name picker': `/#${g1}`,
  'g1 table QR': `/#${g1}/qr`,
  'g2 name picker': `/#${g2}`,
  'g2 table QR': `/#${g2}/qr`,
  'g2 second share': `/#${g2}/1`,
  'g2 organiser page': `/#${mineFragment(g2, [false, false])}`,
  'g2 organiser page, ticked': `/#${mineFragment(g2, [false, true])}`,
  'g2 finder table, organiser': `/#${finderTable}/mine`,
  'demo session': '/?demo#demo/1791748800000/1234567890abcdef/10',
  'broken link': '/#s3.broken',
  'tampered table': `/#${g2.slice(0, -6)}`,
};
// Both builds are opened at one made-up origin, each served from its own server, so links and codes that
// carry the page's own address are compared as they are. Hashed file names differ between builds; the kind of
// file and nothing else must not.
const SITE = 'http://ztab.test';
const WHICH_COPY = '<p class="note copy-which">Copy payment request keeps the note. Copy address and amount leaves it out.</p>';
const file = url => { const u = new URL(url); return u.pathname.replace(/-[\w-]{8}(\.\w+)$/, '$1') + u.search; };
async function served(browser, backing) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== SITE) return route.abort();
    const response = await route.fetch({ url: backing + url.pathname + url.search });
    await route.fulfill({ response });
  });
  return context;
}
async function visit(context, path) {
  const page = await context.newPage();
  const files = []; const errors = [];
  page.on('request', r => files.push(r.url().startsWith(SITE) ? file(r.url()) : `OTHER ${r.url()}`));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(SITE + path);
  await page.waitForFunction(() => document.querySelector('#app')?.firstElementChild && !document.querySelector('#app > [role=status]:only-child'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const seen = await page.evaluate(() => ({ app: document.querySelector('#app').innerHTML, title: document.title, at: location.pathname + location.search + location.hash, storage: localStorage.length + sessionStorage.length, width: document.documentElement.scrollWidth <= innerWidth }));
  await page.close();
  return { ...seen, files: [...new Set(files)].sort(), errors };
}
for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const [was, now] = [await served(browser, reference), await served(browser, origin)];
    for (const [name, path] of Object.entries(links)) {
      const [before, after] = [await visit(was, path), await visit(now, path)];
      assert.ok(before.app.length > 120, `${name}: the reference shows a screen`);
      // The one reviewed change to these screens: on a pay page whose request carries a note, a line under the two
      // copy buttons says which one keeps the note. Everything else is byte for byte.
      const shown = after.app.includes(WHICH_COPY);
      assert.equal(shown, before.app.includes('class="memo"'), `${engine} ${name}: the copy line shows exactly where a note is`);
      // A reference from before the flow fixes lacks that line; one from after them has it too.
      const expected = before.app.includes(WHICH_COPY) ? after.app : after.app.split(WHICH_COPY).join('');
      assert.equal(expected, before.app, `${engine} ${name}: the same screen, byte for byte`);
      assert.equal(after.title, before.title, `${engine} ${name}: title`);
      assert.equal(after.at, before.at, `${engine} ${name}: the address stays the same`);
      assert.deepEqual(after.files, before.files, `${engine} ${name}: the same files and nothing else`);
      assert.ok(!after.files.some(f => f.startsWith('OTHER')), `${engine} ${name}: nothing from another site`);
      assert.equal(after.storage, 0); assert.ok(after.width, `${engine} ${name}: no overflow`);
      assert.deepEqual(after.errors, before.errors);
    }
    await was.close(); await now.close();
    console.log(`${engine}: ${Object.keys(links).length} old links (s1, s2, s3, g1, g2, QR, picker, organiser, ticks, demo, broken, tampered) open byte for byte as before, same files PASS`);
  } finally {
    await browser.close();
  }
}
