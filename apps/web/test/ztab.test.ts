import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeShare,encodeShare,tabMemoTemplate,expandMemo,type ShareLink} from '../../../packages/engine/src/index.ts';
import {requestFor} from '../src/pay.ts';
import {encodeTable,decodeTable} from '../src/table-link.ts';
const s:ShareLink={network:'test',payee:'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez',label:'Dinner',name:'Ana',from:'Miro',fiatShare:'10.00',zatoshis:'1000000',rate:{fiat:'USD',fiatPerZec:'1000',source:'Manual',observedAt:'2026-10-10T00:00:00Z'},createdAt:'2026-10-10T00:00:00Z'};
test('new Ztab memo and link preserve the request across reload and table envelope',()=>{
 assert.equal(expandMemo(tabMemoTemplate('Dinner'),'Ana','10.00','USD',s.createdAt),'Dinner · Ana · $10.00 · 10 Oct 2026 · Ztab');
 const e=encodeShare({...s,memoBrand:'Ztab'});assert.equal(e.kind,'fragment');if(e.kind!=='fragment')return;
 assert.match(e.fragment,/^s3\./);const d=decodeShare(e.fragment);assert.equal(d.kind,'share');if(d.kind!=='share')return;
 const r=requestFor(d.share);assert.equal(r.kind,'request');if(r.kind==='request')assert.match(r.memo!,/ · Ztab$/);
 const g=encodeTable([e.fragment],[]);assert.equal(g.kind,'fragment');if(g.kind!=='fragment')return;assert.match(g.fragment,/^g2\./);
 const t=decodeTable(g.fragment);assert.equal(t.kind,'table');if(t.kind==='table')assert.deepEqual(requestFor(t.rows[0].share),r);
});
test('old s1, s2 and g1 keep their exact old notes',()=>{
 for(const modern of [false,true]){
  const e=encodeShare(modern?s:{...s,createdAt:undefined});assert.equal(e.kind,'fragment');if(e.kind!=='fragment')continue;
  assert.match(e.fragment,modern?/^s2\./:/^s1\./);const d=decodeShare(e.fragment);if(d.kind!=='share')assert.fail('decode');
  const r=requestFor(d.share);if(r.kind!=='request')assert.fail('request');
  assert.equal(r.memo,modern?'Dinner · Ana · $10.00 · 10 Oct 2026 · Tab':'Dinner · Ana');
  const g=encodeTable([e.fragment],[]);if(g.kind!=='fragment')assert.fail('table');assert.match(g.fragment,/^g1\./);
  const t=decodeTable(g.fragment);if(t.kind!=='table')assert.fail('table decode');assert.deepEqual(requestFor(t.rows[0].share),r);
 }
});
test('new memo version cannot omit its date, spoof a brand or mix with old table notes',()=>{
 assert.equal(encodeShare({...s,createdAt:undefined,memoBrand:'Ztab'}).kind,'error');
 assert.equal(encodeShare({...s,memoBrand:'Other'} as unknown as ShareLink).kind,'error');
 const old=encodeShare(s),fresh=encodeShare({...s,memoBrand:'Ztab'});if(old.kind!=='fragment'||fresh.kind!=='fragment')assert.fail('fixtures');
 assert.equal(encodeTable([old.fragment,fresh.fragment],[]).kind,'error');
});
