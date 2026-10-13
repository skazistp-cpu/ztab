// Checking payments with a viewing key: nothing is loaded or asked until the button is pressed; the key is in no
// request, link or storage; a found payment only proposes a tick. The Zcash server is a stand-in built from a
// test vector (a made-up key that holds nothing), so this test needs no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8776';
const vector = JSON.parse(readFileSync(new URL('../fixtures/finder-vector.json', import.meta.url), 'utf8'));
const payee = 'utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm';
const SERVER = 'https://zcash-testnet.chainsafe.dev';
const unhex = s => Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16));
const varint = value => { const out = []; let n = BigInt(value); while (n >= 0x80n) { out.push(Number(n & 0x7fn) | 0x80); n >>= 7n; } out.push(Number(n)); return out; };
const num = (field, value) => [...varint(field << 3), ...varint(value)];
const bytes = (field, value) => [...varint((field << 3) | 2), ...varint(value.length), ...value];
const action = hexed => { const a = unhex(hexed); return [...bytes(1, a.subarray(0, 32)), ...bytes(2, a.subarray(32, 64)), ...bytes(3, a.subarray(64, 96)), ...bytes(4, a.subarray(96))]; };
const frame = (message, flag = 0) => [flag, (message.length >>> 24) & 255, (message.length >>> 16) & 255, (message.length >>> 8) & 255, message.length & 255, ...message];
const trailer = code => frame([...new TextEncoder().encode(`grpc-status: ${code}\r\n`)], 0x80);
const TIP = 4000, created = Date.parse('2026-10-11T19:00:00Z') / 1000;
const block = height => [...num(2, height), ...num(5, created + (height - 3990) * 75), ...bytes(7, [...bytes(2, new Uint8Array(32).fill(1)), ...bytes(9, action(vector.ironwood.decoy))]),
  ...(height === 3995 ? bytes(7, [...num(1, 1), ...bytes(2, new Uint8Array(32).fill(9)), ...bytes(9, action(vector.ironwood.action))]) : [])];
const table = zatoshis => `${origin}/#g2.${Buffer.from(JSON.stringify([['test', payee, 'Dinner, Friday', 'Lena', 'USD', '1235.605', 'Manual entry', '2026-10-11T18:59:00.000Z', '2026-10-11T19:00:00.000Z'], [['Ana', '45.46', zatoshis], ['Ben', '22.91', '1854153'], ['Ana', '45.46', zatoshis]], []])).toString('base64url')}/mine`;

const single = (zatoshis, label = 'Dinner, Friday') => `${origin}/#g2.${Buffer.from(JSON.stringify([['test', payee, label, 'Lena', 'USD', '1235.605', 'Manual entry', '2026-10-11T18:59:00.000Z', '2026-10-11T19:00:00.000Z'], [['Ana', '45.46', zatoshis], ['Ben', '22.91', '1854153']], []])).toString('base64url')}/mine`;

for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce', locale: 'en-US' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const requests = []; let fail = '', held = null;
    // `hold(method)` keeps the stand-in server's answer to that call back until `release()`.
    const hold = method => { let open; const gate = new Promise(r => { open = r; }); held = { method, gate, asked: new Promise(r => { held_asked = r; }) }; return () => { held = null; open(); }; };
    let held_asked = () => {};
    page.on('request', r => { if (!r.url().startsWith(origin + '/#') && r.url() !== origin + '/') requests.push(`${r.method()} ${r.url().replace(/-[\w-]{8}\./, '.')}`); });
    await context.route(`${SERVER}/**`, async route => {
      const method = route.request().url().split('/').pop(), body = route.request().postDataBuffer();
      assert.equal(body.includes(Buffer.from(vector.key.slice(0, 16))), false, 'the key is in no request');
      assert.equal(route.request().headers().referer, undefined, 'no referrer is sent to the Zcash server');
      if (held?.method === method) { const mine = held; held_asked(); await mine.gate; }
      let out = [];
      if (method === 'GetLightdInfo') out = frame(num(7, TIP));
      else if (method === 'GetBlockRange') for (let h = TIP - 499; h <= TIP; h++) out.push(...frame(block(h)));
      else if (method === 'GetTransaction') out = frame(bytes(1, unhex(vector.ironwood.transaction)));
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/grpc-web+proto' }, body: Buffer.from(method === fail ? trailer(5) : [...out, ...trailer(0)]) }).catch(() => {}); // the page may have given the request up
    });
    await page.goto(table(vector.zatoshis));
    await page.locator('.mine-person').first().waitFor();
    await page.evaluate(() => { window.__storageCalls = 0; for (const m of ['getItem', 'setItem', 'removeItem', 'clear']) { const old = Storage.prototype[m]; Storage.prototype[m] = function (...a) { window.__storageCalls++; return old.apply(this, a); }; } });
    const section = page.locator('details.pay-find'), input = page.getByLabel('Viewing key', { exact: true }), look = page.getByRole('button', { name: 'Look for payments', exact: true }), status = section.locator('[role=status]'), forget = page.getByRole('button', { name: 'Forget the key', exact: true });
    assert.equal(await page.locator('.table-mine .caution').first().innerText(), 'Your own record. Ztab cannot see payments on its own.');
    assert.equal(await section.locator('summary').innerText(), 'Check payments with a viewing key · testnet only for now');
    assert.equal(await section.evaluate(d => d.open), false, 'closed until the organiser opens it');
    requests.length = 0;
    await section.locator('summary').click();
    const text = await section.innerText();
    for (const part of ['What you paste.', 'It cannot spend.', 'Where it goes. Nowhere.', 'forgotten when you leave or close this page', 'Who else is involved.', 'run by ChainSafe (zcash-testnet.chainsafe.dev)', 'It cannot see your key, the amounts or the notes.', 'What a viewing key shows. Every payment into that wallet, not only this tab’s.']) assert.ok(text.includes(part), part);
    assert.equal(await section.locator('#finder-scope').innerText(), 'This check reads unified viewing keys and looks back about two days. It does not read Sapling payments. It relies on the server for what is on the chain, and it does not check that the key belongs to this tab’s address.');
    assert.equal(await forget.isVisible(), false, 'no key is held yet');
    assert.deepEqual(requests, [], 'opening the section loads nothing');
    const before = page.url();
    // Secrets and wrong texts are refused, cleared, and nothing is loaded or asked.
    for (const [bad, says] of [['abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', /^This looks like a spending key or a recovery phrase\. Never paste one into a web page\. Ztab did not use it, and the box has been cleared\. Use a viewing key\.$/], ['secret-extended-key-test1qqqq', /spending key or a recovery phrase/], ['', /Paste a viewing key/], ['uview1' + 'q'.repeat(90), /^This is a mainnet viewing key\. This check works on testnet only for now\.$/], [vector.memo, /not a unified viewing key/]]) {
      await input.fill(bad); await look.click();
      assert.match(await status.innerText(), says);
      assert.equal(await input.inputValue(), '');
    }
    assert.deepEqual(requests, [], 'a refused text loads nothing and asks nothing');
    // A key that cannot be read: the module is loaded from our own host to read it, and no server is asked.
    await input.fill('uviewtest1' + 'q'.repeat(90)); await look.click();
    await status.filter({ hasText: 'could not be read' }).waitFor();
    assert.equal(await section.locator('.note-match-choice').count(), 0);
    assert.deepEqual(requests.map(r => r.replace(/^GET .*\/assets\//, 'own ')).sort(), ['own wire.js', 'own ztab_scan.wasm'], 'only our own two files');
    // The real case: one payment whose note and amount are in two people's requests (same name, same share).
    requests.length = 0;
    await input.fill(`  ${vector.key}\n`); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.equal(await input.inputValue(), '', 'the key is cleared from the box');
    assert.match(await status.innerText(), /^Looked from \d+ Oct 2026, \d\d:\d\d UTC to now\. Check each payment below, then tick it yourself\.$/);
    assert.equal(await forget.isVisible(), true, 'the key is held in the page, with a way to forget it');
    assert.deepEqual(requests, ['GetLightdInfo', 'GetBlockRange', 'GetTransaction'].map(m => `POST ${SERVER}/cash.z.wallet.sdk.rpc.CompactTxStreamer/${m}`), 'tip, one range, the one transaction; module already loaded');
    const choices = section.locator('.note-match-choice');
    assert.deepEqual(await choices.locator('button').allInnerTexts(), ['Tick Ana (person 1)', 'Tick Ana (person 3)']);
    assert.match(await choices.first().innerText(), /^A payment of 0\.03679169 ZEC arrived with a note that is in 2 requests\. Ztab cannot tell which\./);
    assert.ok((await section.innerText()).includes('A found payment arrived at your key with this amount and note. It does not show who sent it.'));
    assert.match(await choices.first().innerText(), /Transaction 09090909…09090909/);
    assert.equal(page.url(), before, 'finding alone does not alter the link');
    assert.deepEqual(await page.locator('.mine-person input').evaluateAll(xs => xs.map(x => x.checked)), [false, false, false]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.OUT) { const fs = await import('node:fs/promises'); await fs.mkdir(process.env.OUT, { recursive: true });
      for (const width of [320, 390, 1280]) for (const colorScheme of ['light', 'dark']) { await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ colorScheme }); await section.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: `${process.env.OUT}/${engine}-${width}-${colorScheme}.png` }); }
      await page.setViewportSize({ width: 320, height: 760 }); await page.emulateMedia({ colorScheme: 'light' }); }
    await choices.locator('button').nth(1).click();
    assert.match(page.url(), /\/mine\/001$/);
    assert.equal(await page.locator('.mine-count').innerText(), '1 of 3 ticked');
    assert.equal(await status.innerText(), 'Ana (person 3) is ticked. This is your mark.');
    assert.equal(await section.locator('.note-match-choice').count(), 0);
    assert.equal(await input.evaluate(e => document.activeElement === e), true, 'focus returns to the labelled box');
    // Looking again uses the held key, without pasting: the ticked person gets no second button; a manual tick clears stale proposals.
    await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.deepEqual(await choices.locator('button').allInnerTexts(), ['Tick Ana (person 1)']);
    assert.match(await choices.first().innerText(), /Ana \(person 3\) is already ticked\./);
    await page.locator('.mine-person input').nth(1).click();
    assert.equal(await section.locator('.note-match-choice').count(), 0, 'a manual tick removes stale proposals');
    // Another key finds nothing and opens no transaction.
    requests.length = 0;
    await input.fill(vector.otherKey); await look.click();
    await status.filter({ hasText: /^No payment to this key was found since \d+ Oct 2026, \d\d:\d\d UTC\. That does not prove none was made; your wallet is the record\.$/ }).waitFor();
    assert.equal(requests.filter(r => r.endsWith('GetTransaction')).length, 0);
    // A server that fails is an error, never "nothing found".
    for (const method of ['GetLightdInfo', 'GetBlockRange', 'GetTransaction']) {
      fail = method; await input.fill(vector.key); await look.click();
      await status.filter({ hasText: /^Could not reach the server\. Nothing was checked\.$/ }).waitFor();
      assert.equal(await section.locator('.note-match-choice').count(), 0);
      assert.equal(await look.isDisabled(), false, 'the button works again');
    }
    fail = '';
    // The right note with another amount is shown and never offered for a tick.
    await page.goto(table('3679170')); await page.reload();
    await page.locator('.mine-person').first().waitFor();
    await section.locator('summary').click(); await input.fill(vector.key); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.deepEqual(await section.locator('.note-match-choice button').allInnerTexts(), ['Tick Ana (person 1) anyway', 'Tick Ana (person 3) anyway']);
    assert.deepEqual(await page.locator('.mine-person input').evaluateAll(xs => xs.map(x => x.checked)), [false, false, false]);
    // A look in flight is ended for good by Forget, by Stop and by leaving the page: its late answer changes nothing.
    const stopBtn = page.getByRole('button', { name: 'Stop looking', exact: true });
    const quiet = async (says) => {
      // Give a late answer every chance to arrive, then check that nothing came back.
      await page.waitForTimeout(400);
      assert.equal(await status.innerText(), says);
      assert.equal(await section.locator('.note-match-choice').count(), 0, 'no late results');
      assert.equal(await look.isDisabled(), false);
      assert.equal(await stopBtn.isVisible(), false);
    };
    for (const method of ['GetLightdInfo', 'GetBlockRange', 'GetTransaction']) {
      // Forget while a look with a held key waits for the server (the reviewer's case).
      assert.equal(await forget.isVisible(), true, 'a key is held from the look before');
      let release = hold(method); const asked = held.asked;
      await look.click(); await asked;
      assert.equal(await stopBtn.isVisible(), true, 'a look in flight can be stopped');
      await forget.click();
      assert.equal(await status.innerText(), 'The key is forgotten.');
      release();
      await quiet('The key is forgotten.');
      assert.equal(await forget.isVisible(), false, `the key stays forgotten after a late ${method} answer`);
      assert.equal(await section.locator('#finder-held').innerText(), '');
      await look.click();
      assert.match(await status.innerText(), /Paste a viewing key first/, 'looking again needs the key again');
      // Forget during a first look, before any key was ever held.
      release = hold(method); const first = held.asked;
      await input.fill(vector.key); await look.click(); await first;
      assert.equal(await forget.isVisible(), false, 'nothing is held before a look has succeeded');
      await stopBtn.click();
      assert.equal(await status.innerText(), 'Stopped. Nothing was checked.');
      release();
      await quiet('Stopped. Nothing was checked.');
      assert.equal(await forget.isVisible(), false, 'a stopped first look holds no key');
      await look.click();
      assert.match(await status.innerText(), /Paste a viewing key first/);
      // A complete look afterwards works, and holds the key again for the next round.
      await input.fill(vector.key); await look.click();
      await section.locator('.note-match-choice').first().waitFor();
      assert.equal(await forget.isVisible(), true);
    }
    // Stop with a held key keeps the key, shows nothing, and a new look works.
    let release = hold('GetBlockRange'); let asked = held.asked;
    await look.click(); await asked; await stopBtn.click(); release();
    await quiet('Stopped. Nothing was checked.');
    assert.equal(await forget.isVisible(), true, 'Stop does not forget a key that was already held');
    // A server that never answers: the organiser is not stuck, Stop ends it.
    hold('GetLightdInfo'); asked = held.asked;
    await look.click(); await asked;
    assert.equal(await look.isDisabled(), true);
    await stopBtn.click();
    await quiet('Stopped. Nothing was checked.');
    held = null;
    // Leaving the screen. This app changes screens on hashchange, where no pagehide fires: the router must end the
    // look itself. After leaving there is no further call to the server, whichever answer the look was waiting for.
    const serverCalls = () => requests.filter(r => r.startsWith(`POST ${SERVER}`)).map(r => r.split('/').pop());
    const mine = page.url();
    const comeBack = async () => { await page.goto(mine); await page.reload(); await page.locator('.mine-person').first().waitFor(); await section.locator('summary').click(); };
    for (const [method, sent] of [['GetLightdInfo', ['GetLightdInfo']], ['GetBlockRange', ['GetLightdInfo', 'GetBlockRange']], ['GetTransaction', ['GetLightdInfo', 'GetBlockRange', 'GetTransaction']]]) {
      for (const leave of ['Start a new bill', 'back']) {
        await comeBack();
        requests.length = 0;
        const release = hold(method), asked = held.asked;
        await input.fill(vector.key); await look.click(); await asked;
        await page.evaluate(() => { window.__left = document.querySelector('.pay-find'); });
        if (leave === 'back') await page.evaluate(() => { location.hash = ''; }); else await page.locator('a', { hasText: leave }).click();
        await page.locator('#app .create').waitFor();
        release();
        await page.waitForTimeout(500);
        assert.deepEqual(serverCalls(), sent, `left while waiting for ${method} (${leave}): no further call to the server`);
        assert.equal(await page.locator('.pay-find').count(), 0);
        // The screen that was left holds nothing: no key line, no results, an empty box, the buttons at rest.
        assert.deepEqual(await page.evaluate(() => { const old = window.__left; return [old.isConnected, old.querySelector('#finder-held').textContent, old.querySelector('.pay-find-result').childElementCount, old.querySelector('#viewing-key').value, old.querySelector('[role=status]').textContent, [...old.querySelectorAll('button')].map(b => `${b.textContent}:${b.hidden ? 'hidden' : b.disabled ? 'disabled' : 'ready'}`).join(' ')]; }),
          [false, '', 0, '', '', 'Look for payments:ready Stop looking:hidden Forget the key:hidden']);
      }
    }
    // Leaving after a look that succeeded and holds a key: the screen that was left lets go of it.
    await comeBack();
    await input.fill(vector.key); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.equal(await forget.isVisible(), true);
    await page.evaluate(() => { window.__left = document.querySelector('.pay-find'); });
    requests.length = 0;
    await page.locator('a', { hasText: 'Start a new bill' }).click();
    await page.locator('#app .create').waitFor();
    assert.deepEqual(await page.evaluate(() => { const old = window.__left; return [old.querySelector('#finder-held').textContent, old.querySelector('.pay-find-result').childElementCount, old.querySelector('#viewing-key').value, [...old.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.textContent)]; }), ['', 0, '', ['Look for payments']]);
    // Pressing the left screen's own button afterwards finds no key: it was dropped, not only hidden.
    // (A form that is no longer in the page does not submit on a click, so the event is sent to it directly.)
    await page.evaluate(() => { window.__left.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__left.querySelector('[role=status]').textContent), 'Paste a viewing key first.');
    assert.deepEqual(serverCalls(), [], 'the left screen asks the server nothing');
    // Back and forth again and again: every return starts empty, and nothing is asked until the button is pressed.
    for (let round = 0; round < 3; round++) {
      await page.goBack();
      await page.locator('.mine-person').first().waitFor();
      await section.locator('summary').click();
      assert.equal(await forget.isVisible(), false, 'coming back, no key is held');
      await look.click();
      assert.match(await status.innerText(), /Paste a viewing key first/);
      await page.goForward();
      await page.locator('#app .create').waitFor();
    }
    assert.deepEqual(serverCalls(), []);
    assert.deepEqual(errors, []);
    // A page kept for the back button (pagehide, then pageshow with persisted): the screen was told to let go when
    // the page was hidden, so on return it is built again, empty, and registered to be left the next time.
    const lifecycle = (type) => page.evaluate(t => { window.dispatchEvent(new PageTransitionEvent(t, { persisted: true })); }, type);
    for (const method of ['GetLightdInfo', 'GetBlockRange', 'GetTransaction']) {
      await comeBack();
      await input.fill(vector.key); await look.click();
      await section.locator('.note-match-choice').first().waitFor();
      await page.evaluate(() => { window.__left = document.querySelector('.pay-find'); });
      await lifecycle('pagehide');
      assert.deepEqual(await page.evaluate(() => [window.__left.querySelector('#finder-held').textContent, window.__left.querySelector('.pay-find-result').childElementCount]), ['', 0], 'hiding the page drops the key and the results');
      await lifecycle('pageshow');
      await page.locator('.mine-person').first().waitFor();
      assert.equal(await page.evaluate(() => window.__left.isConnected), false, 'the restored page shows a screen built again');
      assert.equal(await section.evaluate(d => d.open), false);
      await section.locator('summary').click();
      assert.equal(await forget.isVisible(), false, 'the key stays forgotten after the page is restored');
      // The rebuilt screen is left like any other: a look in flight ends, and nothing more is asked of the server.
      requests.length = 0;
      const release = hold(method), asked = held.asked;
      await input.fill(vector.key); await look.click(); await asked;
      const before = serverCalls().length;
      await page.locator('a', { hasText: 'Start a new bill' }).click();
      await page.locator('#app .create').waitFor();
      release();
      await page.waitForTimeout(500);
      assert.equal(serverCalls().length, before, `restored page, left while waiting for ${method}: no further call to the server`);
    }
    // Restored twice in a row, and restored on the bill form: nothing breaks and nothing is asked.
    requests.length = 0;
    await lifecycle('pagehide'); await lifecycle('pageshow'); await lifecycle('pagehide'); await lifecycle('pageshow');
    await page.locator('#app .create').waitFor();
    assert.deepEqual(serverCalls(), []);
    assert.deepEqual(errors, []);
    // A tick is not leaving: it rewrites the address without changing the screen, and the held key stays for the next look.
    await comeBack();
    await input.fill(vector.key); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    await page.locator('.mine-person input').nth(1).click();
    assert.match(page.url(), /\/mine\/010$/);
    assert.equal(await forget.isVisible(), true, 'a tick keeps the held key');
    await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    await page.locator('.mine-person input').nth(1).click();
    // Forgetting: the held key is dropped, and looking again asks for one.
    await forget.click();
    assert.equal(await status.innerText(), 'The key is forgotten.');
    assert.equal(await forget.isVisible(), false);
    await look.click();
    assert.match(await status.innerText(), /Paste a viewing key first/);
    // One person, the right note, another amount: said plainly, and the tick is "anyway".
    await page.goto(single('3679170')); await page.reload();
    await page.locator('.mine-person').first().waitFor();
    await section.locator('summary').click(); await input.fill(vector.key); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.equal(await section.locator('.note-match-choice').first().locator('p').first().innerText(), 'A payment arrived with the note in Ana’s request, but the amount differs: 0.03679169 ZEC arrived, their share is 0.0367917 ZEC.');
    assert.deepEqual(await section.locator('.note-match-choice button').allInnerTexts(), ['Tick Ana anyway']);
    // One person, note and amount equal.
    await page.goto(single(vector.zatoshis)); await page.reload();
    await page.locator('.mine-person').first().waitFor();
    await section.locator('summary').click(); await input.fill(vector.key); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.equal(await section.locator('.note-match-choice').first().locator('p').first().innerText(), 'A payment of 0.03679169 ZEC arrived with the note in Ana’s request. The amount matches their share.');
    assert.deepEqual(await section.locator('.note-match-choice button').allInnerTexts(), ['Tick Ana']);
    // A payment to the key whose note is not in this tab is listed apart, with no button.
    await page.goto(single(vector.zatoshis, 'Lunch')); await page.reload();
    await page.locator('.mine-person').first().waitFor();
    await section.locator('summary').click(); await input.fill(vector.key); await look.click();
    await section.locator('.note-match-choice').first().waitFor();
    assert.match(await status.innerText(), /^No payment to this key with a note from this tab was found since /);
    assert.equal(await section.locator('.note-match-choice').innerText(), `Other payments to this key\n\n0.03679169 ZEC · “${vector.memo}”`);
    assert.equal(await section.locator('.note-match-choice button').count(), 0);
    // Nothing of the key is left behind.
    assert.equal(await page.evaluate(() => window.__storageCalls ?? 0), 0);
    assert.deepEqual(await page.evaluate(async () => [localStorage.length, sessionStorage.length, document.cookie.length]), [0, 0, 0]);
    assert.equal((await page.content()).includes(vector.key.slice(0, 24)), false, 'the key is nowhere in the page');
    assert.equal(page.url().includes(vector.key.slice(0, 16)), false);
    assert.deepEqual(errors, []);
    console.log(`${engine}: nothing loaded before the press, secrets refused, key in no request, link or storage, held key, forget, stop, leaving the screen and a restored page against late answers, proposals by position, amount mismatch, other payments, server failure, 320px PASS`);
  } finally { await browser.close(); }
}
