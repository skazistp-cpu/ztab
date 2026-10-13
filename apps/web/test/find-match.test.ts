import test from 'node:test';
import assert from 'node:assert/strict';
import { sortFound, type Asked, type FoundNote } from '../src/find/match.ts';

const memo = (name: string, amount = '$45.46'): string => `Dinner, Friday · ${name} · ${amount} · 11 Oct 2026 · Ztab`;
const asked: Asked[] = [
  { name: 'Ana', zatoshis: '3679169', memo: memo('Ana') },
  { name: 'Ben', zatoshis: '1854153', memo: memo('Ben', '$22.91') },
  { name: 'Ana', zatoshis: '3679169', memo: memo('Ana') },
  { name: 'Cy', zatoshis: '100' },
];
const note = (zatoshis: string, text: string | null, txid = 'aa'): FoundNote => ({ txid, zatoshis, memo: text });
const fits = (notes: FoundNote[]) => sortFound(asked, notes).fits.map(f => [f.note.txid, f.people.map(p => `${p.index}${p.amount ? '=' : '≠'}`).join(' ')]);

test('note and amount both equal: that person, amount matching', () => {
  assert.deepEqual(fits([note('1854153', memo('Ben', '$22.91'))]), [['aa', '1=']]);
});

test('two people with one name and one share stay separate, by position, under one payment', () => {
  assert.deepEqual(fits([note('3679169', memo('Ana'))]), [['aa', '0= 2=']]);
});

test('the right note with another amount is that person’s, marked as differing', () => {
  assert.deepEqual(fits([note('1854152', memo('Ben', '$22.91'))]), [['aa', '1≠']]);
});

test('payments whose note is not in this tab are the others, never a fit', () => {
  const strangers = [note('3679169', null), note('3679169', 'Rent'), note('3679169', memo('Ana').toLowerCase()), note('3679169', ` ${memo('Ana')}`), note('100', '')];
  const sorted = sortFound(asked, strangers);
  assert.deepEqual(sorted.fits, []);
  assert.deepEqual(sorted.others, strangers);
});

test('a request without a note is never matched by amount alone', () => {
  assert.deepEqual(sortFound([{ name: 'Cy', zatoshis: '100' }], [note('100', null), note('100', '')]).fits, []);
});

test('the same request paid twice gives two payments, each on its own', () => {
  assert.deepEqual(fits([note('1854153', memo('Ben', '$22.91'), 'aa'), note('1854153', memo('Ben', '$22.91'), 'bb')]), [['aa', '1='], ['bb', '1=']]);
});
