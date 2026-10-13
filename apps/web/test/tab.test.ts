import test from 'node:test';
import assert from 'node:assert/strict';
import { copyAllText, makeTab, type TabForm } from '../src/tab.ts';
import { decodeShare, parseUri } from '../../../packages/engine/src/index.ts';

const Z_TEST =
  'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const T_TEST = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';

/** Rows from a short text: one person per line, an amount after the name if there is one; "3" is three unnamed people. */
const ppl = (text: string): TabForm['people'] =>
  /^[0-9]+$/.test(text)
    ? Array.from({ length: Number(text) }, () => ({ name: '', amount: '' }))
    : text.split('\n').filter(Boolean).map(line => {
        const m = /^(.*?)\s+(\S*[0-9]\S*)$/.exec(line);
        return m ? { name: m[1], amount: m[2] } : { name: line, amount: '' };
      });

const form = (over: Partial<TabForm> = {}): TabForm => ({
  createdAt: '2026-10-10T00:01:00Z',
  from: 'Miro',
  label: 'Dinner, Friday',
  payee: Z_TEST,
  fiat: 'USD',
  total: '98.00',
  ownShare: '',
  people: ppl('Ana\nBen\nCarla'),
  rate: { fiatPerZec: '1327.32', source: 'Manual entry', observedAt: '2026-10-05T11:31:00.000Z' },
  ...over,
});

test('the brief\'s $98 between four people', () => {
  const tab = makeTab(form());
  assert.equal(tab.kind, 'tab', JSON.stringify(tab));
  if (tab.kind !== 'tab') return;
  assert.equal(tab.own.fiatShare, '24.50');
  assert.equal(tab.paidBack, '73.50');
  assert.deepEqual(tab.rows.map(r => [r.name, r.fiatShare, r.zec]), [
    ['Ana', '24.50', '0.01845825'],
    ['Ben', '24.50', '0.01845825'],
    ['Carla', '24.50', '0.01845824'],
  ]);
  assert.deepEqual(tab.extraCents, []);
  assert.deepEqual(tab.extraZatoshis, ['You', 'Ana', 'Ben']);
  for (const row of tab.rows) {
    const share = decodeShare(row.fragment);
    assert.equal(share.kind, 'share');
    const request = parseUri(row.uri, 'test');
    assert.equal(request.kind, 'request');
    if (share.kind !== 'share' || request.kind !== 'request') return;
    assert.equal(share.share.zatoshis, request.payments[0].zatoshis);
    assert.equal(share.share.from, 'Miro');
    assert.equal(
      Buffer.from(request.payments[0].memoBase64Url!, 'base64url').toString('utf8'),
      `Dinner, Friday · ${row.name} · $24.50 · 10 Oct 2026 · Ztab`,
    );
  }
});

test('a leftover cent is named', () => {
  const tab = makeTab(form({ total: '10.00', people: ppl('Ana\nBen') }));
  assert.equal(tab.kind === 'tab' && tab.own.fiatShare, '3.34');
  assert.deepEqual(tab.kind === 'tab' && tab.extraCents, ['You']);
  assert.equal(tab.kind === 'tab' && tab.paidBack, '6.66');
});

test('a number instead of names makes that many people', () => {
  const tab = makeTab(form({ people: ppl('3') }));
  assert.deepEqual(tab.kind === 'tab' && tab.rows.map(r => r.name), ['Person 1', 'Person 2', 'Person 3']);
});

test('amounts for everyone are kept exactly and must add up', () => {
  const tab = makeTab(form({ ownShare: '49', people: ppl('Ana 24.50\nBen 12.25\nCarla 12.25') }));
  assert.deepEqual(tab.kind === 'tab' && tab.rows.map(r => r.fiatShare), ['24.50', '12.25', '12.25']);
  assert.equal(tab.kind === 'tab' && tab.paidBack, '49.00');
  const short = makeTab(form({ ownShare: '49', people: ppl('Ana 24.50\nBen 12.25') }));
  assert.deepEqual(short, {
    kind: 'error',
    message: 'The amounts add up to $85.75 and the bill is $98.00. Clear one amount and that person takes the rest.',
    target: { field: 'people' },
  });
});

test('one fixed amount, and everyone else shares the rest equally', () => {
  // $98: Ben had $10. You, Ana and Carla share the other $88: 29.34, 29.33, 29.33.
  const tab = makeTab(form({ people: ppl('Ana\nBen 10\nCarla') }));
  assert.equal(tab.kind, 'tab', JSON.stringify(tab));
  if (tab.kind !== 'tab') return;
  assert.equal(tab.own.fiatShare, '29.34');
  assert.deepEqual(tab.rows.map(r => [r.name, r.fiatShare]), [['Ana', '29.33'], ['Ben', '10.00'], ['Carla', '29.33']]);
  assert.equal(tab.paidBack, '68.66');
  assert.deepEqual(tab.extraCents, ['You']);
});

test('your own share is fixed, and the others share the rest', () => {
  const tab = makeTab(form({ ownShare: '10', people: ppl('Ana\nBen\nCarla') }));
  assert.equal(tab.kind === 'tab' && tab.own.fiatShare, '10.00');
  assert.deepEqual(tab.kind === 'tab' && tab.rows.map(r => r.fiatShare), ['29.34', '29.33', '29.33']);
});

test('fixed amounts with one person left: that person takes the rest', () => {
  const tab = makeTab(form({ ownShare: '40', people: ppl('Ana 30.50\nBen') }));
  assert.deepEqual(tab.kind === 'tab' && tab.rows.map(r => [r.name, r.fiatShare]), [['Ana', '30.50'], ['Ben', '27.50']]);
});

test('every share adds up to the bill, whatever is fixed', () => {
  const toCents = (a: string): number => Math.round(Number(a) * 100);
  for (const [ownShare, people] of [['', 'A 0.01\nB\nC\nD'], ['33.33', 'A\nB 7\nC'], ['', 'A 97.97\nB'], ['1', '7']]) {
    const tab = makeTab(form({ ownShare, people: ppl(people) }));
    assert.equal(tab.kind, 'tab', `${ownShare}|${people}: ${JSON.stringify(tab)}`);
    if (tab.kind !== 'tab') continue;
    const sum = toCents(tab.own.fiatShare) + tab.rows.reduce((a, r) => a + toCents(r.fiatShare), 0);
    assert.equal(sum, 9800, `${ownShare}|${people}`);
  }
});

test('amounts that cannot work are explained with the numbers', () => {
  const message = (over: Parameters<typeof form>[0]): string => (makeTab(form(over)) as { message: string }).message;
  assert.equal(message({ people: ppl('Ana 60\nBen 50') }), 'Ana and Ben take $110.00 of a $98.00 bill.');
  assert.equal(message({ total: '50', ownShare: '20', people: ppl('Ana 40\nBen') }), 'You and Ana take $60.00 of a $50.00 bill.');
  assert.equal(message({ people: ppl('Ana 99\nBen') }), 'Ana takes $99.00 of a $98.00 bill.');
  assert.equal(message({ ownShare: '99' }), 'You take $99.00 of a $98.00 bill.');
  assert.equal(
    message({ ownShare: '48', people: ppl('Ana 50\nBen\nCarla') }),
    'The amounts already cover the whole $98.00, so nothing is left for Ben and Carla.',
  );
  assert.match(message({ people: ppl('Ana 10,50\nBen') }), /Write the amount for Ana as a number/);
  assert.match(message({ people: ppl('Ana 0\nBen') }), /Write the amount for Ana as a number/);
  assert.match(message({ ownShare: 'ten' }), /your own amount/);
});

test('the brief\'s acceptance cases for fixed amounts', () => {
  const shares = (over: Parameters<typeof form>[0]): string[] => {
    const tab = makeTab(form(over));
    assert.equal(tab.kind, 'tab', JSON.stringify(tab));
    if (tab.kind !== 'tab') return [];
    for (const r of tab.rows) assert.equal(decodeShare(r.fragment).kind, 'share', r.name);
    return [tab.own.fiatShare, ...tab.rows.map(r => r.fiatShare)];
  };
  assert.deepEqual(shares({}), ['24.50', '24.50', '24.50', '24.50']);
  assert.deepEqual(shares({ people: ppl('Ana 10\nBen\nCarla') }), ['29.34', '10.00', '29.33', '29.33']);
  assert.deepEqual(shares({ ownShare: '20', people: ppl('Ana 10\nBen\nCarla') }), ['20.00', '10.00', '34.00', '34.00']);
  assert.deepEqual(shares({ ownShare: '49', people: ppl('Ana 24.50\nBen 24.50') }), ['49.00', '24.50', '24.50']);
  const refused = (over: Parameters<typeof form>[0]): string => (makeTab(form(over)) as { message: string }).message;
  assert.match(refused({ total: '50', people: ppl('Ana 60\nBen') }), /takes \$60\.00 of a \$50\.00 bill/);
  assert.match(refused({ total: '10.01', ownShare: '10', people: ppl('Ana\nBen') }), /too small to split/);
});

test('the share screen is told which amounts were fixed', () => {
  const mixed = makeTab(form({ people: ppl('Ana 10\nBen\nCarla') }));
  assert.deepEqual(mixed.kind === 'tab' && [mixed.someFixed, mixed.own.fixed, ...mixed.rows.map(r => r.fixed)], [true, false, true, false, false]);
  const equal = makeTab(form());
  assert.equal(equal.kind === 'tab' && equal.someFixed, false);
});

test('an unnamed person is Person 1, 2, 3 by position', () => {
  const tab = makeTab(form({ people: [{ name: '', amount: '' }, { name: 'Ben', amount: '10' }, { name: ' ', amount: '' }] }));
  assert.deepEqual(tab.kind === 'tab' && tab.rows.map(r => r.name), ['Person 1', 'Ben', 'Person 3']);
});

test('a transparent payee gets requests without a memo', () => {
  const tab = makeTab(form({ payee: T_TEST }));
  assert.equal(tab.kind === 'tab' && tab.recipientKind, 'transparent');
  assert.equal(tab.kind === 'tab' && tab.rows.every(r => !r.uri.includes('memo=')), true);
});

test('errors are sentences a person can act on', () => {
  assert.match((makeTab(form({ payee: 'nope' })) as { message: string }).message, /Zcash address/);
  assert.match((makeTab(form({ total: '98,00' })) as { message: string }).message, /total/);
  assert.match((makeTab(form({ people: ppl('') })) as { message: string }).message, /at least one other person/);
  assert.match((makeTab(form({ total: '0.02' })) as { message: string }).message, /too small to split/);
  assert.match((makeTab(form({ rate: { ...form().rate, fiatPerZec: 'abc' } })) as { message: string }).message, /rate/);
});

test('copy-all gives one line per person who owes', () => {
  const tab = makeTab(form());
  assert.equal(tab.kind, 'tab');
  if (tab.kind !== 'tab') return;
  const text = copyAllText(tab, 'Dinner, Friday', 'https://example.test/');
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Dinner, Friday: Ana 24\.50 USD = 0\.01845825 ZEC https:\/\/example\.test\/#s3\./);
});

test('label/name limits remain; expanded memos over 512 bytes are refused', () => {
  const longest = makeTab(form({ label: '🦄'.repeat(80), from: '🦄'.repeat(40), people: ppl('🦄'.repeat(40)) }));
  assert.equal(longest.kind, 'error');
  assert.match(longest.kind === 'error' ? longest.message : '', /too long together/);
  assert.equal(makeTab(form({ label: '🦄'.repeat(70), people: ppl('🦄'.repeat(40)) })).kind, 'tab');
  assert.match((makeTab(form({ label: 'x'.repeat(81) })) as { message: string }).message, /80 characters/);
  assert.match((makeTab(form({ people: ppl('x'.repeat(41)) })) as { message: string }).message, /40 characters/);
  assert.match((makeTab(form({ from: 'x'.repeat(41) })) as { message: string }).message, /40 characters/);
});

test('an empty form is told about the first missing field first', () => {
  const empty = { createdAt: '2026-10-10T00:01:00Z', from: '', label: '', payee: '', fiat: 'USD', total: '', ownShare: '', people: ppl(''), rate: { fiatPerZec: '', source: 'Manual entry', observedAt: '2026-10-05T11:31:00.000Z' } };
  assert.match((makeTab(empty) as { message: string }).message, /total/);
  assert.match((makeTab({ ...empty, total: '98' }) as { message: string }).message, /at least one other person/);
  assert.match((makeTab({ ...empty, total: '98', people: ppl('Ana') }) as { message: string }).message, /Zcash address/);
  assert.match((makeTab({ ...empty, total: '98', people: ppl('Ana'), payee: 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU' }) as { message: string }).message, /rate/);
});

for (const fiat of ['GBP', 'CZK', 'PLN', 'CHF']) {
  test(`${fiat} survives the form, share link and payment request`, () => {
    const tab = makeTab(form({ fiat, total: '90', people: ppl('Ana\nBen'), rate: { ...form().rate, fiatPerZec: '100' } }));
    assert.equal(tab.kind, 'tab');
    if (tab.kind !== 'tab') return;
    const decoded = decodeShare(tab.rows[0].fragment);
    assert.equal(decoded.kind, 'share');
    if (decoded.kind === 'share') {
      assert.equal(decoded.share.rate.fiat, fiat);
      assert.equal(decoded.share.fiatShare, '30.00');
      assert.equal(decoded.share.zatoshis, '30000000');
    }
    assert.match(copyAllText(tab, 'Dinner', 'https://example.test/'), new RegExp(`^Dinner: Ana 30\\.00 ${fiat} = 0\\.3 ZEC `));
  });
}
