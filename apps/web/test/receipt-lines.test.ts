import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptLines, confirmedItems} from '../src/receipt-lines.ts';

test('keeps every nonempty OCR line for review and suggests only a trailing price',()=>{
 const r=receiptLines('SHOP\r\nSteak 32.00\nSalát 11,50\nWine 28\nTOTAL 71.50\n');
 assert.equal(r.kind,'rows'); if(r.kind!=='rows') return;
 assert.equal(r.rows.length,5);
 assert.deepEqual(r.rows.map(x=>[x.name,x.amount]),[['SHOP',''],['Steak','32.00'],['Salát','11.50'],['Wine','28.00'],['TOTAL','71.50']]);
 assert.equal(r.rows[4].caution,true);
 assert.ok(r.rows.every(x=>x.selected===false));
});
test('does not silently fix ambiguous prices, dates or unit arithmetic',()=>{
 const r=receiptLines('Wine 1,250.00\n2 x 4.00 8.00\n10/10/2026\nTax 4.50\nChange 2.00');
 assert.equal(r.kind,'rows');if(r.kind!=='rows')return;
 assert.deepEqual(r.rows.slice(0,3).map(x=>x.amount),['','','']);
 assert.equal(r.rows[3].caution,true);assert.equal(r.rows[4].caution,true);
});
test('refuses oversized OCR without truncating away hidden lines',()=>{
 assert.equal(receiptLines('a'.repeat(20001)).kind,'error');
 assert.equal(receiptLines(Array(201).fill('Tea 2.00').join('\n')).kind,'error');
});
test('confirmation is atomic, validates all chosen rows, respects capacity and never assigns people',()=>{
 assert.deepEqual(confirmedItems([{selected:true,name:'Tea',amount:'2.00'}],99),{kind:'items',items:[{name:'Tea',amount:'2.00'}]});
 assert.equal(confirmedItems([{selected:true,name:'Tea',amount:'2.00'},{selected:true,name:'Cake',amount:'no'}],0).kind,'error');
 assert.equal(confirmedItems([{selected:true,name:'Tea',amount:'2.00'}],100).kind,'error');
 assert.equal(confirmedItems([{selected:true,name:'',amount:'2.00'}],0).kind,'error');
 assert.equal(confirmedItems([{selected:true,name:'Tea',amount:'0.00'}],0).kind,'error');
 assert.equal(confirmedItems([{selected:true,name:'Tea',amount:'10000000001.00'}],0).kind,'error');
 assert.deepEqual(confirmedItems([{selected:false,name:'Total',amount:'100'}],0),{kind:'items',items:[]});
});
