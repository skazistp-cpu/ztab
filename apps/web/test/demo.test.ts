import test from 'node:test';
import assert from 'node:assert/strict';
import { readDemoReceiver, readDemoSession, makeDemo } from '../src/demo.ts';
import { requestFor } from '../src/pay.ts';
const address='utest15hp9z4fcu73cfr9znmv6z4yxngs74frl9meqpwva0nsvxqth6meyr3jw7e893axe7r24le3uaws8kwqkcka7qw9zfas0el5vkgll2rfm';
const config={version:1,network:'test',address,viewingKey:'uviewtest1'+'q'.repeat(200),birthday:4489000};
const fragment='demo/1791748800000/1234567890abcdef/10';
test('a demo receiver must be testnet unified and cannot contain a spending key',()=>{
 assert.deepEqual(readDemoReceiver(config),config);
 for(const change of [{network:'main'},{version:2},{address:'t1bad'},{viewingKey:'usk1secret'},{viewingKey:'uview1'+'q'.repeat(200)},{birthday:-1},{viewingKey:'uviewtest1'+'q'.repeat(3000)}]) assert.equal(readDemoReceiver({...config,...change}),undefined);
});
test('a saved demo session preserves its date, identifier and manual marks',()=>{
 assert.deepEqual(readDemoSession(fragment),{createdAt:'2026-10-11T20:00:00.000Z',id:'1234567890abcdef',marks:[true,false]});
 for(const bad of ['demo/NaN/1234567890abcdef/00','demo/1791748800000/bad/00',fragment+'/x',fragment.slice(0,-2)+'111','demo/1/1234567890abcdef/00']) assert.equal(readDemoSession(bad),undefined);
});
test('sample shares use the existing item arithmetic and rebuild ordinary testnet requests',()=>{
 const receiver=readDemoReceiver(config)!;const session=readDemoSession(fragment)!;const demo=makeDemo(receiver,session);
 assert.equal(demo.tab.total,'78.65');assert.equal(demo.tab.own.fiatShare,'10.28');
 assert.deepEqual(demo.table.rows.map(r=>[r.share.name,r.share.fiatShare,r.share.zatoshis]),[['Ana','45.46','4546000'],['Ben','22.91','2291000']]);
 const req=requestFor(demo.table.rows[0].share);assert.equal(req.kind,'request');if(req.kind!=='request')return;
 assert.equal(req.memo,'Demo 1234567890abcdef · Ana · $45.46 · 11 Oct 2026 · Ztab');
 assert.ok(req.uri.startsWith('zcash:'+address));assert.equal(demo.table.rows[0].share.network,'test');
 assert.equal(demo.table.rows[0].share.rate.source,'Demo example, not a market rate');
 const later=makeDemo(receiver,{...session,id:'fedcba0987654321'});
 assert.notEqual(requestFor(later.table.rows[0].share),req);
 const laterReq=requestFor(later.table.rows[0].share);assert.equal(laterReq.kind,'request');if(laterReq.kind==='request')assert.notEqual(laterReq.memo,req.memo);
});

test('a saved session binds to its sample receiver when one has been loaded',()=>{
 const bound=readDemoSession(fragment+'/0123456789abcdef0123456789abcdef');assert.equal(bound?.receiver,'0123456789abcdef0123456789abcdef');
 assert.equal(readDemoSession(fragment+'/short'),undefined);
});
