import test from 'node:test';
import assert from 'node:assert/strict';
import {splitItems} from '../src/items.ts';
import {shareExplanation} from '../src/item-breakdown.ts';
const cents=(v:string)=>BigInt(v.replace('.',''));
test('breakdown follows actual odd-cent allocations and tip without recalculating equal shares',()=>{
 const r=splitItems(['you','a','b'],[{name:'Wine',amount:'28',people:['b','you','a']},{name:'Steak',amount:'40',people:['a']}],'10');
 if(r.kind!=='split')assert.fail('split');
 assert.deepEqual(r.allocations[0].shares,[{id:'you',amount:'9.34'},{id:'a',amount:'9.33'},{id:'b',amount:'9.33'}]);
 const text=shareExplanation(r,'a','Ana','USD');
 assert.match(text,/Wine.*\$9\.33.*\$28\.00/);assert.match(text,/Steak.*\$40\.00/);assert.match(text,/Tip \/ service: \$4\.93/);assert.match(text,/Total: \$54\.26/);
 assert.match(shareExplanation(r,'you','You','USD'),/Total: \$10\.28/);
});
test('duplicate names use stable IDs; zero shares and unnamed items remain explainable',()=>{
 const r=splitItems(['you','a','b'],[{name:'',amount:'0.01',people:['you','a']}],'10');if(r.kind!=='split')assert.fail('split');
 assert.match(shareExplanation(r,'you','Ana','CZK'),/Item 1.*0\.01 CZK/);
 assert.match(shareExplanation(r,'a','Ana','CZK'),/Item 1.*0\.00 CZK/);
 assert.match(shareExplanation(r,'b','Ben','CZK'),/No items assigned/);
 assert.throws(()=>shareExplanation(r,'unknown','Nobody','USD'));
});
test('every displayed item allocation sums to each subtotal and each line price across 2-10 people',()=>{
 for(let n=2;n<=10;n++){
  const ids=Array.from({length:n},(_,i)=>'p'+i);
  const items=Array.from({length:17},(_,i)=>({name:'Same name',amount:`0.${String(i+1).padStart(2,'0')}`,people:ids.filter((_,j)=>(i+j)%2===0)}));
  const r=splitItems(ids,items,'12.5');if(r.kind!=='split')assert.fail('split');
  for(const a of r.allocations)assert.equal(a.shares.reduce((s,x)=>s+cents(x.amount),0n),cents(a.price));
  for(const s of r.shares)assert.equal(r.allocations.flatMap(a=>a.shares).filter(x=>x.id===s.id).reduce((v,x)=>v+cents(x.amount),0n),cents(s.subtotal));
 }
});
