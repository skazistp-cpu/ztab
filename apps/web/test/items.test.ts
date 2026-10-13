import test from 'node:test';
import assert from 'node:assert/strict';
import { splitItems, type BillItem } from '../src/items.ts';

const dinner = [
  { name: 'Steak', amount: '32', people: ['ana'] },
  { name: 'Salad', amount: '11', people: ['ben'] },
  { name: 'Wine', amount: '28', people: ['ana', 'ben'] },
];

test('assigns an uneven dinner and apportions its tip: 50.60 + 27.50 = 78.10', () => {
  const r = splitItems(['ana', 'ben'], dinner, '10');
  assert.equal(r.kind, 'split');
  if (r.kind !== 'split') return;
  assert.deepEqual([r.subtotal, r.tip, r.total], ['71.00', '7.10', '78.10']);
  assert.deepEqual(r.shares, [
    { id: 'ana', subtotal: '46.00', tip: '4.60', total: '50.60' },
    { id: 'ben', subtotal: '25.00', tip: '2.50', total: '27.50' },
  ]);
});

test('odd cents follow participant order, not the order the checkboxes were ticked', () => {
  const r = splitItems(['a', 'b', 'c'], [{ name: '', amount: '10', people: ['c', 'a', 'b'] }], '10');
  assert.equal(r.kind, 'split');
  if (r.kind !== 'split') return;
  assert.deepEqual(r.shares.map(x => [x.subtotal, x.tip, x.total]), [
    ['3.34', '0.34', '3.68'], ['3.33', '0.33', '3.66'], ['3.33', '0.33', '3.66'],
  ]);
  assert.equal(r.total, '11.00');
});

test('tip is rounded once, half up, then allocated by largest remainder', () => {
  const r = splitItems(['a', 'b'], [{ name: '', amount: '0.05', people: ['a', 'b'] }], '10');
  assert.equal(r.kind, 'split');
  if (r.kind !== 'split') return;
  assert.deepEqual([r.tip, r.total, ...r.shares.map(x => x.total)], ['0.01', '0.06', '0.04', '0.02']);
});

test('a person with no items owes zero and contributes no tip', () => {
  const r = splitItems(['you', 'a'], [{ name: '', amount: '20', people: ['a'] }], '12.5');
  assert.equal(r.kind, 'split');
  if (r.kind !== 'split') return;
  assert.deepEqual(r.shares.map(x => x.total), ['0.00', '22.50']);
});

const invalidCases: Array<[string, string[], BillItem[], string, string]> = [
  ['no items', ['a','b'], [], '', 'items'],
  ['unassigned item', ['a','b'], [{ name:'Wine', amount:'28', people:[] }], '', 'assignment'],
  ['removed person', ['a','c'], [{ name:'Wine', amount:'28', people:['b'] }], '', 'assignment'],
  ['duplicate assignment', ['a','b'], [{ name:'Wine', amount:'28', people:['a','a'] }], '', 'assignment'],
  ['duplicate person', ['a','a'], dinner, '', 'people'],
  ...['', '-1','0','1.001','1e2','Infinity','10,00'].map((x): [string, string[], BillItem[], string, string] => [`bad amount ${x}`, ['a','b'], [{name:'Food', amount:x, people:['a']}], '', 'amount']),
  ...['-1','101','10.001','1e2','Infinity'].map((x): [string, string[], BillItem[], string, string] => [`bad tip ${x}`, ['a','b'], [{name:'Food', amount:'1', people:['a']}], x, 'tip']),
  ['too large with tip', ['a','b'], [{name:'Food', amount:'10000000000', people:['a']}], '1', 'total'],
];
for (const [name, people, items, tip, field] of invalidCases) {
  test(`refuses ${name} with a field target`, () => {
    const r = splitItems([...people], items.map(item => ({...item, people: [...item.people]})), tip);
    assert.equal(r.kind, 'error');
    if (r.kind === 'error') assert.equal(r.field, field);
  });
}

test('a bill made of tiny shared items conserves every cent across 2–10 people', () => {
  const cents = (s: string) => BigInt(s.replace('.', ''));
  for (let n = 2; n <= 10; n++) {
    const ids = Array.from({length:n}, (_,i) => `p${i}`);
    for (const tip of ['0', '7.25', '12.5', '100']) {
      const items = Array.from({length:17}, (_,i) => ({name:'',amount:`0.${String(i+1).padStart(2,'0')}`,people:ids.filter((_,j) => (i+j)%2===0)}));
      const r = splitItems(ids, items, tip);
      assert.equal(r.kind, 'split');
      if (r.kind !== 'split') continue;
      assert.equal(r.shares.reduce((s,x) => s+cents(x.total),0n), cents(r.total));
      assert.equal(r.shares.reduce((s,x) => s+cents(x.tip),0n), cents(r.tip));
      assert.equal(cents(r.subtotal)+cents(r.tip),cents(r.total));
      assert.deepEqual(splitItems(ids,items,tip),r);
    }
  }
});
