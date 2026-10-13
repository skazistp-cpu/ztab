import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUri, parseUri, zatoshisToZec, zecToZatoshis } from '../src/zip321.ts';
import { bech32, bech32m } from '@scure/base';
import { checkAddress } from '../src/address.ts';

// Public example addresses from the ZIP-321 specification.
const T_TEST = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';
const Z_TEST =
  'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';

// Amounts a lenient parser reads as a number. None is in the ZecDev corpus.
for (const amount of ['1,5', '12.5ZEC', '1e2', '1 000', '0x10', '+1', '1.123456789', '1_000', ' 1']) {
  test(`rejects the amount ${JSON.stringify(amount)}`, () => {
    const r = parseUri(`zcash:${Z_TEST}?amount=${amount}`, 'test');
    assert.equal(r.kind, 'error');
    assert.equal(r.kind === 'error' && r.error, 'amountInvalid');
  });
}

test('converts amounts exactly at the edges', () => {
  assert.equal(zecToZatoshis('21000000'), 2_100_000_000_000_000n);
  assert.equal(zecToZatoshis('0.00000001'), 1n);
  assert.equal(zecToZatoshis('0.1'), 10_000_000n);
  assert.equal(zecToZatoshis('0.123456789'), undefined);
  assert.equal(zatoshisToZec(1n), '0.00000001');
  assert.equal(zatoshisToZec(150_000_000n), '1.5');
  assert.equal(zatoshisToZec(100_000_000n), '1');
  assert.equal(zatoshisToZec(0n), '0');
});

test('every built request parses back to what was asked for', () => {
  const memos = [undefined, '', 'Dinner 5 Oct · Ana', 'ünïcödé ✨ 🦄', 'a&b=c?d#e%f+g'];
  const amounts = ['1', '99999999', '100000000', '2100000000000000', '12345678'];
  for (const zatoshis of amounts) {
    for (const memo of memos) {
      const built = buildUri(
        { address: Z_TEST, zatoshis, memo, label: memo, message: memo },
        'test',
      );
      assert.equal(built.kind, 'uri', JSON.stringify(built));
      if (built.kind !== 'uri') return;
      const parsed = parseUri(built.uri, 'test');
      assert.equal(parsed.kind, 'request');
      if (parsed.kind !== 'request') return;
      assert.equal(parsed.payments.length, 1);
      const p = parsed.payments[0];
      assert.equal(p.index, 0);
      assert.equal(p.address, Z_TEST);
      assert.equal(p.zatoshis, zatoshis);
      assert.equal(p.label, memo);
      assert.equal(p.message, memo);
      assert.equal(
        p.memoBase64Url === undefined
          ? undefined
          : Buffer.from(p.memoBase64Url, 'base64url').toString('utf8'),
        memo,
      );
    }
  }
});

test('refuses to build a memo for a transparent recipient', () => {
  const r = buildUri({ address: T_TEST, zatoshis: '1000', memo: 'hi' }, 'test');
  assert.deepEqual(r.kind === 'error' && r.error, 'transparentMemo');
});

test('refuses to build a zero-valued transparent request', () => {
  const r = buildUri({ address: T_TEST, zatoshis: '0' }, 'test');
  assert.deepEqual(r.kind === 'error' && r.error, 'zeroValuedTransparentOutput');
});

test('refuses to build a memo over 512 bytes', () => {
  const r = buildUri({ address: Z_TEST, zatoshis: '1', memo: 'x'.repeat(513) }, 'test');
  assert.deepEqual(r.kind === 'error' && r.error, 'memoBytesError');
  const ok = buildUri({ address: Z_TEST, zatoshis: '1', memo: 'x'.repeat(512) }, 'test');
  assert.equal(ok.kind, 'uri');
});

test('refuses an amount over the supply and a testnet address on mainnet', () => {
  const over = buildUri({ address: Z_TEST, zatoshis: '2100000000000001' }, 'test');
  assert.deepEqual(over.kind === 'error' && over.error, 'amountExceededSupply');
  const wrong = buildUri({ address: Z_TEST, zatoshis: '1' }, 'main');
  assert.deepEqual(wrong.kind === 'error' && wrong.error, 'invalidAddress');
});

test('classifies the specification addresses', () => {
  assert.deepEqual(checkAddress(T_TEST), {
    kind: 'address',
    addressKind: 'transparent',
    network: 'test',
  });
  assert.deepEqual(checkAddress(Z_TEST), {
    kind: 'address',
    addressKind: 'sapling',
    network: 'test',
  });
  assert.equal(checkAddress(Z_TEST.slice(0, -1) + 'q').kind, 'error');
  assert.equal(checkAddress('not-an-address').kind, 'error');
});

test('regtest accepts testnet transparent addresses only', () => {
  assert.equal(parseUri(`zcash:${T_TEST}?amount=1`, 'regtest').kind, 'request');
  const shielded = parseUri(`zcash:${Z_TEST}?amount=1`, 'regtest');
  assert.equal(shielded.kind === 'error' && shielded.error, 'invalidAddress');
  const built = buildUri({ address: Z_TEST, zatoshis: '1' }, 'regtest');
  assert.equal(built.kind === 'error' && built.error, 'invalidAddress');
});


test('a prefix that is only an inherited object key is not an address', () => {
  const payload = bech32.toWords(new Uint8Array(43));
  for (const hrp of ['constructor', 'tostring', 'valueof', '__proto__']) {
    const address = bech32.encode(hrp, payload, 200);
    assert.equal(checkAddress(address).kind, 'error', hrp);
    assert.equal(parseUri(`zcash:${address}?amount=1`).kind, 'error', hrp);
  }
  for (const hrp of ['constructor', 'tostring']) {
    const address = bech32m.encode(hrp, bech32m.toWords(new Uint8Array(61)), 2000);
    assert.equal(checkAddress(address).kind, 'error', hrp);
  }
});

test('a unified address shorter than one shielded receiver is refused', () => {
  const unified = (bytes: number): string =>
    bech32m.encode('u', bech32m.toWords(new Uint8Array(bytes)), 2000);
  for (const bytes of [0, 1, 60]) {
    assert.deepEqual(checkAddress(unified(bytes)), { kind: 'error', reason: 'length' }, String(bytes));
  }
  assert.equal(checkAddress(unified(61)).kind, 'address');
  assert.equal(buildUri({ address: unified(1), zatoshis: '1' }).kind, 'error');
});
