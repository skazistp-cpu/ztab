import { zatoshisToZec } from '../../../packages/engine/src/index.ts';
import { fiatAmount, h, hang, zecFigure } from './dom.ts';
import { formatFiat } from './money.ts';
import { copyButton, networkStrip, requestFor } from './pay.ts';
import { encodeTable, mineFragment, type TableLink } from './table-link.ts';
import type { Tab } from './tab.ts';
import { noteMatcher } from './note-match.ts';
import { paymentFinder } from './payment-finder.ts';
import { onLeave } from './leave.ts';

export const OWN_RECORD = 'Your own record. Ztab cannot see payments on its own.';
export const WHOLE_TAB_DISCLOSURE = 'Anyone with this link can see the whole tab.';

const pageLink = (fragment: string): string => `${location.origin}${location.pathname}#${fragment}`;

/** On the results: the way to the organiser's own page of this tab. Nothing is stored for it. */
export function organiserInvite(tab: Extract<Tab, { kind: 'tab' }>): HTMLElement | false {
  if (!tab.rows.length) return false;
  const encoded = encodeTable(tab.rows.map(row => row.fragment), tab.zeroPeople);
  if (encoded.kind !== 'fragment') return false;
  return hang(
    h(
      'section',
      { class: 'card mine-invite' },
      h('p', { class: 'eyebrow' }, 'For you'),
      h('h3', {}, 'Keep track of who has paid'),
      h(
        'p',
        {},
        'Open your own page of this tab and tick people off as their payments arrive in your wallet. The ticks are kept in that page’s link, not in this browser.',
      ),
      h('p', { class: 'actions' }, h('a', { class: 'button secondary', href: `#${mineFragment(encoded.fragment, [])}` }, 'Open my page')),
      h('p', { class: 'note' }, `${OWN_RECORD} ${WHOLE_TAB_DISCLOSURE}`),
    ),
  );
}

/**
 * The organiser's page: every share, the note to look for in the wallet, and a box to tick.
 * A tick is the organiser's own mark. It is written into the address of the page and nowhere else.
 */
export function organiserScreen(table: TableLink, fragment: string, ticks: boolean[]): HTMLElement {
  const first = table.rows[0].share;
  const marks = [...ticks];
  const boxes: HTMLInputElement[] = [];
  const people: { name: string; amount: string; zatoshis: string; memo?: string }[] = [];
  let matcher: ReturnType<typeof noteMatcher> | undefined;
  let finder: ReturnType<typeof paymentFinder>;
  const summaryText = h('textarea', {
    id: 'settled-summary', readonly: '', rows: '8', spellcheck: 'false',
  });
  const selectSummary = h('button', {type: 'button', class: 'secondary'}, 'Select summary text');
  selectSummary.addEventListener('click', () => { summaryText.focus(); summaryText.select(); });
  const complete = h('section', {class: 'mine-complete', hidden: '', 'aria-labelledby': 'settled-heading'},
    h('h2', {id: 'settled-heading'}, 'Settled in your record'),
    h('p', {}, 'Every requested share is ticked. These are your marks, not payment confirmation. Check the transactions in your wallet.'),
    h('p', {class: 'actions'}, copyButton('Copy summary', () => summaryText.value), selectSummary),
    h('label', {for: 'settled-summary'}, 'Summary to copy'), summaryText,
  );
  const count = h('p', { class: 'mine-count', role: 'status' });
  // The bar repeats the count for the eye; the count is what is announced.
  const filled = h('i', {});
  const bar = h('span', { class: 'mine-bar', 'aria-hidden': 'true' }, filled);
  // Keeping the page: after the first tick, copying its link is the thing to do next.
  const saved = h('p', { class: 'mine-saved', hidden: '' }, 'Ticks are saved in this link.');
  const keep = h('section', { class: 'mine-keep', 'aria-labelledby': 'keep-heading' },
    h('h2', { id: 'keep-heading' }, 'Keep this page'),
    saved,
    h('p', {}, 'The ticks are kept in this page’s link, not in this browser. Copy the link, or bookmark the page, to come back to it.'),
    h('p', { class: 'note' }, WHOLE_TAB_DISCLOSURE),
    h('p', { class: 'actions' }, copyButton('Copy this page’s link', () => location.href)),
  );
  const say = (): void => {
    const done = marks.filter(Boolean).length;
    const all = marks.length > 0 && done === marks.length;
    count.textContent = `${done} of ${marks.length} ticked${all ? '. Settled in your record. These are your marks, not payment confirmation.' : ''}`;
    filled.style.setProperty('--done', String(marks.length ? done / marks.length : 0));
    bar.classList.toggle('full', all);
    saved.hidden = done === 0;
    keep.classList.toggle('saved', done > 0);
    complete.hidden = !all;
    // No summary survives an untick, and nothing is written outside the existing tick link.
    summaryText.value = all ? [
      `${first.label || 'Your tab'} — organiser’s record`,
      ...(first.network === 'test' ? ['Testnet: not real ZEC'] : first.network === 'regtest' ? ['Regtest: not real ZEC'] : []),
      `All ${marks.length} requested ${marks.length === 1 ? 'share' : 'shares'} ticked.`,
      ...people.map((person, i) => `${i + 1}. ${person.name} — ${person.amount} · ${zatoshisToZec(BigInt(person.zatoshis))} ZEC`),
      'The organiser ticked these by hand. It is their own record, not a payment confirmation.',
      'Ztab',
    ].join('\n') : '';
  };
  const rows = table.rows.map(({ share, fragment: own }, i) => {
    const request = requestFor(share);
    const memo = request.kind === 'request' ? request.memo : undefined;
    people.push({ name: share.name || `Person ${i + 1}`, amount: formatFiat(share.fiatShare, share.rate.fiat), zatoshis: share.zatoshis, memo });
    const box = h('input', { type: 'checkbox', 'aria-label': `I have seen the payment from ${share.name || `Person ${i + 1}`}` });
    boxes.push(box);
    box.checked = marks[i];
    const item = h(
      'li',
      { class: marks[i] ? 'mine-person ticked' : 'mine-person' },
      h(
        'label',
        { class: 'mine-head' },
        box,
        // The inner span carries the line drawn through a ticked name, one line per wrapped line.
        h('strong', {}, h('span', {}, share.name || `Person ${i + 1}`)),
        fiatAmount(formatFiat(share.fiatShare, share.rate.fiat)),
      ),
      h('p', { class: 'mine-zec' }, zecFigure(zatoshisToZec(BigInt(share.zatoshis)))),
      memo !== undefined
        ? h('p', { class: 'mine-memo' }, 'Note to look for in your wallet: ', h('span', {}, `“${memo}”`))
        : h('p', { class: 'mine-memo' }, 'This request carries no note. Look for the amount.'),
      h('p', { class: 'actions' }, copyButton(`Copy ${share.name || `Person ${i + 1}`}’s link`, () => pageLink(own))),
    );
    // A tick made here, not one read from the link, gets a short confirming motion (none with reduced motion).
    item.addEventListener('animationend', event => { if (event.animationName === 'mine-tick') item.classList.remove('just-ticked'); });
    box.addEventListener('change', () => {
      marks[i] = box.checked;
      item.classList.toggle('ticked', box.checked);
      item.classList.toggle('just-ticked', box.checked);
      // The ticks live in the address of this page. Replacing it re-renders nothing.
      history.replaceState(null, '', `#${mineFragment(fragment, marks)}`);
      say();
      matcher?.clear();
      finder?.clear();
    });
    return item;
  });
  say();
  const tick = (index: number): void => {
    if (!boxes[index].checked) boxes[index].click();
  };
  if (people.some(person => person.memo !== undefined)) matcher = noteMatcher(people, marks, tick);
  finder = paymentFinder(first.network, first.createdAt, people, marks, tick);
  // Ticks rewrite the address with replaceState and leave nothing; any other change of screen ends the check.
  if (finder) onLeave(finder.dispose);
  return hang(
    h(
      'section',
      { class: 'card table-mine' },
      networkStrip(first.network),
      h('p', { class: 'eyebrow' }, first.label || 'Your tab'),
      h('h1', {}, 'Who has paid'),
      // The caution and how to tick, read together in one box before the list.
      h('div', { class: 'mine-guide' },
        h('p', { class: 'caution' }, OWN_RECORD),
        h('p', {}, 'Tick a person when you see their payment in your wallet. A tick does not check anything: it is your mark.'),
      ),
      h('div', { class: 'mine-progress' }, count, bar),
      h('ul', { class: 'mine-people' }, ...rows),
      table.zeroPeople.length > 0 &&
        h('div', { class: 'table-zero' }, h('h2', {}, 'No payment needed'), ...table.zeroPeople.map(name => h('p', {}, name))),
      complete,
      // Keeping the link comes straight after the list, so it is near the ticks it keeps.
      keep,
      matcher?.element,
      finder?.element,
      h('p', { class: 'mine-new' }, h('a', { href: '#', class: 'tap-link' }, 'Start a new bill')),
    ),
  );
}
