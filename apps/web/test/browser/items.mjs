// Run against a production preview: TAB_BASE_URL=http://127.0.0.1:8764
// PLAYWRIGHT_MODULE can point at an existing Playwright installation.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import { pathToFileURL } from 'node:url';
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.TAB_BASE_URL ?? 'http://127.0.0.1:8764';
const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for (const engine of ['chromium', 'webkit']) {
 const browser = await pw[engine].launch();
 try {
 const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',locale:'en-US'});
 page.setDefaultTimeout(5000);
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await openStep(page,'Bill');
 await page.getByRole('radio',{name:'Split by item',exact:true}).check({timeout:2500});
 await fillIn(page,'Your name','Ana');
 await fillIn(page,'What was it for?','Dinner');
 await fillIn(page,'Name of person 1','Ben');
 await fillIn(page,'Name of person 2','Carla');
 await openStep(page,'Items');
 const addItem = async(index,name,amount,who)=>{
   if(index>1) await page.getByRole('button',{name:'Add an item',exact:true}).click();
   const item=page.locator('.bill-item').nth(index-1);
   await item.getByLabel(`Item ${index} name`,{exact:true}).fill(name);
   await item.getByLabel(`Item ${index} price`,{exact:true}).fill(amount);
   for(const person of who) await item.getByRole('checkbox',{name:person,exact:true}).check();
 };
 await addItem(1,'Steak','32',['You']);
 await addItem(2,'Salad','11',['Ben']);
 await addItem(3,'Wine','28',['You','Ben']);
 await page.getByLabel(/^Tip or service \(\%\)/).fill('10');
 assert.match(await page.locator('.item-totals').innerText(),/78\.10/);
 assert.match(await page.locator('.item-totals').innerText(),/50\.60/);
 assert.match(await page.locator('.item-totals').innerText(),/27\.50/);
 await fillIn(page,'Your Zcash address',address);
 await fillIn(page,'Rate: one ZEC in that currency','100');
 await makeLinks(page);
 assert.equal(await page.locator('.results .person:not(.own)').count(),1);
 assert.match(await page.locator('.results').innerText(),/No payment needed: Carla/);
 assert.match(await page.locator('.results .person:not(.own)').innerText(),/27\.50/);
 const preview=await page.locator('.results a').filter({hasText:'Preview'}).getAttribute('href');
 await openStep(page,'Items');
 await page.getByLabel('Item 2 price',{exact:true}).fill('12');
 assert.equal(await page.locator('.results .copy').count(),0,'editing invalidates old sharing controls');
 assert.match(await page.locator('.results').innerText(),/changed/i);
 // A removed participant must not be replaced by the next row.
 await openStep(page,'People');
 await page.getByRole('button',{name:'Remove person 1',exact:true}).click();
 await makeLinks(page);
 assert.equal(await page.locator('.results .person').count(),0);
 assert.match(await page.locator('[role="alert"]').innerText(),/no longer|Remove|Choose/i);
 assert.equal(await page.locator('.bill-item').nth(1).getByRole('checkbox',{name:/Removed/}).count(),1);
 // Resolve the orphan deliberately, then assign the salad to Carla.
 for (const item of await page.locator('.bill-item').all()) {
   for (const orphan of await item.getByRole('checkbox',{name:/Removed/}).all()) await orphan.click();
 }
 await page.locator('.bill-item').nth(1).getByRole('checkbox',{name:'Carla',exact:true}).check();
 await makeLinks(page);
 assert.equal(await page.locator('.results .person:not(.own)').count(),1);
 // The simple flow remains available; its total/amount fields return.
 await openStep(page,'Bill');
 await page.getByRole('radio',{name:'Split the total',exact:true}).check();
 await fillIn(page,'Total','20');
 await makeLinks(page);
 assert.match(await page.locator('.results').innerText(),/10\.00/);
 for(const width of [320,390,1280]) {
   await page.setViewportSize({width,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${engine} ${width}`);
 }
 // Duplicate names remain distinguishable in assignment controls.
 await openStep(page,'People');
 await page.getByRole('button',{name:'Add a person',exact:true}).click();
 await fillIn(page,'Name of person 1','Ana');
 await fillIn(page,'Name of person 2','Ana');
 await openStep(page,'Bill');
 await page.getByRole('radio',{name:'Split by item',exact:true}).check();
 await openStep(page,'Items');
 assert.equal(await page.locator('.bill-item').first().getByRole('checkbox',{name:'Ana (person 1)',exact:true}).count(),1);
 assert.equal(await page.locator('.bill-item').first().getByRole('checkbox',{name:'Ana (person 2)',exact:true}).count(),1);
 // An engine zero-zatoshi error must not focus an amount input hidden by item mode.
 await fillIn(page,'Rate: one ZEC in that currency','100000000000');
 await makeLinks(page);
 assert.ok(await page.locator('[aria-invalid="true"]').isVisible());
 assert.ok(await page.locator('[aria-invalid="true"]').evaluate(e=>e===document.activeElement));
 // Generated link still opens a wallet request with the exact original amount and memo.
 const pay=await browser.newPage(); let storageCalls=0;
 await pay.exposeFunction('recordStorageCall',()=>storageCalls++);
 await pay.addInitScript(()=>{for(const key of ['getItem','setItem','removeItem']) {const original=Storage.prototype[key];Storage.prototype[key]=function(...args){window.recordStorageCall();return original.apply(this,args);};}});
 await pay.goto(preview);
 const uri=await pay.getByRole('link',{name:'Open in my wallet',exact:true}).getAttribute('href');
 assert.match(uri,/amount=0\.275(?:&|$)/);
 const memo=new URL(uri).searchParams.get('memo');
 assert.match(Buffer.from(memo,'base64url').toString('utf8'),/Dinner · Ben · \$27\.50 · .* · Ztab$/);
 assert.equal(storageCalls,0);
 assert.deepEqual(errors,[]);
 console.log(`${engine}: item assignments, tip, zero shares, stale results, removal, simple mode, widths and payment request PASS`);
 } finally {await browser.close();}
}
