import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTab } from '../src/tab.ts';
import { encodeTable, readTableRoute, type TableLink } from '../src/table-link.ts';
import { followupText } from '../src/organiser-followup.ts';

function dinner(): TableLink {
  const tab = makeTab({createdAt:'2026-10-15T18:00:00Z',from:'Lena',label:'Dinner',
    payee:'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez',
    itemized:true,fiat:'USD',total:'90.00',ownShare:'30.00',people:[{name:'Ana',amount:'20.00'},{name:'Ana',amount:'40.00'},{name:'Ben',amount:'0.00'}],
    rate:{fiatPerZec:'100',source:'Manual entry',observedAt:'2026-10-15T18:00:00Z'}});
  assert.equal(tab.kind,'tab'); if(tab.kind!=='tab') throw Error('fixture');
  const encoded=encodeTable(tab.rows.map(row=>row.fragment),tab.zeroPeople);
  assert.equal(encoded.kind,'fragment');if(encoded.kind!=='fragment') throw Error('fixture');
  const route=readTableRoute(encoded.fragment);assert.equal(route.kind,'table-route');
  if(route.kind!=='table-route') throw Error('fixture'); return route.table;
}

test('follow-up includes only unticked positions with their exact individual links',()=>{
  const table=dinner();const text=followupText(table,[true,false],'https://ztab.example/');
  assert.ok(text.includes('2. Ana — $40.00 · 0.4 ZEC'));
  assert.ok(text.includes('https://ztab.example/#'+table.rows[1].fragment));
  assert.ok(!text.includes(table.rows[0].fragment));
  assert.ok(!text.includes('1. Ana'));assert.ok(!text.includes('Ben'));
  assert.ok(!text.includes('/mine'));assert.ok(!text.includes('#g'));
  assert.match(text,/Testnet: not real ZEC/);
  assert.match(text,/does not confirm whether a payment was made/);
  assert.match(text,/already paid.*before paying again/);
});

test('unticking restores a share, and an all-ticked record produces no reminder',()=>{
  const table=dinner();assert.equal(followupText(table,[true,true],'https://ztab.example/'),'');
  const text=followupText(table,[false,true],'https://ztab.example/');
  assert.match(text,/1\. Ana — \$20\.00 · 0\.2 ZEC/);
  assert.ok(text.includes(table.rows[0].fragment));assert.ok(!text.includes(table.rows[1].fragment));
});

test('only the site path goes into a copied link, never query parameters or the organiser fragment',()=>{
  const table=dinner();const text=followupText(table,[false,true],'https://ztab.example/app/?secret=private#mine/10');
  assert.ok(text.includes('https://ztab.example/app/#'+table.rows[0].fragment));
  assert.ok(!text.includes('secret'));assert.ok(!text.includes('private'));assert.ok(!text.includes('mine/10'));
});

test('network labels distinguish testnet, regtest and mainnet without implying a payment check',()=>{
  for(const network of ['main','test','regtest'] as const){
    const table=dinner();table.rows.forEach(row=>row.share.network=network);
    const text=followupText(table,[false,false],'https://ztab.example/');
    assert.equal(text.includes('Testnet: not real ZEC'),network==='test');
    assert.equal(text.includes('Regtest: not real ZEC'),network==='regtest');
    assert.match(text,/organiser's own record/);
  }
});
