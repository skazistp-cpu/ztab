import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTab, type TabForm } from '../src/tab.ts';
import { encodeTable, mineFragment, readTableRoute } from '../src/table-link.ts';

const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const form: TabForm = {
  createdAt: '2026-10-10T19:00:00Z',
  from: 'Lena',
  label: 'Dinner, Friday',
  payee: address,
  fiat: 'USD',
  total: '300.00',
  ownShare: '',
  people: [{ name: 'Ana', amount: '' }, { name: 'Ben', amount: '' }, { name: 'Ana', amount: '' }],
  rate: { fiatPerZec: '1000', source: 'Manual entry', observedAt: '2026-10-10T18:59:00Z' },
};
const tableFragment = (): string => {
  const tab = makeTab(form);
  assert.equal(tab.kind, 'tab');
  if (tab.kind !== 'tab') throw new Error('no tab');
  const encoded = encodeTable(tab.rows.map(row => row.fragment), tab.zeroPeople);
  assert.equal(encoded.kind, 'fragment');
  if (encoded.kind !== 'fragment') throw new Error('no table');
  return encoded.fragment;
};

test("the organiser's page opens with no ticks, and with one mark for each paying row", () => {
  const fragment = tableFragment();
  const fresh = readTableRoute(`${fragment}/mine`);
  assert.equal(fresh.kind, 'table-route');
  if (fresh.kind !== 'table-route' || fresh.view !== 'mine') throw new Error('not the organiser page');
  assert.deepEqual(fresh.ticks, [false, false, false]);
  const some = readTableRoute(`${fragment}/mine/101`);
  if (some.kind !== 'table-route' || some.view !== 'mine') throw new Error('not the organiser page');
  assert.deepEqual(some.ticks, [true, false, true]);
  assert.equal(some.table.rows.length, 3);
});

test('ticks are by position, so two people with one name keep separate marks', () => {
  const fragment = tableFragment();
  const route = readTableRoute(`${fragment}/mine/100`);
  if (route.kind !== 'table-route' || route.view !== 'mine') throw new Error('not the organiser page');
  assert.deepEqual(route.table.rows.map(row => row.share.name), ['Ana', 'Ben', 'Ana']);
  assert.deepEqual(route.ticks, [true, false, false]);
});

test('ticks of the wrong length or shape are a broken link, not a guess', () => {
  const fragment = tableFragment();
  for (const suffix of ['/mine/', '/mine/1', '/mine/10', '/mine/1010', '/mine/abc', '/mine/1x1', '/mine/101/0', '/mine/2 1', '/Mine', '/mine/١٠١']) {
    assert.equal(readTableRoute(fragment + suffix).kind, 'error', suffix);
  }
});

test('ticks are not accepted on any other table route', () => {
  const fragment = tableFragment();
  for (const suffix of ['/qr/101', '/0/101', '/1/1']) {
    assert.equal(readTableRoute(fragment + suffix).kind, 'error', suffix);
  }
});

test("the page's fragment carries the ticks and reads back the same", () => {
  const fragment = tableFragment();
  assert.equal(mineFragment(fragment, [false, false, false]), `${fragment}/mine`);
  assert.equal(mineFragment(fragment, []), `${fragment}/mine`);
  const written = mineFragment(fragment, [false, true, true]);
  assert.equal(written, `${fragment}/mine/011`);
  const back = readTableRoute(written);
  if (back.kind !== 'table-route' || back.view !== 'mine') throw new Error('not the organiser page');
  assert.deepEqual(back.ticks, [false, true, true]);
});

test('the ticks change nothing in any share or payment link', () => {
  const fragment = tableFragment();
  const plain = readTableRoute(fragment);
  const ticked = readTableRoute(`${fragment}/mine/111`);
  if (plain.kind !== 'table-route' || ticked.kind !== 'table-route') throw new Error('no route');
  assert.deepEqual(ticked.table.rows.map(row => row.fragment), plain.table.rows.map(row => row.fragment));
});
