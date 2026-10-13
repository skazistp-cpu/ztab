// Real scanner/module, synthetic encrypted payments and a stand-in server. No wallet proof.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {fields} from '../../src/find/wire.ts';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.TAB_ORIGIN||'http://127.0.0.1:8776';
const vector=JSON.parse(readFileSync(new URL('../fixtures/finder-vector.json',import.meta.url),'utf8'));
const address='utest1pe4m6k3sxddcsld5njyqzugh354lx2mm45e9833yteh9z8l4erchemv4ulnd9ls65gdws3ytvs6r9zu48g0ha649xz3df64tkqj9jn9z';
const id='d9b235dec4cce12888bf042d69bbfe22456c90ae0e906160bcfc0ba1fe21fa10',height=4491326,tip=5000000;
const unhex=s=>Uint8Array.from(Buffer.from(s,'hex'));
const varint=v=>{const o=[];let n=BigInt(v);while(n>=128n){o.push(Number(n&127n)|128);n>>=7n;}o.push(Number(n));return o;};
const num=(f,v)=>[...varint(f<<3),...varint(v)],bytes=(f,v)=>[...varint((f<<3)|2),...varint(v.length),...v];
const action=s=>{const a=unhex(s);return [...bytes(1,a.slice(0,32)),...bytes(2,a.slice(32,64)),...bytes(3,a.slice(64,96)),...bytes(4,a.slice(96))];};
const frame=(m,flag=0)=>[flag,(m.length>>>24)&255,(m.length>>>16)&255,(m.length>>>8)&255,m.length&255,...m];
const ok=frame([...new TextEncoder().encode('grpc-status: 0\r\n')],128);
const block=h=>[...num(2,h),...num(5,h===height?1791787800:1800000000-(tip-h)*25),...([height,tip-5].includes(h)?bytes(7,[...bytes(2,h===height?unhex(id).reverse():new Uint8Array(32).fill(9)),...bytes(9,action(vector.ironwood.action))]):[])];
for(const engine of (process.env.BROWSERS||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch();try{
 const ctx=await browser.newContext({locale:'en-US',viewport:{width:390,height:844}}),page=await ctx.newPage(),calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));await ctx.addInitScript(()=>{Date.now=()=>1800000000*1000;});
 await ctx.route('**/demo-receiver.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,network:'test',address,viewingKey:vector.key,birthday:4490492})}));
 let hold=false,release,waiting,asked,fail=false;
 await ctx.route('https://zcash-testnet.chainsafe.dev/**',async r=>{
  const method=r.request().url().split('/').pop(),body=r.request().postDataBuffer().subarray(5);calls.push(method);
  assert.ok(!body.includes(Buffer.from(vector.key)));assert.equal(r.request().headers().referer,undefined);
  if(method==='GetBlockRange'&&hold){asked();await waiting;}
  let out=[];
  if(method==='GetLightdInfo')out=frame(num(7,tip));
  if(method==='GetBlockRange'){const f=fields(body),a=Number(fields(f[1][0])[1][0]),b=Number(fields(f[2][0])[1][0]);calls.push([a,b]);if(!(fail&&a===height))for(let h=a;h<=b;h++)out.push(...frame(block(h)));}
  if(method==='GetTransaction')out=frame(bytes(1,unhex(vector.ironwood.transaction)));
  await r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'application/grpc-web+proto'},body:Buffer.from([...out,...ok])}).catch(()=>{});
 });
 await page.goto(origin+'/?demo#demo/1800000000000/1234567890abcdef/00');
 await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();await page.getByRole('button',{name:'Use the public demo key',exact:true}).click();assert.deepEqual(calls,[]);
 const look=page.getByRole('button',{name:'Look for payments',exact:true});await look.click();
 const example=page.locator('.demo-example-result');await example.waitFor({timeout:5000});
 assert.match(await example.innerText(),/Example payment from 12 Oct 2026/);assert.match(await example.innerText(),/not your payment/);assert.ok((await example.innerText()).includes(vector.memo));assert.equal(await example.locator('button').count(),0);
 assert.match(await page.locator('.pay-find-result').innerText(),/Recent payments/);assert.equal(await page.locator('.pay-find-result .note-match-choice').count(),2);
 assert.deepEqual(calls.filter(Array.isArray),[[height,height],[tip-499,tip]]);assert.equal(calls.filter(x=>x==='GetTransaction').length,2);
 assert.deepEqual(await page.locator('.demo-tick input').evaluateAll(xs=>xs.map(x=>x.checked)),[false,false]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 for(const width of [320,390,1280])for(const colorScheme of ['light','dark']){await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${engine}-${width}-${colorScheme}.png`,fullPage:true});}}
 fail=true;await look.click();await page.getByText('Could not reach the server. Nothing was checked.',{exact:true}).waitFor();assert.equal(await example.count(),0);fail=false;
 calls.length=0;hold=true;waiting=new Promise(r=>release=r);const seen=new Promise(r=>asked=r);await look.click();await seen;await page.getByRole('button',{name:'Stop looking',exact:true}).click();hold=false;release();await page.waitForTimeout(100);assert.equal(calls.filter(x=>typeof x==='string').length,2);assert.equal(await example.count(),0);assert.match(await page.locator('.pay-find [role=status]').innerText(),/Stopped/);
 assert.deepEqual(errors,[]);console.log(engine+' demo fixed example PASS');await ctx.close();
 }finally{await browser.close();}
}
