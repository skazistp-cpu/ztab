// Browser UI regression only. No wallet is launched and no payment is made.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TAB_ORIGIN||'http://127.0.0.1:8776';
const address='ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for(const engine of (process.env.BROWSERS||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch();try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await newTab(page,{total:'90',people:['Ana'],address,rate:'100'});
 await page.getByRole('link',{name:'Preview',exact:true}).first().click();
 const link=page.getByRole('link',{name:'Open in my wallet',exact:true});await link.waitFor();
 const uri=await link.getAttribute('href');assert.ok(uri.startsWith('zcash:'+address+'?'));
 const params=new URLSearchParams(uri.split('?')[1]);assert.equal(params.get('amount'),'0.3');assert.ok(Buffer.from(params.get('memo'),'base64url').toString().endsWith(' · Ztab'));
 assert.ok(await link.evaluate(e=>e.getBoundingClientRect().bottom<=844),'wallet button on first phone screen');
 await page.evaluate(()=>document.fonts.ready);const initial=[...requests];assert.equal(initial.length,7,'normal flow still loads seven own files: the page, its script and style, three faces (Geist on the opening, Inter and JetBrains Mono in the steps) and the picture of the dinner');
 await page.evaluate(()=>{window.storageCalls=0;for(const m of ['getItem','setItem','removeItem','clear'])Storage.prototype[m]=()=>{window.storageCalls++;throw Error('unexpected storage');};Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedRequest=text;}} ,configurable:true});});
 await page.getByRole('button',{name:'Copy payment request',exact:true}).click({timeout:2500});
 assert.equal(await page.evaluate(()=>window.copiedRequest),uri,'copied request equals wallet URI including memo');
 await page.locator('.wallet-help > summary').click();
 const text=page.getByRole('textbox',{name:'Payment request to copy',exact:true});assert.equal(await text.inputValue(),uri);assert.equal(await text.getAttribute('readonly'),'');
 await page.getByLabel('Opening help for', {exact:true}).selectOption('ios');assert.match(await page.locator('.wallet-platform-hint').innerText(),/second scan/);
 await page.getByLabel('Opening help for', {exact:true}).selectOption('android');assert.match(await page.locator('.wallet-platform-hint').innerText(),/Advanced mode/);
 await page.getByLabel('Opening help for', {exact:true}).selectOption('desktop');assert.match(await page.locator('.wallet-platform-hint').innerText(),/another device/);
 assert.equal(await page.getByRole('table',{name:'Wallet checks, 10–11 October 2026'}).count(),1);
 await page.locator('.wallet-help > summary').click();
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});
 await page.waitForTimeout(2600);await page.getByRole('button',{name:'Copy payment request',exact:true}).click();
 assert.match(await page.locator('.request-copy .copy-status').innerText(),/Could not copy/);
 assert.equal(await page.locator('.wallet-help').getAttribute('open'),'','denied copy opens manual fallback');
 await page.getByRole('button',{name:'Select request text',exact:true}).click();
 assert.deepEqual(await text.evaluate(e=>[document.activeElement===e,e.selectionStart,e.selectionEnd]),[true,0,uri.length]);
 for(const width of [320,390,1280])for(const colorScheme of ['light','dark']){
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engine}/${width}/${colorScheme} no overflow`);
 if(width<600)assert.ok(await page.locator('.wallet-checks caption').evaluate(e=>e.getBoundingClientRect().width>=200),'mobile wallet caption readable');
 const qr=page.locator('.pay .stub .qr');assert.ok(await qr.evaluate((e,w)=>e.getBoundingClientRect().width>=(w>=1000?300:210),width),'readable payment QR size');
 assert.equal(await qr.locator('svg rect').first().getAttribute('fill'),'white');
 assert.equal(await link.getAttribute('href'),uri);
 for(const button of [page.locator('.wallet-help > summary'),page.getByRole('button',{name:'Select request text',exact:true})])assert.ok(await button.evaluate(e=>e.getBoundingClientRect().height>=44));
 if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${engine}-${width}-${colorScheme}.png`,fullPage:true});writeFileSync(`${process.env.SHOTS}/${engine}-request.txt`,uri);await qr.screenshot({path:`${process.env.SHOTS}/${engine}-qr-${width}-${colorScheme}.png`});await page.locator('.wallet-help > summary').click();await page.screenshot({path:`${process.env.SHOTS}/${engine}-${width}-${colorScheme}-closed.png`,fullPage:true});await page.locator('.wallet-help > summary').click();}
 }
 assert.deepEqual(requests,initial,'help and copy add no request');assert.equal(await page.evaluate(()=>window.storageCalls),0);assert.deepEqual(errors,[]);
 console.log(engine+' wallet hand-off PASS: exact request, denied-copy/select fallback, help, layout and zero storage/network');
 }finally{await browser.close();}
}
