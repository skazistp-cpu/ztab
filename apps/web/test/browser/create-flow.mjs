// Making a tab one step at a time: every way from the opening to the links, by mouse and by keyboard, with Back,
// errors on their own step, sizes from 320 to 1440 px in both schemes, reduced motion, and a quiet visit.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs TAB_ORIGIN=http://127.0.0.1:8764 node test/browser/create-flow.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fillIn, makeLinks, openStep } from './lib/flow.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const title = page => page.locator('.flow-panel:not([hidden]) .step-title').innerText();
const focused = page => page.evaluate(() => document.activeElement?.className + ' ' + (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''));
const next = page => page.getByRole('button', { name: 'Next', exact: true });

for (const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    const outside = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin)) return route.continue();
      outside.push(url);
      return url.startsWith('https://api.coinbase.com/') ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { base: 'ZEC', currency: 'USD', amount: '1327.32' } }) }) : route.abort();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));

    // 1. Equal shares, by mouse: Start a tab, one question a step, Next, the links.
    await page.goto(origin);
    await page.getByRole('button', { name: 'Start a tab', exact: true }).click();
    assert.equal(await title(page), 'What’s the bill?');
    assert.match(await focused(page), /step-title/, 'the question of the step has the focus');
    assert.deepEqual(await page.locator('.flow-steps button').evaluateAll(bs => bs.map(b => [b.textContent, b.getAttribute('aria-current')])), [['1Bill', 'step'], ['2People', null], ['3Rate', null], ['4Get paid', null]]);
    assert.equal(await page.getByRole('group', { name: 'What’s the bill?' }).count(), 1, 'each step is a group named by its question');
    // A required box left empty is said beside it, on this step, and the step does not move on.
    await next(page).click();
    assert.equal(await title(page), 'What’s the bill?');
    assert.equal(await page.locator('[role="alert"]').innerText(), 'Write the total as a number with at most two decimals, such as 98.00.');
    const total = page.getByLabel('Total', { exact: true });
    assert.equal(await total.getAttribute('aria-invalid'), 'true');
    assert.match(await total.getAttribute('aria-describedby'), /form-error/);
    assert.equal(await total.evaluate(e => e === document.activeElement), true);
    await total.fill('98');
    assert.equal(await page.locator('[role="alert"]').innerText(), '', 'typing clears the error');
    assert.equal(await page.locator('.optional').count(), 1, 'the box that can be left empty says so');
    assert.match(await page.locator('#' + await page.getByLabel('What was it for?', { exact: true }).getAttribute('aria-describedby')).innerText(), /Left empty, their payment note says “Bill”\./);
    assert.deepEqual(await page.getByRole('heading', { level: 1 }).allInnerTexts(), ['What’s the bill?'], 'the step’s question is the page’s one h1');
    await page.getByLabel('What was it for?', { exact: true }).fill('Dinner, Friday');
    await next(page).click();
    assert.equal(await title(page), 'Who’s splitting it?');
    // Your own name is typed in your own row, here, like everyone else's.
    const yours = page.locator('.person-row.you').getByLabel('Your name', { exact: true });
    assert.equal(await yours.count(), 1, 'your name box is in your row');
    assert.equal(await page.locator('#tab-from-hint').innerText(), 'Your name is optional. Your friends see who they are paying.');
    await yours.fill('Lena');
    await page.getByLabel('People besides you', { exact: true }).fill('3');
    for (const [i, name] of ['Ana', 'Ben', 'Carla'].entries()) await page.getByLabel(`Name of person ${i + 1}`, { exact: true }).fill(name);
    // The engine's own shares are shown while the tab is made.
    await page.locator('[data-step="people"] .split-preview li').filter({ hasText: 'Carla' }).waitFor();
    assert.deepEqual(await page.locator('[data-step="people"] .split-preview li').allInnerTexts(), ['You\n$24.50', 'Ana\n$24.50', 'Ben\n$24.50', 'Carla\n$24.50']);
    assert.equal(await page.locator('.split-preview[aria-live]').count(), 0, 'the lists are not read out on every key');
    await page.getByRole('status').filter({ hasText: /^Each share: / }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: /^Each share: / }).innerText(), 'Each share: You $24.50, Ana $24.50, Ben $24.50, Carla $24.50.', 'one short summary once typing pauses');
    assert.deepEqual(await page.locator('.flow *').evaluateAll(els => els.filter(e => !['none', 'normal'].includes(getComputedStyle(e, '::after').content) && !getComputedStyle(e, '::after').content.startsWith('""')).map(e => e.className)), [], 'no generated text for a screen reader to read out');
    await next(page).click();
    assert.equal(await title(page), 'What is one ZEC worth?');
    // The rate is required: an empty one is said here; fetching it answers the error.
    await next(page).click();
    assert.equal(await page.locator('[role="alert"]').innerText(), 'Fetch the rate, or type one such as 1327.32.');
    assert.equal(outside.length, 0, 'nothing is asked of another site before Fetch is pressed');
    await page.getByRole('button', { name: 'Fetch the rate from Coinbase', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#tab-rate')?.value === '1327.32');
    assert.equal(await page.locator('[role="alert"]').innerText(), '', 'a fetched rate clears the rate error');
    assert.deepEqual(outside, ['https://api.coinbase.com/v2/prices/ZEC-USD/spot'], 'only the price, only on the press');
    await page.locator('[data-step="rate"] .split-preview li').filter({ hasText: 'Ana' }).waitFor();
    assert.match(await page.locator('[data-step="rate"] .split-preview').innerText(), /Ana\n\$24\.50\n0\.01845825 ZEC/);
    await next(page).click();
    assert.equal(await title(page), 'Where do you get paid?');
    // Back goes to the step before, and forward again keeps what was typed.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await title(page), 'What is one ZEC worth?');
    assert.equal(await page.getByLabel('Rate: one ZEC in USD', { exact: true }).inputValue(), '1327.32', 'the rate is named in its currency');
    await page.goBack();
    assert.equal(await title(page), 'Who’s splitting it?', 'the browser’s Back goes a step back too');
    await page.goForward(); await page.goForward();
    assert.equal(await title(page), 'Where do you get paid?');
    await page.getByLabel('Your Zcash address', { exact: true }).fill('not an address');
    await page.getByRole('button', { name: 'Make the links', exact: true }).click();
    assert.equal(await page.locator('[role="alert"]').innerText(), 'That does not look like a Zcash address. Check it and paste it again.');
    assert.match(await page.locator('#' + await page.getByLabel('Your Zcash address', { exact: true }).getAttribute('aria-describedby').then(ids => ids.split(' ').pop())).innerText(), /u1 \(utest1 on testnet\).*zs1 \(ztestsapling on testnet\)/);
    await page.getByLabel('Your Zcash address', { exact: true }).fill('t1gjjQFKaVgq8FwhxuWnx867bhiLDeKAPkQ');
    assert.equal(await page.locator('.address-kind').innerText(), 'Transparent address This address is public. Anyone who sees a payment to it can see the amount.', 'the transparent warning is on this step');
    await page.getByLabel('Your Zcash address', { exact: true }).fill(address);
    assert.equal((await page.locator('.address-kind').innerText()).replace(/\n+/g, '\n'), 'Testnet: not real ZEC\nShielded address', 'a testnet address is marked before the links are made');
    assert.equal(await page.locator('[data-step="payee"]').getByLabel('Your name').count(), 0, 'your name is asked once, on People');
    await page.getByRole('button', { name: 'Make the links', exact: true }).click();
    // The links: a moment that says so, the focus on it, and the links first.
    await page.locator('.links .ready h1').waitFor();
    assert.equal(await page.locator('.links .ready-eyebrow').innerText(), 'Links ready');
    assert.match(await page.locator('.links .ready-lead').innerText(), /^Each link opens a standard Zcash payment request \(ZIP 321\) with your address and their amount\. 3 people have a share to pay; yours is already covered\.$/);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Send each person their link');
    const order = await page.locator('.results section > *').evaluateAll(parts => parts.map(p => p.className || p.tagName));
    assert.ok(order.indexOf('cards') < order.findIndex(c => /more-title/.test(c)), 'own share and each person’s link come before the table QR');
    assert.equal(await page.locator('.results .person:not(.own)').count(), 3);
    const gold = await page.locator('.links button:visible, .links a.button:visible').evaluateAll(els => els.filter(e => getComputedStyle(e).backgroundColor === 'rgb(244, 183, 40)').map(e => e.textContent));
    assert.deepEqual(gold, ['Copy all'], 'one gold button on the links screen');
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0], 'nothing kept without Remember');
    const preview = await page.getByRole('link', { name: 'Preview', exact: true }).first().getAttribute('href');
    assert.match(preview, /#s3\./, 'links are the usual s3 pay links');
    assert.equal(await page.locator('.results .person:not(.own) .link-text').first().textContent(), preview, 'each card shows its own whole link');
    const shown = await page.locator('.results .person:not(.own) .link-text').first().evaluate(e => ({ fits: e.scrollWidth <= e.clientWidth + 1, end: e.lastElementChild.getBoundingClientRect().right <= e.getBoundingClientRect().right + 1 }));
    assert.deepEqual(shown, { fits: true, end: true }, 'the link fits its card, its end in view');
    assert.deepEqual(await page.getByRole('heading', { level: 1 }).allInnerTexts(), ['Send each person their link']);
    // A preview and back: the links are still there.
    await page.getByRole('link', { name: 'Preview', exact: true }).first().click();
    await page.getByRole('link', { name: 'Open in my wallet', exact: true }).waitFor();
    await page.goBack();
    await page.locator('.links .ready h1').waitFor();
    assert.equal(await page.locator('.results .person:not(.own)').count(), 3);

    // The bill changed after the links were made, and the browser's Back returns to them: the notice that says so is
    // on screen with its button focused, also when the long links page had been scrolled down.
    await page.getByRole('button', { name: 'Edit the bill', exact: true }).click();
    await page.getByLabel('Total', { exact: true }).fill('99');
    await page.goBack();
    await page.locator('.links .results-changed').waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Back to the bill');
    const notice = await page.evaluate(() => { const r = document.querySelector('.links .results-changed').getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; });
    assert.ok(notice, 'the bill-changed notice is on screen after Back');
    await page.getByRole('button', { name: 'Back to the bill', exact: true }).click();
    assert.equal(await title(page), 'Where do you get paid?', 'Back to the bill opens the steps where the links are made');
    await openStep(page, 'Bill');
    await page.getByLabel('Total', { exact: true }).fill('98');
    await makeLinks(page);
    await page.locator('.links .ready h1').waitFor();

    // 2. A fixed amount for one person: the rest is shared equally.
    await openStep(page, 'People');
    await page.getByLabel('Amount for person 1', { exact: true }).fill('20');
    await page.locator('[data-step="people"] .split-preview li').nth(1).filter({ hasText: '$20.00' }).waitFor();
    assert.deepEqual(await page.locator('[data-step="people"] .split-preview li').allInnerTexts(), ['You\n$26.00', 'Ana\n$20.00', 'Ben\n$26.00', 'Carla\n$26.00']);
    await makeLinks(page);
    assert.match(await page.locator('.results').innerText(), /Fixed amount/);

    // 3. Split by item, with a tip and a fixed sum as an item for one person.
    await openStep(page, 'Bill');
    await page.getByRole('radio', { name: 'Split by item', exact: true }).check();
    assert.equal(await total.isVisible(), false, 'item totals replace the total');
    assert.deepEqual(await page.locator('.flow-steps button .step-name').allTextContents(), ['Bill', 'People', 'Items', 'Rate', 'Get paid']);
    await next(page).click();
    assert.match(await page.locator('.people-hint').innerText(), /Someone paying an amount of their own\? On the next step, add it as an item for them alone\./);
    await next(page).click();
    assert.equal(await title(page), 'Who had what?');
    assert.equal(await page.locator('#split-items-note').innerText(), 'Each item to whoever had it, with a tip. Anyone can also have an amount of their own.', 'both ways of splitting allow an amount of one’s own');
    assert.equal(await page.locator('#split-total-note').innerText(), 'Equal shares, or a fixed amount for anyone');
    assert.match(await page.locator('[data-step="items"] .step-lead').innerText(), /Paying an amount of their own\? Add it as an item for them alone, with any name, such as “Dan’s share”\. It is added on top of the other items, and a tip applies to it too\./);
    // An item without its people is said on this step.
    await next(page).click();
    assert.match(await page.locator('[role="alert"]').innerText(), /price above zero|Choose who shared/);
    const item = async (i, name, price, who) => {
      if (i > 1) await page.getByRole('button', { name: 'Add an item', exact: true }).click();
      const line = page.locator('.bill-item').nth(i - 1);
      await line.getByLabel(`Item ${i} name`, { exact: true }).fill(name);
      await line.getByLabel(`Item ${i} price`, { exact: true }).fill(price);
      for (const person of who) await line.getByRole('checkbox', { name: person, exact: true }).check();
    };
    await item(1, 'Steak', '32', ['You']);
    await item(2, 'Salad', '11.50', ['Ana']);
    await item(3, 'Wine', '28', ['You', 'Ana', 'Ben']);
    await item(4, 'Taxi for Carla', '15', ['Carla']);
    // A new item comes into view with its name box ready, clear of the bar of Back and Next.
    await page.getByRole('button', { name: 'Add an item', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id?.startsWith('item-name-'));
    await page.waitForTimeout(450);
    const clear = await page.evaluate(() => {
      const item = document.activeElement.closest('.bill-item').getBoundingClientRect(), bar = document.querySelector('.flow-actions').getBoundingClientRect();
      return item.top >= 0 && item.bottom <= bar.top + 1;
    });
    assert.ok(clear, 'the new item is fully in view above the sticky bar');
    assert.equal(await page.locator('.item-totals').isVisible(), true, 'the running totals stay while the new item is empty');
    assert.doesNotMatch(await page.locator('.item-totals').innerText(), /price above zero/, 'no error before the new price box is left');
    await page.getByRole('button', { name: 'Remove item 5', exact: true }).click();
    await page.getByLabel(/^Tip or service/).fill('10');
    await next(page).click();
    assert.equal(await title(page), 'What is one ZEC worth?');
    await makeLinks(page);
    await page.locator('.links .ready h1').waitFor();
    assert.equal(await page.locator('.results .person:not(.own)').count(), 3);
    assert.match(await page.locator('.results').innerText(), /How each share adds up/);
    assert.ok((await page.locator('.results .person').allInnerTexts()).every(t => t.includes('Items + tip / service')), 'with a tip, every share says so');
    // Without a tip, a share is just its items (as a fixed sum added as an item reads).
    await openStep(page, 'Items');
    await page.getByLabel(/^Tip or service/).fill('0');
    await makeLinks(page);
    await page.locator('.links .ready h1').waitFor();
    assert.ok((await page.locator('.results .person').allInnerTexts()).every(t => /\nItems\n/.test(t) && !t.includes('tip / service')), 'without a tip, a share reads Items');
    // The rate is named in the currency of the bill, and follows a change of currency.
    await fillIn(page, 'Currency', 'EUR');
    await openStep(page, 'Rate');
    assert.equal(await page.getByLabel('Rate: one ZEC in EUR', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Rate: one ZEC in EUR', { exact: true }).inputValue(), '', 'a rate in USD does not price EUR shares');
    assert.equal(await page.locator('[data-step="rate"] .rate').innerText(), '', 'nor does its line stay');
    await fillIn(page, 'Currency', 'USD');

    // 4. Close goes back to the opening, and Start a tab finds the steps as they were left.
    await openStep(page, 'Rate');
    await page.getByRole('button', { name: 'Close and go back to the start', exact: true }).click();
    await page.locator('.landing h1').waitFor();
    assert.equal(await page.locator('.flow').isVisible(), false);
    await page.getByRole('button', { name: 'Start a tab', exact: true }).click();
    assert.equal(await page.getByLabel('What was it for?', { exact: true }).inputValue(), 'Dinner, Friday');

    // 5. By keyboard alone: Enter moves on from each box, and every press lands where it is seen.
    await page.goto(origin);
    const key = engine === 'webkit' ? 'Alt+Tab' : 'Tab';
    // The logo, the opening's Sample dinner link and Open Ztab (How it works is left out on a phone), then Start a tab.
    await page.keyboard.press(key); await page.keyboard.press(key); await page.keyboard.press(key); await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Start a tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'What’s the bill?');
    await page.keyboard.press(key); // How to split: the chosen card
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Split the total');
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-total');
    await page.keyboard.type('60');
    await page.keyboard.press('Enter');
    assert.equal(await title(page), 'Who’s splitting it?');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Who’s splitting it?');
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'One person fewer');
    await page.keyboard.press(key); await page.keyboard.press(key); await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Your name');
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Your own amount');
    await page.keyboard.press('Enter');
    assert.equal(await title(page), 'What is one ZEC worth?');
    await page.keyboard.press(key); await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-rate');
    await page.keyboard.type('100');
    await page.keyboard.press('Enter');
    assert.equal(await title(page), 'Where do you get paid?');
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA');
    await page.keyboard.type(address);
    await page.getByRole('button', { name: 'Make the links', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.locator('.links .ready h1').waitFor();
    assert.equal(await page.locator('.results .person:not(.own)').count(), 2);

    // 6. Every step at every size and in both schemes: no sideways scroll, boxes of 16 px or more,
    //    44 px targets, the step's two buttons in reach, and no motion with reduced motion.
    await page.goto(origin);
    await page.getByRole('button', { name: 'Start a tab', exact: true }).click();
    await fillIn(page, 'Total', '98'); await fillIn(page, 'Name of person 1', 'Ana'); await fillIn(page, 'Rate: one ZEC in that currency', '1327.32'); await fillIn(page, 'Your Zcash address', address);
    for (const step of ['Bill', 'People', 'Rate', 'Get paid', 'links']) {
      if (step === 'links') await makeLinks(page); else await openStep(page, step);
      for (const [width, height] of [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [1280, 900], [1440, 900]]) {
        for (const colorScheme of ['light', 'dark']) {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          await page.evaluate(() => scrollTo(0, 0));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${engine} ${step} ${width} ${colorScheme}: no overflow`);
          const view = step === 'links' ? '.links' : '.flow-panel:not([hidden]), .flow-actions';
          const small = await page.locator(view).evaluateAll(roots => roots.flatMap(r => [...r.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')]).filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id || e.getAttribute('aria-label')));
          assert.deepEqual(small, [], `${engine} ${step} ${width}: boxes are 16 px or more`);
          const tiny = await page.locator(view).evaluateAll(roots => roots.flatMap(r => [...r.querySelectorAll('button, a.button, summary')]).filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.textContent));
          assert.deepEqual(tiny, [], `${engine} ${step} ${width}: targets are 44 px or more`);
          if (step !== 'links') {
            const bar = await page.evaluate(() => {
              const buttons = [...document.querySelectorAll('.flow-steps button')], bar = document.querySelector('.flow-steps').getBoundingClientRect();
              const overflow = buttons.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent);
              const narrow = buttons.filter(b => b.getBoundingClientRect().width < 44 - 0.5).map(b => b.textContent);
              return { overflow, narrow, apart: buttons.at(-1).getBoundingClientRect().right <= bar.right + 0.5 };
            });
            assert.deepEqual(bar, { overflow: [], narrow: [], apart: true }, `${engine} ${step} ${width}: no step label runs into the next, every step is 44 px wide or more`);
            const box = await next(page).or(page.getByRole('button', { name: 'Make the links', exact: true })).boundingBox();
            assert.ok(box && box.y + box.height <= height + 1, `${engine} ${step} ${width}: the step's main button is on the screen`);
          }
          // Colour fades on buttons are not motion; no keyframe animation (a movement) runs.
          assert.deepEqual(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a instanceof CSSAnimation).map(a => `${a.animationName} on ${a.effect?.target?.className}`)), [], 'no motion with reduced motion');
          if (shots && engine === 'chromium' && [390, 1280].includes(width)) await page.screenshot({ path: `${shots}/${step.replace(' ', '-').toLowerCase()}-${width}-${colorScheme}.png` });
        }
      }
    }
    // The five steps of a split by item fit the bar as well, on every phone width.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await openStep(page, 'Bill');
    await page.getByRole('radio', { name: 'Split by item', exact: true }).check();
    for (const step of ['Bill', 'People', 'Items', 'Rate', 'Get paid']) {
      await openStep(page, step);
      for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 800 });
        const bar = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('.flow-steps button')], bar = document.querySelector('.flow-steps').getBoundingClientRect();
          return { overflow: buttons.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent), narrow: buttons.filter(b => b.getBoundingClientRect().width < 44 - 0.5).map(b => b.textContent), apart: buttons.at(-1).getBoundingClientRect().right <= bar.right + 0.5 };
        });
        assert.deepEqual(bar, { overflow: [], narrow: [], apart: true }, `${engine} by item ${step} ${width}: the bar fits, every step 44 px wide or more`);
      }
    }
    assert.deepEqual(errors, []);
    await context.close();

    // 8. A typed rate gives ZEC figures only once it settles: when its box is left, or after 600 ms without a key.
    //    Typed fast, no half number (1, 13, 132 …) ever prices a share; a fetched rate shows at once (section 1).
    const settle = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-US' });
    const typing = await settle.newPage();
    await typing.goto(origin);
    await typing.getByRole('button', { name: 'Start a tab', exact: true }).click();
    await typing.getByLabel('Total', { exact: true }).fill('98');
    await next(typing).click();
    await typing.getByLabel('Name of person 1', { exact: true }).fill('Ana');
    await next(typing).click();
    const rateBox = typing.getByLabel('Rate: one ZEC in USD', { exact: true });
    // Every frame, note whether a ZEC figure or a rate line is shown anywhere in the steps.
    await typing.evaluate(() => {
      window.__zecSeen = 0;
      const look = () => {
        const shown = [...document.querySelectorAll('.flow .zec, .flow-receipt .fr-meta')].some(e => /ZEC/.test(e.textContent) && e.getClientRects().length > 0);
        if (shown) window.__zecSeen++;
        window.__look = requestAnimationFrame(look);
      };
      look();
    });
    await rateBox.pressSequentially('1327.32', { delay: 80 });
    assert.equal(await typing.evaluate(() => window.__zecSeen), 0, 'no ZEC figure while the rate is being typed');
    await typing.locator('[data-step="rate"] .split-preview .zec').first().waitFor({ timeout: 2000 });
    assert.match(await typing.locator('[data-step="rate"] .split-preview').innerText(), /Ana\n\$32\.67\n0\.02461351 ZEC/, 'after a pause the figures come, from the whole rate');
    // Leaving the box settles it at once, before the pause is over.
    await rateBox.fill('');
    await typing.evaluate(() => { window.__zecSeen = 0; });
    await rateBox.pressSequentially('1300', { delay: 60 });
    await rateBox.blur();
    await typing.locator('[data-step="rate"] .split-preview li').filter({ hasText: '0.02513077 ZEC' }).first().waitFor({ timeout: 400 });
    await settle.close();

    // 7. With motion: the sheet and each step move in, and are still within half a second.
    const moving = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', locale: 'en-US' });
    const lively = await moving.newPage();
    await lively.goto(origin);
    await lively.getByRole('button', { name: 'Start a tab', exact: true }).click();
    const timings = await lively.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.flow')).map(a => a.effect.getComputedTiming().endTime));
    assert.ok(timings.length > 0 && Math.max(...timings) <= 500, `the step moves in, briefly (${timings})`);
    await moving.close();
    console.log(`${engine}: equal shares, fixed amount, by item with a fixed sum, errors on their step, fetch clears its error, Back/browser Back, Close keeps the steps, keyboard only, links first with one gold button, previews and back, 320–1440 light/dark, 16 px boxes, 44 px targets, reduced motion, quiet visit PASS`);
  } finally {
    await browser.close();
  }
}
