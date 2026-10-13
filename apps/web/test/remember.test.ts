import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressEnds, forget, look, recall, remember, REMEMBER_KEY, storeOf } from '../src/remember.ts';

const fakeStore = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
const ADDRESS = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';

test('nothing is kept until something is remembered', () => {
  const store = fakeStore();
  assert.equal(recall(store), undefined);
  assert.equal(store.data.size, 0);
});

test('an address and names come back as they were remembered', () => {
  const store = fakeStore();
  assert.equal(remember(ADDRESS, ['Ana', 'Ben'], store), true);
  assert.deepEqual(recall(store), { address: ADDRESS, names: ['Ana', 'Ben'] });
  assert.deepEqual([...store.data.keys()], [REMEMBER_KEY]);
});

test('new names go first, and a name is kept once whatever its capitals', () => {
  const store = fakeStore();
  remember(ADDRESS, ['Ana', 'Ben'], store);
  remember(ADDRESS, [' carla ', 'ana', ''], store);
  assert.deepEqual(recall(store)?.names, ['carla', 'ana', 'Ben']);
});

test('at most thirty names are kept, each cut to forty characters', () => {
  const store = fakeStore();
  remember(ADDRESS, Array.from({ length: 40 }, (_, i) => `Person ${i}`), store);
  assert.equal(recall(store)?.names.length, 30);
  remember(ADDRESS, ['x'.repeat(60)], store);
  assert.equal(recall(store)?.names[0].length, 40);
});

test('forget leaves the storage empty', () => {
  const store = fakeStore();
  remember(ADDRESS, ['Ana'], store);
  assert.equal(forget(store), true);
  assert.equal(recall(store), undefined);
  assert.equal(store.data.size, 0);
});

test('forget says no when the browser refuses to remove, and the record is still there', () => {
  const store = fakeStore();
  remember(ADDRESS, ['Ana'], store);
  const stuck = { ...store, removeItem: () => { throw new Error('denied'); } };
  assert.equal(forget(stuck), false);
  assert.deepEqual(recall(stuck), { address: ADDRESS, names: ['Ana'] });
});

test('forget says no when removing did nothing', () => {
  const store = fakeStore();
  remember(ADDRESS, ['Ana'], store);
  const deaf = { ...store, removeItem: () => undefined };
  assert.equal(forget(deaf), false);
  assert.deepEqual(recall(deaf)?.names, ['Ana']);
});

test('a refused update says no and leaves the earlier record as it was', () => {
  const store = fakeStore();
  remember(ADDRESS, ['Ana'], store);
  const full = { ...store, setItem: () => { throw new Error('quota'); } };
  assert.equal(remember('u1other', ['Ben'], full), false);
  assert.deepEqual(recall(full), { address: ADDRESS, names: ['Ana'] });
});

test('an empty address is not remembered', () => {
  const store = fakeStore();
  assert.equal(remember('', ['Ana'], store), false);
  assert.equal(store.data.size, 0);
});

test('what cannot be read counts as nothing', () => {
  for (const raw of ['not json', '[]', '"text"', '{"address":5}', '{"address":"has space"}', `{"address":"${'a'.repeat(600)}"}`]) {
    const store = fakeStore();
    store.data.set(REMEMBER_KEY, raw);
    assert.equal(recall(store), undefined, raw);
  }
  const odd = fakeStore();
  odd.data.set(REMEMBER_KEY, JSON.stringify({ address: ADDRESS, names: ['Ana', 7, null, 'Ben'] }));
  assert.deepEqual(recall(odd)?.names, ['Ana', 'Ben']);
});

test('a storage that refuses does not break the page', () => {
  const refusing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.equal(recall(refusing), undefined);
  assert.equal(remember(ADDRESS, ['Ana'], refusing), false);
  assert.equal(forget(refusing), false);
});

test('the two ends of an address', () => {
  assert.equal(addressEnds(ADDRESS), 'ztestsap…fska2kez');
  assert.equal(addressEnds('short'), 'short');
});

test('look tells nothing, a record, something unreadable and a refused read apart', () => {
  const store = fakeStore();
  assert.deepEqual(look(store), { kind: 'none' });
  remember(ADDRESS, ['Ana'], store);
  assert.deepEqual(look(store), { kind: 'kept', record: { address: ADDRESS, names: ['Ana'] } });
  store.data.set(REMEMBER_KEY, 'not json');
  assert.deepEqual(look(store), { kind: 'unreadable' });
  store.data.set(REMEMBER_KEY, '{"address":""}');
  assert.deepEqual(look(store), { kind: 'unreadable' });
  const blind = { ...store, getItem: () => { throw new Error('denied'); } };
  assert.deepEqual(look(blind), { kind: 'unknown' });
});

test('a refused read is not taken as proof that nothing is kept', () => {
  const store = fakeStore();
  remember(ADDRESS, ['Ana'], store);
  const blind = { ...store, getItem: () => { throw new Error('denied'); } };
  assert.equal(look(blind).kind, 'unknown');
  assert.equal(forget(blind), false);
  assert.equal(store.data.has(REMEMBER_KEY), false, 'the removal itself went through');
  const stuckAndBlind = { ...blind, removeItem: () => { throw new Error('denied'); } };
  assert.equal(forget(stuckAndBlind), false);
});

test('a browser with no storage at all keeps nothing', () => {
  const none = storeOf({});
  assert.equal(none, null);
  assert.deepEqual(look(none), { kind: 'none' });
  assert.equal(remember(ADDRESS, ['Ana'], none), false);
  assert.equal(forget(none), true);
});

test('a refused localStorage getter is unknown, never empty, with a record behind it', () => {
  const real = fakeStore();
  remember(ADDRESS, ['Ana'], real);
  const page = {
    get localStorage(): never {
      throw new Error('SecurityError');
    },
  };
  const refused = storeOf(page);
  assert.deepEqual(look(refused), { kind: 'unknown' });
  assert.equal(recall(refused), undefined);
  assert.equal(forget(refused), false);
  assert.equal(remember(ADDRESS, ['Ben'], refused), false);
  // The record is untouched and is found again once the browser allows it.
  assert.deepEqual(look(storeOf({ localStorage: real })), { kind: 'kept', record: { address: ADDRESS, names: ['Ana'] } });
});

test('forget is confirmed by reading, also when the removal itself threw', () => {
  const empty = fakeStore();
  const throwsOnRemove = { ...empty, removeItem: () => { throw new Error('denied'); } };
  assert.equal(forget(throwsOnRemove), true, 'nothing was there, and a read confirmed it');
});
