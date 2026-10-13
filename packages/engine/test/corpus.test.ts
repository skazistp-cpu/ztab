// Runs the ZecDev ZIP-321 conformance corpus against parseUri.
// Corpus: zecdev/zcash-zip321-test-vectors (MIT, Copyright (c) 2026 ZecDev).
// Set ZIP321_CORPUS to a checkout of it; the test is skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildUri, parseUri } from '../src/zip321.ts';
import type { Network } from '../src/address.ts';

const CORPUS = process.env.ZIP321_CORPUS;

const load = (dir: string): any[] =>
  fs
    .readdirSync(path.join(CORPUS!, 'vectors', dir))
    .sort()
    .flatMap(f =>
      JSON.parse(fs.readFileSync(path.join(CORPUS!, 'vectors', dir, f), 'utf8')),
    );

if (!CORPUS) {
  test('ZecDev corpus', { skip: 'ZIP321_CORPUS is not set' }, () => {});
} else {
  for (const v of load('valid')) {
    test(`valid: ${v.name}`, () => {
      const r = parseUri(v.uri, v.network as Network);
      assert.equal(r.kind, 'request', JSON.stringify(r));
      if (r.kind !== 'request') return;
      const got = r.payments.map(p => ({
        index: p.index,
        address: p.address,
        amountZat: p.zatoshis === undefined ? null : p.zatoshis,
        memoBase64: p.memoBase64Url ?? null,
        label: p.label ?? null,
        message: p.message ?? null,
        other: p.other,
      }));
      const want = v.payments.map((p: any) => ({
        ...p,
        amountZat: p.amountZat === null ? null : String(p.amountZat),
      }));
      assert.deepEqual(got, want);
    });
  }
  // buildUri writes one payment at the empty paramindex with an amount, so
  // only vectors of that form have a canonical URI it can be held to.
  for (const v of load('valid')) {
    const p = v.payments[0];
    const buildable =
      v.payments.length === 1 &&
      p.index === 0 &&
      p.amountZat !== null &&
      p.other.length === 0;
    test(
      `canonical: ${v.name}`,
      { skip: buildable ? false : 'not a single payment with an amount' },
      () => {
        const built = buildUri(
          {
            address: p.address,
            zatoshis: String(p.amountZat),
            memo:
              p.memoBase64 === null
                ? undefined
                : Buffer.from(p.memoBase64, 'base64url').toString('utf8'),
            label: p.label ?? undefined,
            message: p.message ?? undefined,
          },
          v.network as Network,
        );
        assert.deepEqual(built, { kind: 'uri', uri: v.canonicalUri });
      },
    );
  }
  for (const v of load('invalid')) {
    test(`invalid: ${v.name} (${v.error})`, () => {
      const r = parseUri(v.uri, v.network as Network);
      assert.equal(r.kind, 'error', `accepted: ${JSON.stringify(r)}`);
      if (r.kind !== 'error') return;
      assert.equal(r.error, v.error, r.detail);
    });
  }
}

const ours = JSON.parse(
  fs.readFileSync(new URL('../../../vectors/lenient-amounts.json', import.meta.url), 'utf8'),
);
for (const v of ours) {
  test(`ours: ${v.name} (${v.error})`, () => {
    const r = parseUri(v.uri, v.network as Network);
    assert.equal(r.kind, 'error', `accepted: ${JSON.stringify(r)}`);
    assert.equal(r.kind === 'error' && r.error, v.error);
  });
}
