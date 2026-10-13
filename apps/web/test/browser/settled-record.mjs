// A personal tick record, never a simulated payment confirmation.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import {mkdirSync} from 'node:fs';
import {makeTab} from '../../src/tab.ts';
import {encodeTable,mineFragment} from '../../src/table-link.ts';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TAB_ORIGIN||'http://127.0.0.1:8776';
const address='ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for(const engine of (process.env.BROWSERS||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch();try{
 const context=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(origin);await newTab(page,{label:'Dinner',total:'90',people:['Ana','Ana'],address,rate:'100'});await page.getByRole('link',{name:'Open my page',exact:true}).click();
 await page.locator('.mine-person').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const initial=[...requests];assert.equal(initial.length,7,'the opening and the steps: the page, a script, a stylesheet, three faces (Geist on the opening, Inter and JetBrains Mono in the steps) and the picture of the dinner');
 await page.evaluate(()=>{window.storageCalls=0;for(const m of ['getItem','setItem','removeItem','clear'])Storage.prototype[m]=()=>{window.storageCalls++;throw Error('unexpected storage');};Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedSummary=text;}},configurable:true});});
 const complete=page.getByRole('heading',{name:'Settled in your record',exact:true});assert.equal(await complete.isVisible(),false);
 assert.equal(await page.locator('.mine-count').innerText(),'0 of 2 ticked');
 const boxes=page.locator('.mine-person input');await boxes.nth(0).check();assert.equal(await complete.isVisible(),false);
 await boxes.nth(1).check();await complete.waitFor({timeout:2500});
 assert.equal(await page.locator('.mine-count').getAttribute('role'),'status');
 assert.equal(await page.locator('.mine-count').innerText(),'2 of 2 ticked. Settled in your record. These are your marks, not payment confirmation.');
 const summary=page.getByRole('textbox',{name:'Summary to copy',exact:true});
 const expected='Dinner — organiser’s record\nTestnet: not real ZEC\nAll 2 requested shares ticked.\n1. Ana — $30.00 · 0.3 ZEC\n2. Ana — $30.00 · 0.3 ZEC\nThe organiser ticked these by hand. It is their own record, not a payment confirmation.\nZtab';
 assert.equal(await summary.inputValue(),expected);assert.equal(await summary.getAttribute('readonly'),'');
 await page.getByRole('button',{name:'Copy summary',exact:true}).click();assert.equal(await page.evaluate(()=>window.copiedSummary),expected);
 assert.match(page.url(),/\/mine\/11$/);const allUrl=page.url();
 await boxes.nth(0).uncheck();assert.equal(await complete.isVisible(),false);assert.equal(await page.locator('#settled-summary').inputValue(),'');
 assert.equal(await page.locator('.mine-count').innerText(),'1 of 2 ticked');
 await boxes.nth(0).check();assert.equal(await summary.inputValue(),expected);
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});await page.waitForTimeout(2600);
 await page.getByRole('button',{name:'Copy summary',exact:true}).click();assert.match(await page.locator('.mine-complete .copy-status').innerText(),/Could not copy/);
 await page.getByRole('button',{name:'Select summary text',exact:true}).click();assert.deepEqual(await summary.evaluate(e=>[document.activeElement===e,e.selectionStart,e.selectionEnd]),[true,0,expected.length]);
 for(const width of [320,390,1280])for(const colorScheme of ['light','dark']){
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.ok(await page.getByRole('button',{name:'Select summary text',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));
 if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${engine}-${width}-${colorScheme}.png`,fullPage:true});}
 }
 assert.deepEqual(requests,initial);assert.equal(await page.evaluate(()=>window.storageCalls),0);
 const fresh=await context.newPage();await fresh.addInitScript(()=>{window.storageCalls=0;for(const m of ['getItem','setItem','removeItem','clear'])Storage.prototype[m]=()=>{window.storageCalls++;throw Error('unexpected storage');};});
 await fresh.goto(allUrl);await fresh.getByRole('heading',{name:'Settled in your record',exact:true}).waitFor();assert.equal(await fresh.getByRole('textbox',{name:'Summary to copy',exact:true}).inputValue(),expected);assert.equal(await fresh.evaluate(()=>window.storageCalls),0);
 await fresh.locator('.mine-person input').nth(1).uncheck();await fresh.reload();assert.equal(await fresh.getByRole('heading',{name:'Settled in your record',exact:true}).isVisible(),false);
 const one=makeTab({createdAt:'2026-10-12T00:00:00Z',from:'Lena',label:'Solo share',payee:address,fiat:'USD',total:'30.00',ownShare:'10.00',itemized:true,people:[{name:'Ana',amount:'20.00'},{name:'Ben',amount:'0.00'}],rate:{fiatPerZec:'100',source:'Manual entry',observedAt:'2026-10-12T00:00:00Z'}});
 assert.equal(one.kind,'tab');const encoded=encodeTable(one.rows.map(r=>r.fragment),one.zeroPeople);assert.equal(encoded.kind,'fragment');
 await fresh.goto(origin+'#'+mineFragment(encoded.fragment,[]));await fresh.locator('.mine-person').waitFor();
 assert.equal(await fresh.locator('.mine-person input').count(),1);assert.equal(await fresh.getByRole('heading',{name:'Settled in your record',exact:true}).isVisible(),false);
 await fresh.locator('.mine-person input').check();const single=await fresh.getByRole('textbox',{name:'Summary to copy',exact:true}).inputValue();
 assert.match(single,/All 1 requested share ticked/);assert.ok(!single.includes('Ben'),'zero share is not a payment mark');assert.match(await fresh.locator('.table-zero').innerText(),/Ben/);
 assert.deepEqual(errors,[]);console.log(engine+' settled record PASS: duplicates, exact copy, unset/reopen, denied clipboard, no request/storage');
 }finally{await browser.close();}
}
