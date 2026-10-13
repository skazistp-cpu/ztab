// Run against a production preview, with the same environment as items.mjs.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.TAB_BASE_URL ?? 'http://127.0.0.1:8764';
const evidence = process.env.TAB_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, {recursive:true});
for (const engine of ['chromium', 'webkit']) {
  const browser = await pw[engine].launch();
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',locale:'en-US'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fresh = async () => {
      await page.goto(base);
      await openStep(page,'Bill');
      await page.getByRole('radio',{name:'Split by item',exact:true}).check();
      await openStep(page,'Items');
    };
    const capture = async name => {
      if (evidence) await page.screenshot({path:`${evidence}/${engine}-${name}.png`,fullPage:true});
    };
    await fresh();
    await capture('fresh');
    assert.equal((await page.locator('.item-totals').innerText()).trim(), '', 'untouched items must not announce validation');
    assert.equal(await page.locator('.item-totals').isVisible(), false, 'untouched items must not leave an empty totals panel');
    await page.getByLabel('Item 1 name',{exact:true}).fill('Dinner');
    await fillIn(page,'Name of person 1','Ben');
    await openStep(page,'Items');
    assert.equal((await page.locator('.item-totals').innerText()).trim(), '', 'names alone must not trigger price or assignment errors');
    await page.getByLabel('Item 1 price',{exact:true}).fill('0');
    assert.equal(await page.locator('.item-totals').isVisible(), false, 'no error while the price is still being typed');
    await page.getByLabel('Item 1 price',{exact:true}).blur();
    assert.equal(await page.locator('.item-totals').isVisible(), true, 'the error shows once the price box is left');
    assert.match(await page.locator('.item-totals').innerText(), /price above zero/);
    await page.getByLabel('Item 1 price',{exact:true}).fill('12');
    assert.match(await page.locator('.item-totals').innerText(), /Choose who shared/);
    await capture('price-unassigned');
    await page.getByRole('checkbox',{name:'Ben',exact:true}).check();
    assert.match(await page.locator('.item-totals').innerText(), /12\.00/);
    await openStep(page,'People');
    await page.getByRole('button',{name:'Remove person 1',exact:true}).click();
    await openStep(page,'Items');
    assert.match(await page.locator('.item-totals').innerText(), /no longer on the bill/);
    assert.equal(await page.getByRole('checkbox',{name:/Removed person/}).count(), 1);
    await capture('orphan');
    // Clearing the price must not conceal an unresolved removed-person assignment.
    await page.getByLabel('Item 1 price',{exact:true}).fill('');
    assert.notEqual((await page.locator('.item-totals').innerText()).trim(), '');
    assert.equal(await page.getByRole('checkbox',{name:/Removed person/}).count(), 1);
    await fresh();
    await makeLinks(page);
    assert.match(await page.locator('[role="alert"]').innerText(), /price above zero/);
    assert.ok(await page.getByLabel('Item 1 price',{exact:true}).evaluate(el => el === document.activeElement));
    await capture('submitted');
    // After submission, editing an unrelated field keeps live item validation active.
    await page.getByLabel('Item 1 name',{exact:true}).fill('Dinner');
    assert.match(await page.locator('.item-totals').innerText(), /price above zero/);
    assert.equal(await page.locator('.results .person').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${engine}: fresh form, names only, invalid price, unassigned price, orphan, submit and subsequent edits PASS`);
  } finally {
    await browser.close();
  }
}
