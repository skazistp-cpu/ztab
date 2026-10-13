import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeShare, encodeShare, type ShareLink } from '../src/link.ts';

const Z_TEST =
  'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';

const share: ShareLink = {
  network: 'test',
  payee: Z_TEST,
  label: 'Dinner, Friday · “Zum Löwen” 🍝',
  name: 'Ana',
  from: 'Miro',
  fiatShare: '24.50',
  zatoshis: '1845825',
  rate: {
    fiat: 'USD',
    fiatPerZec: '1327.32',
    source: 'CoinGecko',
    observedAt: '2026-10-05T11:31:00Z',
  },
};

const fragmentOf = (s: ShareLink): string => {
  const e = encodeShare(s);
  assert.equal(e.kind, 'fragment', JSON.stringify(e));
  return e.kind === 'fragment' ? e.fragment : '';
};

test('a share survives the link unchanged', () => {
  const fragment = fragmentOf(share);
  assert.match(fragment, /^s1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(fragment), { kind: 'share', share });
  assert.deepEqual(decodeShare(`#${fragment}`), { kind: 'share', share });
});

test('the rate is carried exactly, not as a number', () => {
  const precise = { ...share, rate: { ...share.rate, fiatPerZec: '1327.320000000000000001' } };
  const back = decodeShare(fragmentOf(precise));
  assert.equal(back.kind === 'share' && back.share.rate.fiatPerZec, '1327.320000000000000001');
});

test('empty label and name are allowed', () => {
  const anon = { ...share, label: '', name: '', from: '' };
  assert.deepEqual(decodeShare(fragmentOf(anon)), { kind: 'share', share: anon });
});

test('a link that is not a tab, cut short or of another version is refused', () => {
  const fragment = fragmentOf(share);
  assert.equal(decodeShare('').kind, 'error');
  assert.deepEqual(
    [decodeShare('hello'), decodeShare('s1.'), decodeShare('s1.!!!')].map(r => r.kind === 'error' && r.error),
    ['not-a-tab-link', 'not-a-tab-link', 'not-a-tab-link'],
  );
  const cut = decodeShare(fragment.slice(0, -7));
  assert.equal(cut.kind, 'error');
  const v3 = decodeShare(fragment.replace(/^s1\./, 's99.'));
  assert.equal(v3.kind === 'error' && v3.error, 'unsupported-version');
});

test('a link with a malformed or out-of-range field is refused', () => {
  const tamper = (change: (f: string[]) => void): string => {
    const f = JSON.parse(Buffer.from(fragmentOf(share).slice(3), 'base64url').toString('utf8'));
    change(f);
    return 's1.' + Buffer.from(JSON.stringify(f), 'utf8').toString('base64url');
  };
  const cases: Array<[string, (f: string[]) => void]> = [
    ['zatoshis: 1e9', f => (f[6] = '1e9')],
    ['zatoshis: -5', f => (f[6] = '-5')],
    ['zatoshis: 0', f => (f[6] = '0')],
    ['zatoshis over supply', f => (f[6] = '2100000000000001')],
    ['fiatShare: 24,50', f => (f[5] = '24,50')],
    ['rate: 0', f => (f[8] = '0')],
    ['rate: 1e3', f => (f[8] = '1e3')],
    ['fiat: usd', f => (f[7] = 'usd')],
    ['observedAt: not a date', f => (f[10] = 'yesterday')],
    ['network: prod', f => (f[0] = 'prod')],
    ['extra field', f => f.push('x')],
    ['label too long', f => (f[2] = 'x'.repeat(81))],
  ];
  for (const [what, change] of cases) {
    assert.equal(decodeShare(tamper(change)).kind, 'error', what);
  }
  const wrongAddress = decodeShare(tamper(f => (f[1] = f[1].slice(0, -1) + 'q')));
  assert.equal(wrongAddress.kind === 'error' && wrongAddress.error, 'invalid-address');
  const mainnet = decodeShare(tamper(f => (f[0] = 'main')));
  assert.equal(mainnet.kind === 'error' && mainnet.error, 'invalid-address');
});

test('encodeShare refuses what decodeShare would refuse', () => {
  assert.equal(encodeShare({ ...share, zatoshis: '0' }).kind, 'error');
  assert.equal(encodeShare({ ...share, payee: 'nope' }).kind, 'error');
});

test('a link whose ZEC amount is not the share at its rate is refused', () => {
  // 24.50 at 1327.32 is 1845824.66… zatoshis: only 1845824 and 1845825 agree.
  assert.equal(encodeShare({ ...share, zatoshis: '1845824' }).kind, 'fragment');
  for (const zatoshis of ['1845823', '1845826', '999', '500000000']) {
    const r = encodeShare({ ...share, zatoshis });
    assert.equal(r.kind === 'error' && r.error, 'amounts-disagree', zatoshis);
  }
  const forged = { ...share, fiatShare: '1.00', zatoshis: '500000000' };
  const r = encodeShare(forged);
  assert.equal(r.kind === 'error' && r.error, 'amounts-disagree');
});

test('an exact conversion allows one amount only', () => {
  const exact = { ...share, fiatShare: '25.00', rate: { ...share.rate, fiatPerZec: '100' } };
  assert.equal(encodeShare({ ...exact, zatoshis: '25000000' }).kind, 'fragment');
  assert.equal(encodeShare({ ...exact, zatoshis: '25000001' }).kind, 'error');
  assert.equal(encodeShare({ ...exact, zatoshis: '24999999' }).kind, 'error');
});

test('a fiat share is above zero and has at most two decimals', () => {
  for (const fiatShare of ['0', '0.00', '24.505']) {
    const r = encodeShare({ ...share, fiatShare });
    assert.equal(r.kind === 'error' && r.detail, 'fiatShare', fiatShare);
  }
});

test('a well-formed link with another address is accepted: links are not signed', () => {
  const other = {
    ...share,
    network: 'regtest' as const,
    payee: 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU',
  };
  assert.deepEqual(decodeShare(fragmentOf(other)), { kind: 'share', share: other });
});

test('text limits count code points, not UTF-16 units', () => {
  assert.equal(encodeShare({ ...share, name: '🦄'.repeat(40) }).kind, 'fragment');
  assert.equal(encodeShare({ ...share, name: '🦄'.repeat(41) }).kind, 'error');
});

test('a rate timestamp must be a real calendar instant', () => {
  for (const observedAt of ['2026-02-31T12:00:00Z', '2026-13-01T00:00:00Z', '2026-10-05T24:00:00Z', '2026-10-05T11:60:00Z']) {
    const r = encodeShare({ ...share, rate: { ...share.rate, observedAt } });
    assert.equal(r.kind === 'error' && r.detail, 'rate.observedAt', observedAt);
  }
  assert.equal(
    encodeShare({ ...share, rate: { ...share.rate, observedAt: '2028-02-29T23:59:59Z' } }).kind,
    'fragment',
  );
});

test('a regtest link takes testnet transparent addresses and no testnet shielded ones', () => {
  const tTest = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';
  assert.equal(encodeShare({ ...share, network: 'regtest', payee: tTest }).kind, 'fragment');
  const shielded = encodeShare({ ...share, network: 'regtest' });
  assert.equal(shielded.kind === 'error' && shielded.error, 'invalid-address');
});

