import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.TAB_BASE_URL??'http://127.0.0.1:8767';const out=process.env.TAB_EVIDENCE_DIR??'output/table-qr';await mkdir(out,{recursive:true});
const address='ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
for(const engine of ['chromium','webkit']){
 const browser=await pw[engine].launch();try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',locale:'en-US'});page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await newTab(page,{name:'Lena',label:'Dinner, Friday',total:'300',count:5,people:['Ana','Dragan','Tomás','Priya','Jonas'],amounts:[,,,,'20'],address,rate:'1229.06'});
 const originalLinks=await page.locator('.results .person:not(.own) a').filter({hasText:'Preview'}).evaluateAll(els=>els.map(a=>a.href));
 const pickerHref=await page.getByRole('link',{name:'Open name picker',exact:true}).getAttribute('href');const pickerUrl=new URL(pickerHref,base).href;
 await page.getByRole('link',{name:'Show Table QR',exact:true}).click();await page.locator('.table-qr svg').waitFor();
 for(const width of [390,1280])for(const scheme of ['light','dark']){
  await page.setViewportSize({width,height:width===390?844:900});await page.emulateMedia({colorScheme:scheme});await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'code overflow');await page.screenshot({path:`${out}/${engine}-code-${width}-${scheme}.png`,fullPage:true});
  await page.locator('.table-qr').screenshot({path:`${out}/${engine}-qr-${width}-${scheme}.png`});
 }
 let copied;await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.__copied=t;}}});});await page.getByRole('button',{name:'Copy table link',exact:true}).click();copied=await page.evaluate(()=>window.__copied);assert.equal(copied,pickerUrl);
 await page.getByRole('link',{name:'Back to your bill',exact:true}).click();await page.locator('.links .ready h1').waitFor();assert.equal(await page.getByRole('link',{name:'Show Table QR',exact:true}).count(),1,'the links are on screen again, with the table code');assert.equal(await page.getByLabel('Total',{exact:true}).inputValue(),'300');await fillIn(page,'Total','301');
 // Back to the links screen as it is now: the bill changed, so it offers no table code until the links are made again.
 await page.goBack();await page.locator('.links .results-changed').waitFor();await page.waitForFunction(()=>document.activeElement?.textContent==='Back to the bill');assert.ok(await page.evaluate(()=>{const r=document.querySelector('.links .results-changed').getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;}),'the notice is on screen, its button focused');assert.equal(await page.locator('.links').isVisible(),true,'the links screen is the one shown');assert.equal(await page.getByRole('link',{name:'Show Table QR',exact:true}).count(),0,'bill edit clears table code controls');assert.equal(await page.locator('.links a[href*="/qr"]').count(),0,'nor anywhere in it');
 // Recipient pages must make no storage calls and no third-party requests.
 const pay=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',locale:'en-US'});pay.on('pageerror',e=>errors.push(e.message));await pay.addInitScript(()=>{window.__storageCalls=0;for(const key of ['getItem','setItem','removeItem','clear']){const old=Storage.prototype[key];Storage.prototype[key]=function(...args){window.__storageCalls++;return old.apply(this,args);};}});
 const hosts=new Set();pay.on('request',r=>hosts.add(new URL(r.url()).origin));await pay.goto(pickerUrl);assert.equal(await pay.locator('.table-person').count(),5);assert.match(await pay.locator('.table-picker').innerText(),/Anyone with this table link/);
 for(const width of [390,1280])for(const scheme of ['light','dark']){
  await pay.setViewportSize({width,height:width===390?844:900});await pay.emulateMedia({colorScheme:scheme});await pay.evaluate(()=>document.fonts.ready);assert.ok(await pay.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'picker overflow');await pay.screenshot({path:`${out}/${engine}-picker-${width}-${scheme}.png`,fullPage:true});
 }
 for(let i=0;i<5;i++){
  await pay.goto(pickerUrl);await pay.locator('.table-person').nth(i).click();const request=await pay.getByRole('link',{name:'Open in my wallet',exact:true}).getAttribute('href');
  await pay.reload();assert.equal(await pay.getByRole('link',{name:'Open in my wallet',exact:true}).getAttribute('href'),request);
  const old=await browser.newPage();await old.goto(originalLinks[i]);assert.equal(await old.getByRole('link',{name:'Open in my wallet',exact:true}).getAttribute('href'),request);await old.close();
  await pay.getByRole('link',{name:'Choose a different name',exact:true}).click();await pay.locator('.table-person').first().waitFor();assert.equal(await pay.locator('.table-person').count(),5);
 }
 await pay.goto(pickerUrl);await pay.locator('.table-person').nth(2).click();await pay.goBack();await pay.locator('.table-person').first().waitFor();assert.equal(await pay.locator('.table-person').count(),5);
 assert.equal(await pay.evaluate(()=>window.__storageCalls),0);assert.deepEqual([...hosts],[new URL(base).origin]);
 // Duplicate names use positional selection; markup stays inert; zero names never get a link.
 const raw=pickerHref.slice(1),v=JSON.parse(Buffer.from(raw.slice(3),'base64url').toString());v[1][0][0]='Ana';v[1][1][0]='Ana';v[1][2][0]='<img src=x onerror=alert(1)>';v[2]=['Nobody'];
 const group=data=>'g1.'+Buffer.from(JSON.stringify(data)).toString('base64url');await pay.goto(base+'#'+group(v));assert.match(await pay.locator('.caution').innerText(),/names repeat/);assert.equal(await pay.locator('.table-person').count(),5);assert.equal(await pay.locator('.table-picker img').count(),0);assert.match(await pay.locator('.table-zero').innerText(),/Nobody/);
 const zeroDuplicate=structuredClone(v);zeroDuplicate[1][1][0]='Ben';zeroDuplicate[2]=['Ana'];await pay.goto(base+'#'+group(zeroDuplicate));assert.match(await pay.locator('.caution').innerText(),/names repeat/,'a zero-share namesake must also trigger the duplicate warning');assert.equal(await pay.locator('.table-zero a').count(),0);
 for(const suffix of ['/49','/-1','/0/1']){await pay.goto(base+'#'+group(v)+suffix);assert.equal(await pay.getByRole('link',{name:'Open in my wallet',exact:true}).count(),0);assert.match(await pay.locator('h1').innerText(),/incomplete/);}
 const changed=structuredClone(v);changed[1][4][2]='1';await pay.goto(base+'#'+group(changed));await pay.getByText('VOID',{exact:true}).waitFor();assert.equal(await pay.getByRole('link',{name:'Open in my wallet',exact:true}).count(),0);
 const huge=structuredClone(v);huge[1]=Array.from({length:49},(_,i)=>['Long participant name '+i,v[1][0][1],v[1][0][2]]);huge[2]=[];await pay.goto(base+'#'+group(huge)+'/qr');assert.equal(await pay.locator('.table-qr').count(),0);assert.match(await pay.locator('.warning').innerText(),/too large/);assert.equal(await pay.getByRole('button',{name:'Copy table link',exact:true}).count(),1);
 await writeFile(`${out}/${engine}-qr-expected.json`,JSON.stringify({url:pickerUrl,characters:pickerUrl.length},null,2));
 assert.deepEqual(errors,[]);console.log(`${engine}: maker, QR, picker, exact requests, reload/Back, duplicates, zero shares, tampering, dense fallback, no storage/external requests PASS`);
 }finally{await browser.close();}
}
