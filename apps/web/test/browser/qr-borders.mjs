// Rendered borders and exact payloads for all three QR locations. No camera or wallet.
import assert from 'node:assert/strict';
import { box, fillIn, makeLinks, newTab, openStep } from './lib/flow.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TAB_ORIGIN||'http://127.0.0.1:8776';
const out=process.env.SHOTS;
const address='ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const captures=[];
for(const engine of (process.env.BROWSERS||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch();try{
  const page=await browser.newPage({locale:'en-US',viewport:{width:390,height:844},reducedMotion:'reduce'});
  const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await newTab(page,{total:'90',people:['Ana'],address,rate:'100'});
  await page.evaluate(()=>document.fonts.ready);
  const preview=await page.getByRole('link',{name:'Preview',exact:true}).first().getAttribute('href');
  const table=await page.getByRole('link',{name:'Show Table QR',exact:true}).getAttribute('href');
  const uri=await page.locator('.person .qr').first().getAttribute('aria-label');assert.equal(uri,'Payment request for Ana');
  const initial=[...requests];assert.equal(initial.length,6);
  await page.evaluate(()=>{window.storageCalls=0;for(const m of ['getItem','setItem','removeItem','clear'])Storage.prototype[m]=()=>{window.storageCalls++;throw Error('unexpected storage');};});
  async function check(kind,selector,payload){
   const qr=page.locator(selector).first();await qr.waitFor();
   const margins=await qr.locator('svg').evaluate(svg=>{
    const v=svg.viewBox.baseVal,b=svg.querySelector('path').getBBox();
    return [b.x-v.x,b.y-v.y,v.x+v.width-b.x-b.width,v.y+v.height-b.y-b.height];
   });
   assert.deepEqual(margins,[16,16,16,16],`${engine} ${kind}: four blank modules (4 SVG units each)`);
   assert.equal(await qr.locator('rect').first().getAttribute('fill'),'white');
   for(const width of [320,390,1280])for(const colorScheme of ['light','dark']){
    await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${kind} no overflow`);
    if(out){mkdirSync(out,{recursive:true});const file=`${engine}-${kind}-${width}-${colorScheme}.png`;await qr.screenshot({path:`${out}/${file}`});captures.push({file,payload});}
   }
  }
  await page.locator('.person details.code').first().locator('summary').click();
  // Read the exact payment URI from its pay screen without discarding the organiser form.
  const friend=await browser.newPage({locale:'en-US'});await friend.goto(preview);
  const payment=await friend.getByRole('link',{name:'Open in my wallet',exact:true}).getAttribute('href');await friend.close();
  assert.ok(payment.startsWith('zcash:'+address+'?'));
  await check('organiser','.person .qr',payment);
  await page.getByRole('link',{name:'Show Table QR',exact:true}).click();
  await check('table','.table-qr',new URL(table.replace(/\/qr$/,''),origin).href);
  await page.evaluate(url=>{location.hash=new URL(url).hash;},preview);
  await check('pay','.pay .qr',payment);
  assert.deepEqual(requests,initial);assert.equal(await page.evaluate(()=>window.storageCalls),0);assert.deepEqual(errors,[]);
  console.log(`${engine}: organiser, table and pay QR borders PASS; 320/390/1280 light/dark; no extra requests or storage`);
 }finally{await browser.close();}
}
if(out)writeFileSync(`${out}/payloads.json`,JSON.stringify(captures,null,2)+'\n');
