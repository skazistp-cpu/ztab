import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTab, type TabForm } from '../src/tab.ts';
import { splitItems } from '../src/items.ts';
import { decodeShare, parseUri } from '../../../packages/engine/src/index.ts';

const form: TabForm = {
  createdAt:'2026-10-10T12:00:00Z', from:'Ana', label:'Dinner',
  payee:'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez',
  fiat:'USD', total:'71', ownShare:'46', people:[{name:'Ben',amount:'25'}],
  rate:{fiatPerZec:'100',source:'Manual entry',observedAt:'2026-10-10T12:00:00Z'},
};

test('item totals become the exact wallet amount and memo, with no request for a zero share', () => {
  const result = splitItems(['you','p1','p2'],[
    {name:'Steak',amount:'32',people:['you']},
    {name:'Salad',amount:'11',people:['p1']},
    {name:'Wine',amount:'28',people:['you','p1']},
  ],'10');
  assert.equal(result.kind,'split'); if(result.kind!=='split') return;
  const tab=makeTab({...form,itemized:true,total:result.total,ownShare:result.shares[0].total,
    people:[{name:'Ben',amount:result.shares[1].total},{name:'Carla',amount:result.shares[2].total}]});
  assert.equal(tab.kind,'tab'); if(tab.kind!=='tab') return;
  assert.equal(tab.own.fiatShare,'50.60');
  assert.equal(tab.paidBack,'27.50');
  assert.deepEqual(tab.zeroPeople,['Carla']);
  assert.equal(tab.rows.length,1);
  const row=tab.rows[0];
  assert.equal(row.zec,'0.275');
  const request=parseUri(row.uri,'test');
  assert.equal(request.kind,'request'); if(request.kind!=='request') return;
  assert.equal(Buffer.from(request.payments[0].memoBase64Url!,'base64url').toString('utf8'),'Dinner · Ben · $27.50 · 10 Oct 2026 · Ztab');
  const link=decodeShare(row.fragment); assert.equal(link.kind,'share');
  if(link.kind==='share') assert.equal(link.share.fiatShare,'27.50');
});

test('organiser can pay the bill without having any items', () => {
  const tab=makeTab({...form,itemized:true,total:'20',ownShare:'0',people:[{name:'Ben',amount:'20'}]});
  assert.equal(tab.kind,'tab');if(tab.kind!=='tab') return;
  assert.deepEqual(tab.own,{fiatShare:'0.00',zec:'0',fixed:true});
  assert.equal(tab.paidBack,'20.00');assert.equal(tab.rows[0].name,'Ben');
});

test('only organiser owes: no payment links are generated', () => {
  const tab=makeTab({...form,itemized:true,total:'20',ownShare:'20',people:[{name:'Ben',amount:'0'}]});
  assert.equal(tab.kind,'tab');if(tab.kind!=='tab') return;
  assert.equal(tab.paidBack,'0.00');assert.deepEqual(tab.rows,[]);
});

test('item mode never falls back to equally splitting an unspecified amount', () => {
  const tab=makeTab({...form,itemized:true,ownShare:''});
  assert.equal(tab.kind,'error');
});

test('zero remains invalid in the original fixed/equal mode', () => {
  assert.equal(makeTab({...form,ownShare:'0'}).kind,'error');
});
