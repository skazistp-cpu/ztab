// Copy-only follow-up: real organiser UI and links, clipboard boundary stubbed.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { makeTab } from '../../src/tab.ts';
import { encodeTable, mineFragment } from '../../src/table-link.ts';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TAB_ORIGIN || 'http://127.0.0.1:8776';
const tab = makeTab({createdAt:'2026-10-15T18:00:00Z',from:'Lena',label:'Dinner',
  payee:'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez',
  itemized:true,fiat:'USD',total:'90.00',ownShare:'30.00',people:[{name:'Ana',amount:'20.00'},{name:'Ana',amount:'40.00'},{name:'Ben',amount:'0.00'}],
  rate:{fiatPerZec:'100',source:'Manual entry',observedAt:'2026-10-15T18:00:00Z'}});
assert.equal(tab.kind,'tab');
const table=encodeTable(tab.rows.map(row=>row.fragment),tab.zeroPeople);assert.equal(table.kind,'fragment');
for(const engine of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
 const browser=await pw[engine].launch();
 try {
 const ctx=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},reducedMotion:'reduce'});
 // Optional in-process static build serving: no second dev server on a shared Mac.
 if(process.env.TAB_DIST) await ctx.route(origin+'/**',async route=>{
   const file=decodeURIComponent(new URL(route.request().url()).pathname);
   const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.wasm')?'application/wasm':file==='/'?'text/html':undefined;
   await route.fulfill({path:path.join(process.env.TAB_DIST,file==='/'?'index.html':file),...(mime?{contentType:mime}:{})});
 });
 await ctx.addInitScript(()=>{
   window.copied='';window.storageCalls=0;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});
   for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=()=>{window.storageCalls++;throw Error('unexpected storage');};
 });
 const page=await ctx.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'#'+mineFragment(table.fragment,[true,false]));
 await page.locator('.mine-person').first().waitFor();
 await page.waitForLoadState('networkidle');
 const initial=[...requests];
 const section=page.locator('.mine-followup');
 assert.equal(await section.count(),1,'organiser offers a follow-up section');
 assert.equal(await section.getAttribute('open'),null);
 await section.locator('summary').click();
 const message=page.getByRole('textbox',{name:'Follow-up message to copy',exact:true});
 let text=await message.inputValue();assert.match(text,/2\. Ana — \$40\.00 · 0\.4 ZEC/);
 assert.ok(text.includes(tab.rows[1].fragment));assert.ok(!text.includes(tab.rows[0].fragment));assert.ok(!text.includes('Ben'));assert.ok(!text.includes('/mine'));
 assert.match(text,/does not confirm whether a payment was made/);assert.match(text,/already paid.*before paying again/);assert.match(text,/Testnet: not real ZEC/);
 assert.equal(await page.evaluate(()=>window.copied),'','opening does not copy or send');
 await page.getByRole('button',{name:'Copy follow-up',exact:true}).click();assert.equal(await page.evaluate(()=>window.copied),text);
 const copyLinks=text.split('\n').filter(line=>line.startsWith(origin));assert.equal(copyLinks.length,1);
 const pay=await ctx.newPage();await pay.goto(copyLinks[0]);const wallet=pay.getByRole('link',{name:'Open in my wallet',exact:true});await wallet.waitFor();assert.equal(await wallet.getAttribute('href'),tab.rows[1].uri);await pay.close();
 const boxes=page.locator('.mine-person input');await boxes.nth(1).check();assert.equal(await section.isVisible(),false);assert.equal(await page.locator('#followup-message').inputValue(),'');
 await page.getByRole('heading',{name:'Settled in your record',exact:true}).waitFor();
 await boxes.nth(0).uncheck();assert.equal(await section.isVisible(),true);text=await message.inputValue();assert.ok(text.includes(tab.rows[0].fragment));assert.ok(!text.includes(tab.rows[1].fragment));
 assert.deepEqual(requests,initial,'copying and ticking do not fetch anything');
 // Current state survives reload; the message is rebuilt from marks, not cached.
 await page.reload();await section.locator('summary').click();text=await message.inputValue();assert.ok(text.includes(tab.rows[0].fragment));assert.ok(!text.includes(tab.rows[1].fragment));
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});
 await page.getByRole('button',{name:'Copy follow-up',exact:true}).click();assert.match(await section.locator('.copy-status').innerText(),/Could not copy/);
 await page.getByRole('button',{name:'Select follow-up text',exact:true}).click();assert.deepEqual(await message.evaluate(e=>[document.activeElement===e,e.selectionStart,e.selectionEnd]),[true,0,text.length]);
 for(const width of [320,390,1280])for(const colorScheme of ['light','dark']){
  await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});await section.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.getByRole('button',{name:'Select follow-up text',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));
  if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/followup-${engine}-${width}-${colorScheme}.png`});}
 }
 const memo=Buffer.from(new URL(tab.rows[0].uri).searchParams.get('memo'),'base64url').toString('utf8');
 await page.getByLabel('Paste a note from a payment in your wallet',{exact:true}).fill(memo);
 await page.getByRole('button',{name:'Find matching requests',exact:true}).click();
 await page.getByRole('button',{name:'Tick Ana',exact:true}).click();
 assert.equal(await section.isVisible(),false);assert.equal(await page.locator('#followup-message').inputValue(),'');
 assert.equal(await page.evaluate(()=>window.storageCalls),0);
 assert.ok(requests.every(u=>new URL(u).origin===new URL(origin).origin));
 assert.ok(!requests.some(u=>/scanner|finder.*wasm|demo-receiver/.test(u)));
 assert.deepEqual(errors,[]);console.log(engine+' follow-up PASS: positional filtering, unchanged pay request, ticks/reload, clipboard fallback, 6 viewport/theme cases, no storage or external requests');
 await ctx.close();
 }finally{await browser.close();}
}
