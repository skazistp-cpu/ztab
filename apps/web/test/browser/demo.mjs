import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.TAB_ORIGIN||'http://127.0.0.1:8776';
const vector=JSON.parse(readFileSync(new URL('../fixtures/finder-vector.json',import.meta.url),'utf8'));
const config={version:1,network:'test',address:'utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm',viewingKey:vector.key,birthday:4489000};
for(const name of (process.env.BROWSERS||'chromium,webkit').split(',')){
 const browser=await pw[name].launch();try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await ctx.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/demo-receiver.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)}));
 await page.goto(origin);await page.locator('#app h1:visible').waitFor();await page.evaluate(()=>document.fonts.ready);assert.equal(requests.length,6,'ordinary visit loads its six files: the page, a script, a stylesheet, two fonts (Geist and Inter) and the picture of the dinner');assert.ok(!requests.some(u=>/demo-|wire-|wasm/.test(u)));
 // The landing page offers the sample by one plain link; following it is an ordinary navigation.
 // Its ribbons are laid out for a new width on the next frames, so each width is checked once they are.
 const sample=page.getByRole('link',{name:'Try a sample dinner',exact:true}).first();assert.equal(await sample.getAttribute('href'),'/?demo');
 assert.equal(await page.locator('.landing p:has(> a[href$="?demo"])').first().innerText(),'Try a sample dinner on Zcash’s test network, with test coins only.');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: landing no overflow`);const box=await sample.boundingBox();assert.ok(box.y+box.height<844,`${width}: sample link on the first screen`);}
 await page.setViewportSize({width:390,height:844});if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}-landing-390.png`});}
 await sample.click();await page.getByRole('button',{name:'Load sample dinner',exact:true}).waitFor({timeout:4000});assert.match(page.url(),/\/\?demo#demo\//);
 await page.goto(origin+'/?demo');await page.getByRole('button',{name:'Load sample dinner',exact:true}).waitFor({timeout:4000});
 const session=page.url();assert.match(session,/#demo\/\d{13}\/[a-f0-9]{16}\/00$/);
 assert.ok(!requests.some(u=>/demo-receiver|wire-|wasm/.test(u)));
 await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();await page.getByRole('heading',{name:'Pay a sample share'}).waitFor();
 assert.ok(!requests.some(u=>/wire-|wasm/.test(u)));assert.equal(await page.locator('a[href^="zcash:"]').count(),2);
 const memo=await page.locator('.demo-memo').first().innerText();assert.match(memo,/Demo [a-f0-9]{16} · Ana · \$45.46 · /);
 await page.getByRole('button',{name:'Use the public demo key',exact:true}).click();assert.equal(await page.getByLabel('Viewing key',{exact:true}).inputValue(),vector.key);
 assert.ok(!requests.some(u=>/wire-|wasm/.test(u)));
 await page.getByLabel('I checked Ana’s test payment',{exact:true}).check();assert.match(page.url(),/\/10\/[a-f0-9]{32}$/);
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 await page.reload();await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();await page.getByRole('heading',{name:'Pay a sample share'}).waitFor();
 assert.equal(await page.getByLabel('I checked Ana’s test payment',{exact:true}).isChecked(),true);assert.equal(await page.getByLabel('Viewing key',{exact:true}).inputValue(),'');assert.equal(await page.locator('.demo-memo').first().innerText(),memo);
 for(const width of [320,390,1280])for(const colorScheme of ['light','dark']){await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${colorScheme} overflow`);if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/${name}-${width}-${colorScheme}.png`,fullPage:true});}}
 await page.getByRole('link',{name:'Make your own bill',exact:true}).click();await page.locator('#app h1:visible').waitFor();assert.ok(!page.url().includes('?demo'));assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(origin)));
 await ctx.route('**/demo-receiver.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...config,network:'main'})}));
 await page.goto(session);await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();await page.getByText('The sample receiver is unavailable. Try again later.').waitFor();assert.equal(await page.locator('a[href^="zcash:"]').count(),0);
 // A previously saved demo refuses a receiver rotation instead of changing its payee.
 await ctx.route('**/demo-receiver.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)}));
 await page.goto(session);await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();await page.getByRole('heading',{name:'Pay a sample share'}).waitFor();
 const bound=page.url();await page.goto(bound.slice(0,-32)+'0'.repeat(32));await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();
 await page.getByText('This demo used an older sample receiver. Start a new demo instead of changing its payment requests.').waitFor();assert.equal(await page.locator('a[href^="zcash:"]').count(),0);
 // A pending configuration response must not restore a demo after a hash navigation.
 let release,asked;const hold=new Promise(r=>release=r),waiting=new Promise(r=>asked=r);
 await ctx.route('**/demo-receiver.json',async r=>{asked();await hold;await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)}).catch(()=>{});});
 await page.goto(session);await page.getByRole('button',{name:'Load sample dinner',exact:true}).click();await waiting;
 await page.evaluate(()=>{history.replaceState(null,'','/');window.dispatchEvent(new HashChangeEvent('hashchange'));});
 await page.locator('#app h1:visible').waitFor();release();await page.waitForTimeout(100);assert.equal(await page.getByRole('heading',{name:'Pay a sample share'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Use the public demo key',exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log(name+' demo PASS');await ctx.close();
 }finally{await browser.close();}
}
