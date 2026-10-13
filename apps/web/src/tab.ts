import {
  canReceiveMemo,
  checkAddress,
  encodeShare,
  split,
  tabMemoTemplate,
  type AddressKind,
  type EngineError,
  type Network,
} from '../../../packages/engine/src/index.ts';
import { formatFiat } from './money.ts';

/** What the person who paid types in. All of it is text. */
export interface TabForm {
  /** Captured once on Make; independent of the rate observation. */
  createdAt: string;
  /** Item mode supplies every amount explicitly; zero means no request. */
  itemized?: boolean;
  from: string;
  label: string;
  payee: string;
  fiat: string;
  total: string;
  /** Your own amount. Empty means you share what is left with the others. */
  ownShare: string;
  /** The other people. An empty name becomes "Person 1"; an empty amount shares what is left. */
  people: Array<{ name: string; amount: string }>;
  rate: { fiatPerZec: string; source: string; observedAt: string };
}

export interface Row {
  name: string;
  /** True when this amount was typed in, false when it is a share of what was left. */
  fixed: boolean;
  fiatShare: string;
  zec: string;
  /** The ZIP-321 request for this person. */
  uri: string;
  /** The part of their link after "#". */
  fragment: string;
}

/** The form control identified by validation, independent of displayed wording or names. */
export type ErrorTarget =
  | { field: 'total' | 'rate' | 'payee' | 'label' | 'from' | 'ownShare' | 'count' | 'people' }
  | { field: 'personAmount' | 'personName'; index: number };

export type Tab =
  | {
      kind: 'tab';
      network: Network;
      recipientKind: AddressKind;
      fiat: string;
      total: string;
      /** What the other people owe together: the bill less your own share. */
      paidBack: string;
      own: { fiatShare: string; zec: string; fixed: boolean };
      /** True when at least one amount was typed in. */
      someFixed: boolean;
      itemized: boolean;
      /** Other people who owe nothing; no zero-value payment is generated. */
      zeroPeople: string[];
      rows: Row[];
      /** Names of the people who carry a leftover cent or zatoshi. "You" is the creator. */
      extraCents: string[];
      extraZatoshis: string[];
      rate: { fiat: string; fiatPerZec: string; source: string; observedAt: string };
    }
  | { kind: 'error'; message: string; target: ErrorTarget };

const AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;

const cents = (amount: string): bigint | undefined => {
  if (!AMOUNT.test(amount)) {
    return undefined;
  }
  const [whole, frac = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
};

const fromCents = (c: bigint): string => `${c / 100n}.${(c % 100n).toString().padStart(2, '0')}`;

const error = (message: string, target: ErrorTarget): Tab => ({ kind: 'error', message, target });

const sentenceList = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function explain(e: EngineError, names: Map<string, string>): string {
  switch (e.kind) {
    case 'invalid-recipient':
      return 'That does not look like a Zcash address. Check it and paste it again.';
    case 'invalid-amount':
      return 'Write the total as a number with at most two decimals, such as 98.00.';
    case 'invalid-rate':
      return 'Write the rate as a number such as 1327.32, or fetch it again.';
    case 'no-participants':
    case 'invalid-participants':
      return 'Add between 1 and 49 other people, with names of at most 40 characters.';
    case 'invalid-weight':
      return `Check the amount for ${names.get(e.participantId) ?? 'one person'}.`;
    case 'zero-share':
      return `This bill is too small to split this way: ${names.get(e.participantId) ?? 'one person'} would owe nothing.`;
    case 'amount-exceeds-supply':
      return 'That is more ZEC than exists. Check the total and the rate.';
    case 'invalid-memo-date':
      return 'Could not record when this tab was made. Check this device’s clock and try again.';
    case 'memo-too-long':
      return 'The label and a name are too long together for a memo. Shorten the label.';
    case 'memo-not-allowed':
    case 'request-rejected':
      return 'Could not build a payment request for this address.';
  }
}

/** Engine errors retain their kind and stable participant ID at the form boundary. */
function engineErrorTarget(e: EngineError): ErrorTarget {
  switch (e.kind) {
    case 'invalid-recipient':
    case 'memo-not-allowed':
    case 'request-rejected':
      return { field: 'payee' };
    case 'invalid-amount':
    case 'amount-exceeds-supply':
      return { field: 'total' };
    case 'invalid-rate':
      return { field: 'rate' };
    case 'memo-too-long':
      return { field: 'label' };
    case 'invalid-memo-date':
      return { field: 'people' };
    case 'no-participants':
    case 'invalid-participants':
      return { field: 'count' };
    case 'invalid-weight':
    case 'zero-share':
      return e.participantId === 'you'
        ? { field: 'ownShare' }
        : { field: 'personAmount', index: Number(e.participantId.slice(1)) - 1 };
  }
}

/** Turns the form into a tab: one share per person and one request per person who owes. */
export function makeTab(form: TabForm): Tab {
  const payee = form.payee.trim();
  const total = cents(form.total.trim());
  if (total === undefined || total === 0n) {
    return error('Write the total as a number with at most two decimals, such as 98.00.', { field: 'total' });
  }

  // A person with an amount owes that amount. Everyone without one shares what
  // is left equally. The engine does the dividing: the weights below only state
  // each share as a part of the bill.
  const money = (c: bigint): string => formatFiat(fromCents(c), form.fiat);
  const people: Array<{ name: string; fixed?: bigint }> = [];
  for (const [i, person] of form.people.entries()) {
    const name = person.name.trim() || `Person ${i + 1}`;
    const text = person.amount.trim();
    const fixed = text === '' ? undefined : cents(text);
    if (text !== '' && (fixed === undefined || (fixed === 0n && !form.itemized))) {
      return error(`Write the amount for ${name} as a number such as 24.50, or leave it empty.`, { field: 'personAmount', index: i });
    }
    people.push({ name, fixed });
  }
  if (people.length === 0) {
    return error('Add at least one other person.', { field: 'count' });
  }
  const ownText = form.ownShare.trim();
  const ownFixed = ownText === '' ? undefined : cents(ownText);
  if (ownText !== '' && (ownFixed === undefined || (ownFixed === 0n && !form.itemized))) {
    return error('Write your own amount as a number such as 24.50, or leave it empty.', { field: 'ownShare' });
  }
  if (form.itemized && (ownFixed === undefined || people.some(p => p.fixed === undefined))) {
    return error('Assign every item before making the links.', { field: 'people' });
  }
  const everyone = [{ name: 'you', fixed: ownFixed }, ...people];
  const fixedPeople = everyone.filter(p => p.fixed !== undefined);
  const openPeople = everyone.filter(p => p.fixed === undefined);
  const fixedSum = fixedPeople.reduce((sum, p) => sum + (p.fixed ?? 0n), 0n);
  const rest = total - fixedSum;
  const named = (group: Array<{ name: string }>): string =>
    group.length > 3 ? `${group.length} people` : sentenceList(group.map(p => p.name));
  if (rest < 0n) {
    const who = named(fixedPeople);
    return error(
      `${who[0].toUpperCase()}${who.slice(1)} ${fixedPeople.length === 1 && fixedPeople[0].name !== 'you' ? 'takes' : 'take'} ${money(fixedSum)} of a ${money(total)} bill.`,
      { field: 'people' },
    );
  }
  if (openPeople.length === 0 && rest !== 0n) {
    return error(
      `The amounts add up to ${money(fixedSum)} and the bill is ${money(total)}. Clear one amount and that person takes the rest.`,
      { field: 'people' },
    );
  }
  if (openPeople.length > 0 && rest === 0n) {
    return error(`The amounts already cover the whole ${money(total)}, so nothing is left for ${named(openPeople)}.`, { field: 'people' });
  }
  const scale = BigInt(openPeople.length || 1);
  const weightOf = (p: { fixed?: bigint }): number => Number(p.fixed === undefined ? rest : p.fixed * scale);
  const ownWeight = weightOf(everyone[0]);
  const others = people.map(p => ({ name: p.name, weight: weightOf(p), fixed: p.fixed !== undefined }));
  // Checked in the order of the form: total, people, then the address.
  const address = checkAddress(payee);
  if (address.kind === 'error') {
    return error('That does not look like a Zcash address. Check it and paste it again.', { field: 'payee' });
  }

  const label = form.label.trim();
  const from = form.from.trim();
  // Limits are in Unicode code points, as the link format counts them.
  if ([...label].length > 80) {
    return error('Shorten what it was for to 80 characters.', { field: 'label' });
  }
  if ([...from].length > 40) {
    return error('Names can be at most 40 characters.', { field: 'from' });
  }
  const longName = others.findIndex(o => [...o.name].length > 40);
  if (longName !== -1) {
    return error('Names can be at most 40 characters.', { field: 'personName', index: longName });
  }
  const names = new Map<string, string>([['you', 'You']]);
  others.forEach((o, i) => names.set(`p${i + 1}`, o.name));
  const shielded = canReceiveMemo(address.addressKind);

  const result = split({
    recipient: payee,
    network: address.network,
    total: { amount: fromCents(total), fiat: form.fiat },
    fiatDecimals: 2,
    participants: [
      { id: 'you', label: from, weight: ownWeight },
      ...others.map((o, i) => ({ id: `p${i + 1}`, label: o.name, weight: o.weight })),
    ].filter(person => !form.itemized || person.weight > 0),
    rate: {
      fiat: form.fiat,
      fiatPerZec: form.rate.fiatPerZec.trim(),
      source: form.rate.source,
      observedAt: form.rate.observedAt,
    },
    createdAt: form.createdAt,
    memoTemplate: shielded ? tabMemoTemplate(label) : undefined,
  });
  if (result.kind === 'error') {
    return error(explain(result.error, names), engineErrorTarget(result.error));
  }

  const own = result.requests.find(r => r.participantId === 'you') ?? {fiatShare: '0.00', zec: '0'};
  const requests = result.requests.filter(r => r.participantId !== 'you');
  const rows: Row[] = [];
  for (const request of requests) {
    const i = Number(request.participantId.slice(1)) - 1;
    const name = names.get(request.participantId) ?? '';
    const encoded = encodeShare({
      network: address.network,
      payee,
      label,
      name,
      from,
      fiatShare: request.fiatShare,
      zatoshis: request.zatoshis,
      rate: result.rate,
      createdAt: form.createdAt,
      memoBrand: 'Ztab',
    });
    if (encoded.kind !== 'fragment') {
      return error(`Could not make a link for ${name}.`, { field: 'personName', index: i });
    }
    rows.push({ name, fixed: others[i].fixed, fiatShare: request.fiatShare, zec: request.zec, uri: request.uri, fragment: encoded.fragment });
  }

  const ownCents = cents(own.fiatShare) ?? 0n;
  return {
    kind: 'tab',
    network: address.network,
    recipientKind: result.recipientKind,
    fiat: form.fiat,
    total: fromCents(total),
    paidBack: fromCents(total - ownCents),
    own: { fiatShare: own.fiatShare, zec: own.zec, fixed: ownFixed !== undefined },
    someFixed: fixedPeople.length > 0,
    itemized: form.itemized === true,
    zeroPeople: others.filter(o => o.weight === 0).map(o => o.name),
    rows,
    extraCents: result.rounding.fiatRemainderParticipantIds.map(id => names.get(id) ?? ''),
    extraZatoshis: result.rounding.zatoshiRemainderParticipantIds.map(id => names.get(id) ?? ''),
    rate: result.rate,
  };
}

/** A short text for a group chat: one line per person who owes. */
export function copyAllText(tab: Extract<Tab, { kind: 'tab' }>, label: string, base: string): string {
  return tab.rows
    .map(r => personText(r, tab.fiat, label, base))
    .join('\n');
}

/** The same per-person message for Copy all and the device's share sheet. */
export function personText(row: Row, fiat: string, label: string, base: string): string {
  const head = label ? `${label}: ` : '';
  return `${head}${row.name} ${row.fiatShare} ${fiat} = ${row.zec} ZEC ${base}#${row.fragment}`;
}
