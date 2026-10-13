import {itemBreakdownView} from './item-breakdown-view.ts';
import type {ItemSplit} from './items.ts';
import { tableInvite } from './table-screen.ts';
import { organiserInvite } from './organiser-screen.ts';
import { addressBadge, PUBLIC_ADDRESS } from './address-badge.ts';
import { itemEditor } from './item-editor.ts';
import { landing } from './landing.ts';
import './flow.css';
import { checkAddress, FIAT_CURRENCIES } from '../../../packages/engine/src/index.ts';
import { startingCurrency } from './locale-currency.ts';
import { fiatAmount, h, hang, row, zecFigure } from './dom.ts';
import { formatFiat, formatUtc } from './money.ts';
import { copyButton, networkStrip } from './pay.ts';
import { qrSvg } from './qr.ts';
import {
  fetchSpot,
  FETCHED_SOURCE,
  isRate,
  MANUAL_SOURCE,
  nowUtc,
  sourceText,
  STALE_AFTER_MS,
} from './rate.ts';
import { addressEnds, forget, look, remember } from './remember.ts';
import { shareButton } from './share.ts';
import { copyAllText, makeTab, personText, type ErrorTarget, type Tab, type TabForm } from './tab.ts';

let fieldId = 0;
/**
 * A labelled box. Its name is the label alone; a hint under it is its description. An optional box says so beside
 * its label, for the eye only: it is simply not required.
 */
const field = (label: string, control: HTMLElement, hint?: string, optional = false): HTMLElement => {
  const id = `field-${++fieldId}`;
  const name = h('span', { id: `${id}-name` }, label);
  if (!control.hasAttribute('aria-label')) control.setAttribute('aria-labelledby', name.id);
  if (hint) control.setAttribute('aria-describedby', `${id}-hint`);
  return h(
    'label',
    { class: optional ? 'field optional-field' : 'field' },
    name,
    optional && h('em', { class: 'optional', 'aria-hidden': 'true' }, 'Optional'),
    control,
    hint && h('small', { id: `${id}-hint` }, hint),
  );
};

const input = (attrs: Record<string, string>): HTMLInputElement => h('input', attrs);

const list = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const calm = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where a rate came from in this session. A typed rate is never called fetched. */
type RateState =
  | { kind: 'none' }
  | { kind: 'typed'; observedAt: string }
  | { kind: 'fetched'; fiat: string; amount: string; observedAt: string };

/** The steps of making a tab, in order. Items is a step only when the bill is split by item. */
type StepId = 'bill' | 'people' | 'items' | 'rate' | 'payee';
const STEP_NAME: Record<StepId, string> = { bill: 'Bill', people: 'People', items: 'Items', rate: 'Rate', payee: 'Get paid' };

/**
 * Only for the live preview while the tab is being made: a valid testnet address stands in until the organiser's
 * own is typed, so the engine can show each share. It is never shown, stored, put in a link or sent anywhere.
 */
const PREVIEW_PAYEE = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
/** Likewise a rate that keeps every valid bill inside the engine's limits; ZEC is shown only for a real rate. */
const PREVIEW_RATE = '1000';
/** The engine's "more ZEC than exists" message, as tab.ts words it: it depends on the rate. */
const SUPPLY_ERROR = 'That is more ZEC than exists. Check the total and the rate.';

/** The history entries the screen adds for its own views, so Back goes to the previous step. */
const MARK = 'ztabCreate';
type Place = { view: 'landing' } | { view: 'flow'; step: StepId } | { view: 'links' };

export function createScreen(): HTMLElement {
  let refreshPeople = (): void => {};
  let invalidateResults = (): void => {};
  let refreshPreview = (): void => {};
  let personId = 0;
  // Your own name sits in your row on the People step; your friends see it as who they are paying.
  const from = input({ type: 'text', autocomplete: 'off', id: 'tab-from', placeholder: 'Your name', 'aria-label': 'Your name', 'aria-describedby': 'tab-from-hint' });
  const label = input({ type: 'text', placeholder: 'e.g. Dinner, Friday', id: 'tab-label' });
  const total = input({ type: 'text', inputmode: 'decimal', placeholder: '0.00', id: 'tab-total', class: 'total-figure', 'aria-required': 'true' });
  const fiat = h('select', { id: 'tab-fiat' }, ...FIAT_CURRENCIES.map(code => h('option', { value: code }, code)));
  fiat.value = startingCurrency(navigator.languages);
  const ownShare = input({
    type: 'text',
    inputmode: 'decimal',
    placeholder: 'shares the rest',
    'aria-label': 'Your own amount',
  });
  const count = input({ type: 'number', min: '1', max: '49', inputmode: 'numeric', value: '2', id: 'people-count' });
  const fewer = h('button', { type: 'button', class: 'secondary step', 'aria-label': 'One person fewer' }, '−');
  const more = h('button', { type: 'button', class: 'secondary step', 'aria-label': 'One person more' }, '+');
  const rows = h('div', { class: 'people' });
  const people: Array<{ id: string; el: HTMLElement; name: HTMLInputElement; amount: HTMLInputElement; remove: HTMLElement }> = [];
  const renumber = (): void => {
    people.forEach((person, i) => {
      const n = i + 1;
      person.name.placeholder = `Person ${n}`;
      person.name.setAttribute('aria-label', `Name of person ${n}`);
      person.amount.setAttribute('aria-label', `Amount for person ${n}`);
      person.remove.setAttribute('aria-label', `Remove person ${n}`);
      person.remove.toggleAttribute('disabled', people.length === 1);
    });
    count.value = String(people.length);
    fewer.toggleAttribute('disabled', people.length <= 1);
    more.toggleAttribute('disabled', people.length >= 49);
    refreshPeople();
    invalidateResults();
  };
  const addPerson = (): void => {
    if (people.length >= 49) {
      return;
    }
    const name = input({ type: 'text', autocomplete: 'off', list: 'known-names' });
    const amount = input({ type: 'text', inputmode: 'decimal', placeholder: 'shares the rest' });
    const remove = h('button', { type: 'button', class: 'secondary remove' }, '×');
    const el = h('div', { class: 'person-row' }, name, amount, remove);
    const person = { id: `person-${++personId}`, el, name, amount, remove };
    name.addEventListener('input', () => refreshPeople());
    remove.addEventListener('click', () => {
      people.splice(people.indexOf(person), 1);
      el.remove();
      renumber();
    });
    people.push(person);
    rows.append(el);
  };
  const setCount = (wanted: number): void => {
    const n = Math.min(49, Math.max(1, wanted));
    while (people.length < n) addPerson();
    // Lowering the count drops empty rows from the end, never one with text in it.
    while (people.length > n) {
      const last = people[people.length - 1];
      if (last.name.value.trim() !== '' || last.amount.value.trim() !== '') {
        break;
      }
      people.pop();
      last.el.remove();
    }
    renumber();
  };
  setCount(2);
  count.addEventListener('change', () => setCount(Number.parseInt(count.value, 10) || 1));
  // Rows follow the number as it is typed; an empty box waits for a digit.
  count.addEventListener('input', () => {
    const wanted = Number.parseInt(count.value, 10);
    if (wanted >= 1) {
      const typed = count.value;
      setCount(wanted);
      if (people.length === Math.min(49, wanted)) {
        count.value = typed;
      }
    }
  });
  fewer.addEventListener('click', () => setCount(people.length - 1));
  more.addEventListener('click', () => setCount(people.length + 1));
  const countRow = h(
    'div',
    { class: 'count-row' },
    // In the order they are seen, so the keyboard meets them in that order too.
    h('label', { for: 'people-count' }, 'People besides you'),
    fewer,
    count,
    more,
  );
  // Names used before, offered as picks while a name is typed. Filled only when the person asked for it.
  const knownNames = h('datalist', { id: 'known-names' });
  const offerNames = (names: string[]): void =>
    knownNames.replaceChildren(...names.map(name => h('option', { value: name })));
  const addButton = h('button', { type: 'button', class: 'secondary' }, 'Add a person');
  addButton.addEventListener('click', () => {
    addPerson();
    renumber();
    people[people.length - 1].name.focus();
  });
  const splitTotal = input({ type: 'radio', name: 'split-mode', value: 'total', checked: '', 'aria-label': 'Split the total', 'aria-describedby': 'split-total-note' });
  const splitByItem = input({ type: 'radio', name: 'split-mode', value: 'items', 'aria-label': 'Split by item', 'aria-describedby': 'split-items-note' });
  const choice = (radio: HTMLInputElement, title: string, note: string, id: string): HTMLElement =>
    h('label', { class: 'choice' }, radio, h('span', { class: 'choice-text' }, h('b', {}, title), h('small', { id }, note)));
  const splitMode = h(
    'fieldset',
    { class: 'split-mode' },
    h('legend', {}, 'How to split'),
    choice(splitTotal, 'Split the total', 'Equal shares, or a fixed amount for anyone', 'split-total-note'),
    choice(splitByItem, 'Split by item', 'Each item to whoever had it, with a tip. Anyone can also have an amount of their own.', 'split-items-note'),
  );
  const TOTAL_HINT = 'Names are optional. Type an amount for anyone who pays a fixed sum. Everyone without an amount shares the rest equally.';
  const ITEM_HINT = 'Add the people on the bill, then assign their items on the next step. Someone paying an amount of their own? On the next step, add it as an item for them alone. People with no share get no payment link.';
  const peopleHint = h('small', { class: 'people-hint' }, TOTAL_HINT);
  const peopleBlock = h(
    'fieldset',
    { class: 'field group' },
    h('legend', { class: 'eyebrow' }, 'Who pays what'),
    countRow,
    peopleHint,
    h('div', { class: 'person-row you' }, from, ownShare),
    h('small', { class: 'you-hint', id: 'tab-from-hint' }, 'Your name is optional. Your friends see who they are paying.'),
    rows,
    knownNames,
    h('p', { class: 'actions' }, addButton),
  );
  // A box that grows, so the whole address can be read and its end checked.
  const payee = h('textarea', { rows: '2', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', class: 'mono', 'aria-required': 'true' });
  const fitPayee = (): void => {
    if (payee.clientWidth === 0) {
      return;
    }
    payee.style.height = 'auto';
    payee.style.height = `${payee.scrollHeight + 3}px`;
  };
  // Says what kind of address this is as soon as it is a whole, valid one.
  // A testnet or regtest address carries the same mark here as on the links, before anything is made.
  const payeeKind = h('div', { class: 'address-kind', role: 'status' });
  const showPayeeKind = (): void => {
    const badge = addressBadge(payee.value);
    const checked = badge ? checkAddress(payee.value.trim()) : undefined;
    const strip = checked?.kind === 'address' && networkStrip(checked.network);
    payeeKind.hidden = badge === undefined;
    payeeKind.className = badge ? `address-kind ${badge.tone}` : 'address-kind';
    payeeKind.replaceChildren(...(badge ? [strip || '', h('p', {}, h('strong', {}, badge.label), badge.detail && ` ${badge.detail}`)] : []));
  };
  showPayeeKind();
  // The address's kind, its network mark and any public warning come fully into view as soon as they show, above
  // the sticky bar (html's scroll-padding leaves room for it), so Make the links is never pressed with them unseen.
  const revealPayeeKind = (): void => {
    if (!payeeKind.hidden && payeeKind.isConnected && !payeeKind.closest('[hidden]')) payeeKind.scrollIntoView({ block: 'nearest' });
  };
  payee.addEventListener('input', () => {
    const clean = payee.value.replace(/\s+/g, '');
    if (clean !== payee.value) {
      payee.value = clean;
    }
    showPayeeKind();
    fitPayee();
    revealPayeeKind();
  });
  // The box is measured again whenever its width changes, so a narrower screen never hides the end.
  // The new height is written on the next frame, not while the observer is still reporting.
  let payeeWidth = 0;
  new ResizeObserver(() => {
    if (payee.clientWidth !== payeeWidth) {
      payeeWidth = payee.clientWidth;
      requestAnimationFrame(fitPayee);
    }
  }).observe(payee);
  // Remembering is off until the person turns it on, and it never leaves this device.
  const keep = input({ type: 'checkbox' });
  const keptLine = h('p', { class: 'kept', 'aria-live': 'polite' });
  const forgetButton = h('button', { type: 'button', class: 'secondary' }, 'Forget them');
  const keptBox = h('div', { class: 'kept-box' }, keptLine, forgetButton);
  /** Shows what is kept, or a line about it. The button shows whenever something is or may be kept. */
  const showKept = (address: string | undefined, said?: string, mayBeKept = address !== undefined): void => {
    keptBox.hidden = address === undefined && said === undefined;
    forgetButton.hidden = !mayBeKept;
    keptLine.replaceChildren(
      ...(address === undefined
        ? [said ?? '']
        : [
            said ? `${said} ` : '',
            'Remembered on this device: ',
            h('span', { class: 'mono' }, addressEnds(address)),
            '. Check it is still yours.',
          ]),
    );
  };
  // Says "forgotten" only when the removal was confirmed. Otherwise the switch stays on and Forget stays to try again.
  const wipe = (): void => {
    if (forget()) {
      keep.checked = false;
      offerNames([]);
      showKept(undefined, 'Forgotten. Nothing is kept on this device.');
      return;
    }
    keep.checked = true;
    const still = look();
    if (still.kind === 'unknown') {
      // The browser will not let Tab look, so it does not say what is or is not there.
      showKept(undefined, 'Could not forget. Ztab cannot check what is kept on this device. Try again, or clear this site\'s data in the browser.', true);
      return;
    }
    showKept(
      still.kind === 'kept' ? still.record.address : undefined,
      'Could not forget. Your address and names are still on this device. Try again.',
      true,
    );
  };
  forgetButton.addEventListener('click', wipe);
  keep.addEventListener('change', () => {
    if (keep.checked) {
      showKept(undefined, 'Your address and the names will be remembered when you make the links.');
    } else {
      wipe();
    }
  });
  const kept = look();
  if (kept.kind === 'kept') {
    keep.checked = true;
    payee.value = kept.record.address;
    showPayeeKind();
    offerNames(kept.record.names);
    showKept(kept.record.address);
  } else if (kept.kind === 'unreadable') {
    // Something under Tab's key that is not a record: remove it, and say so if that fails.
    if (forget()) {
      showKept(undefined);
    } else {
      keep.checked = true;
      showKept(undefined, 'Could not forget. Your address and names are still on this device. Try again.', true);
    }
  } else {
    showKept(undefined);
  }
  const rate = input({ type: 'text', inputmode: 'decimal', id: 'tab-rate', 'aria-required': 'true' });
  const rateLine = h('p', { class: 'rate', 'aria-live': 'polite' });
  const fetchButton = h('button', { type: 'button', class: 'fetch-rate' }, 'Fetch the rate from Coinbase');
  const confirmOld = input({ type: 'checkbox' });
  const confirmField = h(
    'label',
    { class: 'check' },
    confirmOld,
    'This rate was retrieved more than 5 minutes ago. Use it anyway.',
  );
  confirmField.hidden = true;
  const error = h('p', { class: 'warning', role: 'alert', id: 'form-error' });
  const out = h('div', { class: 'results' });

  const editor = itemEditor(() => { invalidateResults(); clearError(); refreshPreview(); });
  // On its own step, the editor is shown whenever that step is.
  editor.element.hidden = false;
  refreshPeople = (): void => {
    const named = [{id:'you',name:'You'}, ...people.map((p,i) => ({id:p.id,name:p.name.value.trim() || `Person ${i+1}`}))];
    editor.update(named.map((p,i) => ({...p, name: named.filter(other => other.name === p.name).length > 1
      ? `${p.name} (${i === 0 ? 'organiser' : `person ${i}`})` : p.name})), fiat.value);
    people.forEach(p => p.amount.hidden = splitByItem.checked);
    refreshPreview();
  };
  refreshPeople();
  const totalField = field('Total', total);
  const itemsLater = h('p', { class: 'step-note' }, 'You will list the items and who had them after the people.');
  itemsLater.hidden = true;
  const updateMode = (): void => {
    const itemized = splitByItem.checked;
    totalField.hidden = itemized; fiatPair.classList.toggle('itemized', itemized); itemsLater.hidden = !itemized; ownShare.hidden = itemized;
    peopleBlock.classList.toggle('item-people', itemized);
    peopleHint.textContent = itemized ? ITEM_HINT : TOTAL_HINT;
    refreshPeople(); invalidateResults(); clearError(); showSteps();
  };
  splitByItem.addEventListener('change', updateMode); splitTotal.addEventListener('change', updateMode);

  let rateState: RateState = { kind: 'none' };
  // The rate the previews work ZEC out with. A typed rate counts once it settles, when its box is left or 600 ms after
  // the last key, so no figure follows half a number (1, 13, 132 …); a fetched rate counts at once.
  let settledRate = '';
  let settleTimer = 0;
  const settleRate = (): void => {
    window.clearTimeout(settleTimer);
    if (settledRate !== rate.value.trim()) {
      settledRate = rate.value.trim();
      refreshPreview();
    }
  };
  rate.addEventListener('blur', settleRate);
  let lookup = 0;

  const showRate = (): void => {
    if (rateState.kind === 'fetched') {
      rateLine.textContent = `1 ZEC = ${formatFiat(rateState.amount, rateState.fiat)} · ${FETCHED_SOURCE} · retrieved ${formatUtc(rateState.observedAt)}`;
    } else if (rateState.kind === 'typed') {
      rateLine.textContent = `Entered by hand · ${formatUtc(rateState.observedAt)}`;
    } else {
      rateLine.textContent = '';
    }
  };

  rate.addEventListener('input', () => {
    settledRate = '';
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settleRate, 600);
    lookup++;
    rateState = rate.value.trim() ? { kind: 'typed', observedAt: nowUtc() } : { kind: 'none' };
    confirmField.hidden = true;
    confirmOld.checked = false;
    showRate();
  });
  fiat.addEventListener('change', () => {
    refreshPeople();
    lookup++;
    // A rate is a price in one currency: a new currency starts without one, typed or fetched, so a rate in another
    // currency never prices its shares. The rate's label already names the new currency.
    if (rateState.kind !== 'none' || rate.value !== '') {
      rateState = { kind: 'none' };
      rate.value = '';
      settledRate = '';
      confirmField.hidden = true;
      confirmOld.checked = false;
      if (marked === rate) clearError();
      showRate();
    }
  });
  fetchButton.addEventListener('click', async () => {
    const mine = ++lookup;
    const currency = fiat.value;
    rateLine.textContent = 'Asking Coinbase for the rate…';
    rateLine.classList.add('loading');
    fetchButton.disabled = true;
    const amount = await fetchSpot(currency);
    rateLine.classList.remove('loading');
    fetchButton.disabled = false;
    if (mine !== lookup) {
      return;
    }
    if (amount === undefined) {
      rateLine.textContent = 'Could not get a rate. Type one in instead.';
      return;
    }
    invalidateResults();
    rateState = { kind: 'fetched', fiat: currency, amount, observedAt: nowUtc() };
    rate.value = amount;
    settledRate = amount;
    confirmField.hidden = true;
    confirmOld.checked = false;
    // A rate error is answered by the rate that has just arrived.
    if (marked === rate || error.previousElementSibling === confirmField) clearError();
    showRate();
    refreshPreview();
  });

  // The rate's label names the currency it is in, and follows the currency when it changes.
  const rateField = field(`Rate: one ZEC in ${fiat.value}`, rate, 'For example 1327.32');
  fiat.addEventListener('change', () => {
    const name = rateField.querySelector('span');
    if (name) name.textContent = `Rate: one ZEC in ${fiat.value}`;
  });

  // ── The steps ──────────────────────────────────────────────────────────────
  const titles: Record<StepId, HTMLElement> = {
    bill: h('h1', { class: 'step-title', tabindex: '-1' }, 'What’s the bill?'),
    people: h('h1', { class: 'step-title', tabindex: '-1' }, 'Who’s splitting it?'),
    items: h('h1', { class: 'step-title', tabindex: '-1' }, 'Who had what?'),
    rate: h('h1', { class: 'step-title', tabindex: '-1' }, 'What is one ZEC worth?'),
    payee: h('h1', { class: 'step-title', tabindex: '-1' }, 'Where do you get paid?'),
  };
  // Each share as the engine works it out, shown while the tab is being made: fiat on People, ZEC too on Rate.
  const peoplePreview = h('div', { class: 'split-preview' });
  const ratePreview = h('div', { class: 'split-preview' });
  // The lists change with every key, so they are not read out as they change; one short summary is, once typing pauses.
  const shareNews = h('p', { class: 'visually-hidden', role: 'status' });
  let newsTimer = 0;
  let lastNews = '';
  const announceShares = (text: string): void => {
    window.clearTimeout(newsTimer);
    newsTimer = window.setTimeout(() => {
      if (text !== lastNews) {
        lastNews = text;
        shareNews.textContent = text;
      }
    }, 900);
  };
  const fiatPair = h('div', { class: 'pair' }, totalField, field('Currency', fiat));
  const panels: Record<StepId, HTMLElement> = {
    bill: h(
      'div',
      { class: 'flow-panel', 'data-step': 'bill' },
      titles.bill,
      h('p', { class: 'step-lead' }, 'Type the total from the receipt, or split it item by item.'),
      splitMode,
      fiatPair,
      itemsLater,
      field('What was it for?', label, 'Your friends see it on their payment page. Left empty, their payment note says “Bill”.', true),
    ),
    people: h(
      'div',
      { class: 'flow-panel', 'data-step': 'people' },
      titles.people,
      peopleBlock,
      peoplePreview,
    ),
    items: h(
      'div',
      { class: 'flow-panel', 'data-step': 'items' },
      titles.items,
      h('p', { class: 'step-lead' }, 'Enter each line’s full price, then choose who shared it. Paying an amount of their own? Add it as an item for them alone, with any name, such as “Dan’s share”. It is added on top of the other items, and a tip applies to it too.'),
      editor.element,
    ),
    rate: h(
      'div',
      { class: 'flow-panel', 'data-step': 'rate' },
      titles.rate,
      h('p', { class: 'step-lead' }, 'Your friends pay in ZEC. Each share is worked out at this rate when you make the links.'),
      h('div', { class: 'fetch-box' },
        fetchButton,
        h('p', { class: 'note' }, 'Fetching the rate asks Coinbase for a price and sends nothing about your bill. Coinbase can see that a price was requested from your connection.'),
      ),
      h('p', { class: 'or' }, h('span', {}, 'or type it')),
      rateField,
      rateLine,
      confirmField,
      ratePreview,
    ),
    payee: h(
      'div',
      { class: 'flow-panel', 'data-step': 'payee' },
      titles.payee,
      h('p', { class: 'step-lead' }, 'Your friends’ payment requests carry this address, so they pay your own wallet directly. Ztab never holds the money.'),
      field('Your Zcash address', payee, 'Copy it from your wallet’s Receive screen. A unified address starts with u1 (utest1 on testnet) and a shielded one with zs1 (ztestsapling on testnet). Payments to a transparent address (it starts with t) are public.'),
      payeeKind,
      keptBox,
      h('label', { class: 'check' }, keep, 'Remember my address and names on this device'),
      h('small', { class: 'check-note' }, 'Kept in this browser only and never sent anywhere. Anyone who uses this device can see them.'),
      h('p', { class: 'note' }, 'Your tab is kept in the links you share, not on a server.'),
    ),
  };
  // A panel's title is its name for the screen reader, and no step is shown before it is reached.
  for (const [id, panel] of Object.entries(panels) as Array<[StepId, HTMLElement]>) {
    titles[id].id = `step-${id}`;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-labelledby', `step-${id}`);
    panel.hidden = true;
  }
  const order = (): StepId[] => (splitByItem.checked ? ['bill', 'people', 'items', 'rate', 'payee'] : ['bill', 'people', 'rate', 'payee']);
  let current: StepId = 'bill';
  const reached = new Set<StepId>(['bill']);
  const stepList = h('ol', { class: 'flow-steps', 'aria-label': 'Steps' });
  const back = h('button', { type: 'button', class: 'secondary flow-back' }, 'Back');
  const next = h('button', { type: 'submit', class: 'primary flow-next' }, 'Next');
  const close = h('button', { type: 'button', class: 'flow-close', 'aria-label': 'Close and go back to the start' });
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const position = h('p', { class: 'flow-position', 'aria-live': 'polite' });
  const showSteps = (): void => {
    const steps = order();
    if (!steps.includes(current)) current = steps[Math.max(0, steps.indexOf('rate') - 1)];
    stepList.replaceChildren(...steps.map((id, i) => {
      const button = h('button', { type: 'button', class: reached.has(id) && id !== current ? 'done' : '' }, h('b', { 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'step-name' }, STEP_NAME[id]));
      if (id === current) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => { if (id !== current) go(id); });
      return h('li', {}, button);
    }));
    const at = steps.indexOf(current);
    position.textContent = `Step ${at + 1} of ${steps.length}`;
    for (const [id, panel] of Object.entries(panels) as Array<[StepId, HTMLElement]>) panel.hidden = id !== current;
    back.textContent = at === 0 ? 'Close' : 'Back';
    next.textContent = at === steps.length - 1 ? 'Make the links' : 'Next';
    next.classList.toggle('make', at === steps.length - 1);
  };

  const form = h(
    'form',
    { class: 'card flow-card', novalidate: '' },
    position,
    close,
    shareNews,
    ...Object.values(panels),
    error,
    h('div', { class: 'flow-actions' }, back, next),
  );
  const receipt = h('aside', { class: 'flow-receipt', 'aria-label': 'Your tab so far' });
  const flow = h(
    'section',
    { class: 'flow', 'aria-label': 'Make a tab' },
    h('div', { class: 'flow-top' }, stepList),
    h('div', { class: 'flow-body' }, hang(form), receipt),
  );
  flow.hidden = true;

  // ── Live preview: the engine's own shares, from what has been typed so far ──
  const currentForm = (overrides: Partial<TabForm> = {}): { form: TabForm; itemTotals?: Extract<ItemSplit, { kind: 'split' }> } => {
    const items = splitByItem.checked ? editor.peek() : undefined;
    const itemTotals = items?.kind === 'split' ? items : undefined;
    return {
      itemTotals,
      form: {
        itemized: splitByItem.checked,
        createdAt: nowUtc(),
        from: from.value,
        label: label.value,
        payee: payee.value,
        fiat: fiat.value,
        total: itemTotals?.total ?? total.value,
        ownShare: itemTotals?.shares[0].total ?? ownShare.value,
        people: people.map((person, i) => ({ name: person.name.value, amount: itemTotals?.shares[i + 1].total ?? person.amount.value })),
        rate: { fiatPerZec: rate.value.trim(), source: MANUAL_SOURCE, observedAt: nowUtc() },
        ...overrides,
      },
    };
  };
  /** The shares as they would be made now, with stand-ins for an address or rate not typed yet. */
  const preview = (): { tab: Extract<Tab, { kind: 'tab' }>; realRate: boolean } | undefined => {
    if (splitByItem.checked && editor.peek().kind !== 'split') return undefined;
    const realRate = isRate(settledRate) && settledRate === rate.value.trim();
    const { form: now } = currentForm();
    const tab = makeTab({
      ...now,
      payee: addressBadge(payee.value) ? payee.value : PREVIEW_PAYEE,
      rate: { ...now.rate, fiatPerZec: realRate ? settledRate : PREVIEW_RATE },
    });
    return tab.kind === 'tab' ? { tab, realRate } : undefined;
  };
  let previewFrame = 0;
  refreshPreview = (): void => {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      const made = preview();
      const lines = (withZec: boolean): HTMLElement[] => {
        if (!made) return [];
        const { tab } = made;
        const money = (amount: string): string => formatFiat(amount, tab.fiat);
        const zec = withZec && made.realRate;
        return [
          h('li', { class: 'you' }, h('span', {}, 'You'), h('span', {}, money(tab.own.fiatShare), zec && h('small', {}, zecFigure(tab.own.zec)))),
          ...tab.rows.map(r => h('li', {}, h('span', {}, r.name), h('span', {}, money(r.fiatShare), zec && h('small', {}, zecFigure(r.zec))))),
          ...tab.zeroPeople.map(name => h('li', { class: 'zero' }, h('span', {}, name), h('span', {}, 'No payment needed'))),
        ];
      };
      const shares = lines(false);
      peoplePreview.replaceChildren(...(shares.length && !splitByItem.checked ? [h('h2', {}, 'Each share'), h('ul', {}, ...shares)] : []));
      const withZec = lines(true);
      ratePreview.replaceChildren(...(withZec.length && made?.realRate ? [h('h2', {}, 'Each share at this rate'), h('ul', {}, ...withZec)] : []));
      // The summary for the step on screen: its heading and the first few shares.
      const box = current === 'people' ? peoplePreview : current === 'rate' ? ratePreview : undefined;
      const said = box && made && box.firstElementChild ? [
        `You ${formatFiat(made.tab.own.fiatShare, made.tab.fiat)}`,
        ...made.tab.rows.map(r => `${r.name} ${formatFiat(r.fiatShare, made.tab.fiat)}`),
      ] : [];
      announceShares(said.length ? `${box?.querySelector('h2')?.textContent}: ${said.slice(0, 4).join(', ')}${said.length > 4 ? ` and ${said.length - 4} more` : ''}.` : '');
      // The side receipt on a wide screen: what the tab says so far, line by line.
      const money = (amount: string): string => formatFiat(amount, fiat.value);
      const totalText = made ? money(made.tab.total) : /^\d+(\.\d{1,2})?$/.test(total.value.trim()) && !splitByItem.checked ? money(total.value.trim()) : '—';
      const badge = addressBadge(payee.value);
      receipt.replaceChildren(
        h('p', { class: 'fr-title' }, label.value.trim() || 'Your tab'),
        h('p', { class: 'fr-kind' }, splitByItem.checked ? 'Split by item' : 'Split the total'),
        made ? h('ul', { class: 'fr-lines' }, ...lines(true)) : h('p', { class: 'fr-empty' }, splitByItem.checked ? 'The shares appear here once every item has its people.' : 'The shares appear here as you type.'),
        h('p', { class: 'fr-total' }, h('span', {}, 'Total'), h('b', {}, totalText)),
        h('p', { class: 'fr-meta' }, isRate(settledRate) && settledRate === rate.value.trim() ? `1 ZEC = ${money(settledRate)}` : 'Rate not set yet'),
        h('p', { class: 'fr-meta' }, badge ? `${badge.label} ${addressEnds(payee.value.trim())}` : 'Address not added yet'),
      );
    });
  };
  for (const control of [total, fiat, ownShare, label, payee, rate, count]) control.addEventListener('input', () => refreshPreview());
  rows.addEventListener('input', () => refreshPreview());
  fiat.addEventListener('change', () => refreshPreview());

  // ── Moving between the landing, the steps and the links ──────────────────
  let place: Place = { view: 'landing' };
  const landingView = landing(() => openFlow());
  const linksView = h('section', { class: 'links', 'aria-label': 'Your links' }, out);
  linksView.hidden = true;
  const root = h('div', { class: 'create' }, landingView, flow, linksView);
  const scrollTop = (): void => window.scrollTo({ top: 0, behavior: 'auto' });
  const render = (to: Place, focus = true): void => {
    const previous = place;
    place = to;
    landingView.hidden = to.view !== 'landing';
    flow.hidden = to.view !== 'flow';
    linksView.hidden = to.view !== 'links';
    root.dataset.view = to.view;
    if (to.view === 'flow') {
      const forward = previous.view !== 'flow' || order().indexOf(to.step) >= order().indexOf(previous.step);
      current = to.step;
      reached.add(to.step);
      showSteps();
      const panel = panels[to.step];
      if (!calm()) {
        panel.classList.remove('enter-forward', 'enter-back');
        void panel.offsetWidth;
        panel.classList.add(forward ? 'enter-forward' : 'enter-back');
      }
      if (previous.view !== 'flow' && !calm()) {
        flow.classList.remove('opening-sheet');
        void flow.offsetWidth;
        flow.classList.add('opening-sheet');
      }
      refreshPreview();
      requestAnimationFrame(() => {
        fitPayee();
        // Arriving on the address step with an address already there (typed before, or remembered): its badge too.
        if (place.view === 'flow' && current === 'payee') revealPayeeKind();
      });
    }
    if (to.view === 'links' && !out.querySelector('section')) {
      // After the bill changed, the links view is its notice. Once the browser has put back the scroll position it
      // kept for this entry (two frames on), the whole notice is brought on screen and its button takes the focus.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const notice = out.querySelector<HTMLElement>('.results-changed');
        if (!notice || linksView.hidden) return;
        // The notice is the whole of this short view: from the top, with the brand above it.
        window.scrollTo({ top: 0, behavior: 'auto' });
        notice.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      }));
    }
    if (to.view === 'links' && previous.view !== 'links' && !calm()) {
      linksView.classList.remove('links-ready-play');
      void linksView.offsetWidth;
      linksView.classList.add('links-ready-play');
    }
    if (!focus) return;
    scrollTop();
    if (to.view === 'flow') titles[to.step].focus({ preventScroll: true });
    else if (to.view === 'links') out.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    else landingView.querySelector<HTMLElement>('h1')?.focus?.({ preventScroll: true });
  };
  type Entry = { [MARK]?: Place; from?: Place | null };
  const entry = (): Entry | null => history.state as Entry | null;
  /** A new entry for a new place, which remembers the place before it when that was one of this screen's own. */
  const visit = (to: Place): void => {
    history.pushState({ [MARK]: to, from: entry()?.[MARK] ?? null }, '');
    render(to);
  };
  const openFlow = (): void => visit({ view: 'flow', step: 'bill' });
  const go = (step: StepId): void => {
    clearError();
    visit({ view: 'flow', step });
  };
  /** Goes to a place the way the browser's Back would when the entry before is that place; otherwise forward to it. */
  const backTo = (to: Place): void => {
    const from = entry()?.from;
    const same = from?.view === to.view && (from.view !== 'flow' || to.view !== 'flow' || from.step === to.step);
    if (same) history.back();
    else visit(to);
  };
  // Back to the landing: the steps stay filled in.
  const leaveFlow = (): void => backTo({ view: 'landing' });
  // The fragment of the page before each move, so a link back to the bill from another screen is told apart
  // from the browser's Back to the landing: both arrive without a state of their own.
  let lastFragment = location.hash.slice(1);
  window.addEventListener('hashchange', () => { lastFragment = location.hash.slice(1); });
  window.addEventListener('popstate', event => {
    const was = lastFragment;
    lastFragment = location.hash.slice(1);
    if (lastFragment !== '') return; // Another screen of the app has the page.
    const to = (event.state as Entry | null)?.[MARK];
    if (!to) {
      // A link to the bill from another screen keeps this screen as it was left, and its entry remembers that view,
      // so coming back to it later shows the same.
      if (was === '') render({ view: 'landing' }, root.isConnected);
      else history.replaceState({ [MARK]: place, from: null }, '');
      return;
    }
    // The links view shows the links, or, after the bill changed, the notice that says so; never an empty page.
    if (to.view === 'links' && !out.firstElementChild) render({ view: 'flow', step: order()[order().length - 1] }, root.isConnected);
    else if (to.view === 'flow' && !order().includes(to.step)) render({ view: 'flow', step: 'people' }, root.isConnected);
    else render(to, root.isConnected);
  });
  // This screen's first entry is the landing. A reload keeps a later entry but not what was typed: start again there.
  history.replaceState({ [MARK]: { view: 'landing' }, from: null }, '');
  close.addEventListener('click', leaveFlow);
  back.addEventListener('click', () => {
    const steps = order();
    const at = steps.indexOf(current);
    if (at === 0) leaveFlow();
    else backTo({ view: 'flow', step: steps[at - 1] });
  });

  // ── Errors: beside the field they are about, on its own step ───────────────
  const errorHome = (target: ErrorTarget): { anchor: HTMLElement; control?: HTMLElement } => {
    const fieldOf = (control: HTMLElement): HTMLElement => control.closest<HTMLElement>('.field') ?? control;
    switch (target.field) {
      case 'payee': return { anchor: fieldOf(payee), control: payee };
      case 'rate': return { anchor: confirmField.hidden ? fieldOf(rate) : confirmField, control: rate };
      case 'total': return { anchor: total.closest<HTMLElement>('.pair') ?? fieldOf(total), control: total };
      case 'label': return { anchor: fieldOf(label), control: label };
      case 'from': return { anchor: from.closest<HTMLElement>('.person-row') ?? from, control: from };
      case 'ownShare': return { anchor: ownShare.closest<HTMLElement>('.person-row') ?? ownShare, control: ownShare };
      case 'count': return { anchor: countRow, control: count };
      case 'personAmount':
      case 'personName': {
        const person = people[target.index];
        return person
          ? { anchor: person.el, control: target.field === 'personAmount' ? person.amount : person.name }
          : { anchor: rows };
      }
      case 'people': return { anchor: rows };
    }
  };
  let marked: HTMLElement | undefined;
  let markedHint: string | null = null;
  const clearError = (): void => {
    error.textContent = '';
    marked?.removeAttribute('aria-invalid');
    // The field's own hint describes it again once the error is gone.
    if (markedHint) marked?.setAttribute('aria-describedby', markedHint);
    else marked?.removeAttribute('aria-describedby');
    marked = undefined;
    markedHint = null;
  };
  const showAt = (message: string, {anchor,control}: {anchor:HTMLElement;control?:HTMLElement}):void=>{
    clearError();
    // The step that holds the field is shown first, so the message is never on a hidden step.
    const step = anchor.closest<HTMLElement>('[data-step]')?.dataset.step as StepId | undefined;
    if (place.view !== 'flow' || (step && step !== current)) {
      if (step) {
        history.replaceState({ [MARK]: { view: 'flow', step }, from: entry()?.from ?? null }, '');
        render({ view: 'flow', step }, false);
      }
    }
    error.textContent = message;
    anchor.after(error);
    if (control) {
      markedHint = control.getAttribute('aria-describedby');
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', markedHint ? `${error.id} ${markedHint}` : error.id);
      marked = control;
      control.focus({ preventScroll: true });
    }
    error.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' });
  };
  const showError = (message:string,target:ErrorTarget):void => showAt(message, errorHome(target));
  const billEdited = (event: Event): void => {
    if (event.target !== keep && event.target !== confirmOld) invalidateResults();
  };
  form.addEventListener('change', billEdited);
  form.addEventListener('input', event => {
    billEdited(event);
    if (marked) {
      clearError();
    }
  });

  /** The steps a field belongs to, for checking a step before moving on. */
  const STEP_OF: Record<ErrorTarget['field'], StepId> = {
    total: 'bill', label: 'bill', from: 'people', payee: 'payee', rate: 'rate',
    ownShare: 'people', count: 'people', people: 'people', personAmount: 'people', personName: 'people',
  };
  /** Checks what this step asks for, and anything before it, as making the links would. True when it may move on. */
  const checkStep = (step: StepId): boolean => {
    clearError();
    const steps = order();
    const upTo = steps.indexOf(step);
    if (step === 'bill' && !splitByItem.checked && total.value.trim() === '') {
      showError('Write the total as a number with at most two decimals, such as 98.00.', { field: 'total' });
      return false;
    }
    if (step === 'items' || (splitByItem.checked && upTo > steps.indexOf('items'))) {
      const items = editor.validate();
      if (items.kind === 'error') { showAt(items.message, editor.errorHome(items)); return false; }
    }
    if (step === 'rate' && !isRate(rate.value.trim())) {
      showError(rate.value.trim() === '' ? 'Fetch the rate, or type one such as 1327.32.' : 'Write the rate as a number such as 1327.32, or fetch it.', { field: 'rate' });
      return false;
    }
    // The rest is the engine's own check, with stand-ins for what later steps will ask for.
    const { form: now, itemTotals } = currentForm();
    const tab = makeTab({
      ...now,
      payee: PREVIEW_PAYEE,
      rate: { ...now.rate, fiatPerZec: isRate(now.rate.fiatPerZec) ? now.rate.fiatPerZec : PREVIEW_RATE },
    });
    if (tab.kind === 'error') {
      // With the stand-in rate the ZEC amounts are not real, so "more ZEC than exists" waits for a real rate.
      if (!isRate(now.rate.fiatPerZec) && tab.message === SUPPLY_ERROR) return true;
      let home = STEP_OF[tab.target.field];
      const fromItems = ['ownShare', 'personAmount', 'people', 'total'].includes(tab.target.field);
      // Split by item: the amounts come from the items, so they are checked on the items step, once there are items.
      if (splitByItem.checked && fromItems && !itemTotals) return true;
      if (itemTotals && fromItems) home = 'items';
      if (steps.indexOf(home) <= upTo && home !== 'payee') {
        if (itemTotals && home === 'items') showAt(tab.message, editor.errorHome({ kind: 'error', field: 'total', message: tab.message }));
        else showError(tab.message, tab.target);
        return false;
      }
    }
    return true;
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const steps = order();
    const at = steps.indexOf(current);
    if (at < steps.length - 1) {
      if (checkStep(current)) go(steps[at + 1]);
      return;
    }
    clearError();
    out.replaceChildren();
    const typed = rate.value.trim();
    const fetched =
      rateState.kind === 'fetched' && rateState.amount === typed && rateState.fiat === fiat.value;
    const source = fetched ? FETCHED_SOURCE : MANUAL_SOURCE;
    const observedAt = rateState.kind === 'none' ? nowUtc() : rateState.observedAt;
    const items = splitByItem.checked ? editor.validate() : undefined;
    if(items?.kind === 'error') { showAt(items.message,editor.errorHome(items)); return; }
    const itemTotals = items?.kind === 'split' ? items : undefined;
    const tab = makeTab({
      itemized: splitByItem.checked,
      createdAt: nowUtc(),
      from: from.value,
      label: label.value,
      payee: payee.value,
      fiat: fiat.value,
      total: itemTotals?.total ?? total.value,
      ownShare: itemTotals?.shares[0].total ?? ownShare.value,
      people: people.map((person,i) => ({ name: person.name.value, amount: itemTotals?.shares[i+1].total ?? person.amount.value })),
      rate: { fiatPerZec: typed, source, observedAt },
    });
    if (tab.kind === 'error') {
      // Item amounts are computed, not editable fixed-amount controls. A positive
      // item share that converts to zero needs attention at the visible rate.
      if (itemTotals && (tab.target.field === 'ownShare' || tab.target.field === 'personAmount')) {
        showError(tab.message, {field: 'rate'});
        return;
      }
      if (itemTotals && tab.target.field === 'total') {
        showAt(tab.message, editor.errorHome({kind: 'error', field: 'total', message: tab.message}));
        return;
      }
      showError(
        isRate(typed) || tab.target.field !== 'rate'
          ? tab.message
          : typed === '' ? 'Fetch the rate, or type one such as 1327.32.' : 'Write the rate as a number such as 1327.32, or fetch it.',
        tab.target,
      );
      return;
    }
    if (fetched && Date.now() - Date.parse(observedAt) > STALE_AFTER_MS && !confirmOld.checked) {
      confirmField.hidden = false;
      showError('The rate is more than 5 minutes old. Fetch it again, or tick the box to use it.', { field: 'rate' });
      return;
    }
    if (keep.checked) {
      const names = people.map(person => person.name.value);
      const saved = remember(payee.value, names);
      const now = look();
      if (saved && now.kind === 'kept') {
        showKept(now.record.address);
        offerNames(now.record.names);
      } else if (now.kind === 'kept') {
        offerNames(now.record.names);
        showKept(now.record.address, 'Could not update. The address and names from before are still remembered.');
      } else if (now.kind === 'none') {
        showKept(undefined, 'Could not remember them. Nothing is kept on this device.');
      } else {
        // The browser refused the read as well, so nothing can be said about what is kept.
        showKept(undefined, 'Could not remember them. Ztab cannot check what is kept on this device. Press Forget them to clear it.', true);
      }
    }
    const edit = h('button', { type: 'button', class: 'secondary' }, 'Edit the bill');
    edit.addEventListener('click', () => go('bill'));
    const made = shareList(tab, label.value.trim(), itemTotals, ['You', ...people.map((p,i)=>p.name.value.trim() || `Person ${i+1}`)], edit);
    out.replaceChildren(made);
    // Move focus to the result so keyboard and screen-reader users land on it.
    made.querySelector('h1')?.setAttribute('tabindex', '-1');
    visit({ view: 'links' });
  });

  invalidateResults = (): void => {
    if (out.querySelector('section')) {
      const again = h('button', { type: 'button', class: 'secondary' }, 'Back to the bill');
      again.addEventListener('click', () => go(order()[order().length - 1]));
      out.replaceChildren(h('div', { class: 'results-changed', role: 'status' }, h('p', {}, 'The bill changed. Make the links again before sharing.'), again));
    }
  };

  showSteps();
  refreshPreview();
  return root;
}

/** Says whether an amount was typed in or is a share of what was left; by item, whether a tip is part of it. */
const shareLabel = (tab: Extract<Tab, { kind: 'tab' }>, fixed: boolean, tipped = true): string =>
  tab.itemized ? (tipped ? 'Items + tip / service' : 'Items') : !tab.someFixed ? 'Share' : fixed ? 'Fixed amount' : 'Share of the rest';

/**
 * The links, first: what you are paid back and Copy all, your own share, then each person's card with their link and
 * QR code. Showing one QR code at the table and keeping track come after, as quieter choices.
 */
function shareList(tab: Extract<Tab, { kind: 'tab' }>, label: string, items: Extract<ItemSplit,{kind:'split'}> | undefined, names: string[], edit: HTMLElement): HTMLElement {
  const base = `${location.origin}${location.pathname}`;
  const money = (amount: string): string => formatFiat(amount, tab.fiat);
  const strip = networkStrip(tab.network);

  const copyAll = copyButton('Copy all', () => copyAllText(tab, label, base));
  copyAll.classList.add('main');
  // By item, a share has a tip part only when a tip was set; the rows are the people with a share, in order.
  const tipped = items ? items.shares.slice(1).filter(share => share.total !== '0.00').map(share => share.tip !== '0.00') : [];
  const ownTipped = items ? items.shares[0].tip !== '0.00' : true;

  const cards = tab.rows.map((person, i) => {
    const url = `${base}#${person.fragment}`;
    const copy = copyButton('Copy link', () => url);
    return hang(h(
      'article',
      { class: 'person' },
      h('h2', {}, person.name),
      row(shareLabel(tab, person.fixed, tipped[i] ?? true), money(person.fiatShare)),
      row('In ZEC', zecFigure(person.zec)),
      // The link itself, short enough to check at a glance: its middle gives way on a narrow card.
      // Selecting it selects the whole link. Copy link and Preview are the ways to use it.
      h('p', { class: 'link-text', 'aria-hidden': 'true', translate: 'no' }, h('span', { class: 'link-start' }, url.slice(0, -8)), h('span', { class: 'link-end' }, url.slice(-8))),
      h('p', { class: 'actions' }, copy,
        shareButton(() => personText(person, tab.fiat, label, base)),
        h('a', { class: 'button secondary', href: url }, 'Preview')),
      // The code stays folded until someone is there to scan it.
      h(
        'details',
        { class: 'code' },
        h('summary', {}, `QR code for ${person.name}`),
        qrSvg(person.uri, `Payment request for ${person.name}`) ??
          h('p', { class: 'warning' }, 'Too long for a QR code. Send the link.'),
      ),
    ), i + 2);
  });

  const tick = h('span', { class: 'ready-mark', 'aria-hidden': 'true' });
  tick.innerHTML = '<svg viewBox="0 0 48 48" focusable="false"><circle cx="24" cy="24" r="22" fill="#F4B728"/><path d="M14.5 24.5l6.5 6.5 13-14" fill="none" stroke="#101216" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // A small burst around the mark when the links are made: twelve sparks, each on its own heading.
  for (let i = 0; i < 12; i++) {
    const spark = h('i', { class: 'ready-spark' });
    spark.style.setProperty('--turn', `${i * 30 + (i % 2) * 12}deg`);
    spark.style.setProperty('--reach', `${i % 3 === 0 ? 3.1 : i % 3 === 1 ? 2.5 : 2.8}rem`);
    tick.append(spark);
  }
  return h(
    'section',
    {},
    h(
      'div',
      { class: 'ready' },
      tick,
      h('p', { class: 'ready-eyebrow' }, 'Links ready'),
      h('h1', {}, 'Send each person their link'),
      h('p', { class: 'ready-lead' }, `Each link opens a standard Zcash payment request (ZIP 321) with your address and their amount. ${tab.rows.length === 1 ? 'One person has a share to pay' : `${tab.rows.length} people have a share to pay`}; yours is already covered.`),
    ),
    h('div', { class: 'ready-summary' },
    strip,
    // The tab's own receipt: the total, the rate it was worked out at, and the one press that serves the group.
    hang(
      h(
        'div',
        { class: 'card summary' },
        h(
          'p',
          { class: 'total' },
          h('small', {}, 'You will be paid back '),
          fiatAmount(money(tab.paidBack)),
          h('small', {}, ` of ${money(tab.total)}.`),
        ),
        h(
          'p',
          { class: 'rate' },
          `1 ZEC = ${money(tab.rate.fiatPerZec)} · ${sourceText(tab.rate.source)} · ${formatUtc(tab.rate.observedAt)}`,
        ),
        tab.rows.length > 0 && h('p', { class: 'actions' }, copyAll),
        tab.rows.length > 0 && h('p', { class: 'note' }, 'Copy all puts every person’s line and link in one message for a group chat.'),
      ),
      0,
    )),
    tab.recipientKind !== 'sapling' && tab.recipientKind !== 'unified' &&
      h('p', { class: 'warning' }, PUBLIC_ADDRESS),
    tab.extraCents.length > 0 &&
      h(
        'p',
        {},
        `${tab.someFixed ? 'What is left' : 'The bill'} does not divide evenly. ${list(tab.extraCents)} ${tab.extraCents.length === 1 && tab.extraCents[0] !== 'You' ? 'pays' : 'pay'} one cent more.`,
      ),
    tab.zeroPeople.length > 0 && h('p', {}, `No payment needed: ${list(tab.zeroPeople)}.`),
    h(
      'div',
      { class: 'cards' },
      hang(
        h(
          'article',
          { class: 'person own' },
          h('h2', {}, 'Your share'),
          h('p', { class: 'stamp' }, 'Already covered'),
          row(shareLabel(tab, tab.own.fixed, ownTipped), money(tab.own.fiatShare)),
          row('In ZEC', zecFigure(tab.own.zec)),
        ),
        1,
      ),
      ...cards,
    ),
    h('h2', { class: 'more-title' }, 'More ways to share'),
    tableInvite(tab),
    organiserInvite(tab),
    items && itemBreakdownView(items,names,tab.fiat),
    h(
      'details',
      { class: 'rounding' },
      h('summary', {}, 'How the amounts are rounded'),
      h(
        'p',
        {},
        'We divide the cents fairly, then round the combined ZEC total up to a whole zatoshi (0.00000001 ZEC). A share can round down or up by less than one zatoshi. Wallet fees are separate.',
      ),
      h(
        'p',
        {},
        tab.extraZatoshis.length > 0
          ? `One extra zatoshi: ${list(tab.extraZatoshis)}.`
          : 'Nobody carries an extra zatoshi on this tab.',
      ),
    ),
    h('p', { class: 'note' }, 'This page cannot see who has paid. Check your wallet.'),
    h('p', { class: 'actions links-edit' }, edit),
  );
}
