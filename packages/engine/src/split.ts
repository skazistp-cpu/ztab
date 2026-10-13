import { canReceiveMemo, checkAddress, onNetwork } from './address.ts';
import { expandMemo } from './memo.ts';
import { isUtcInstant } from './link.ts';
import { buildUri, memoParam, parseUri, zatoshisToZec } from './zip321.ts';
import type {
  EngineError,
  ParticipantRequest,
  SplitInput,
  SplitOutcome,
} from './types.ts';

// Implements the Tab v1 rate and rounding contract (Jarvis, 2026-10-05):
// split the bill in fiat minor units by largest remainder, convert each share
// at the one fixed rate, round the combined total up to a whole zatoshi, and
// hand the leftover zatoshis out by largest remainder. BigInt throughout.

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
/** Supported bill currencies, each using two decimal places. */
export const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CZK', 'PLN', 'CHF'] as const;
const FIATS: ReadonlySet<string> = new Set(FIAT_CURRENCIES);
const MAX_BILL_MINOR = 1_000_000_000_000n;
const MAX_ZATOSHIS = 2_100_000_000_000_000n;
const ZAT_PER_ZEC = 100_000_000n;
const MAX_PARTICIPANTS = 50;
const points = (s: string): number => [...s].length;

const fail = (error: EngineError): SplitOutcome => ({ kind: 'error', error });

export const ROUNDING_NOTE =
  'We divide the cents fairly, then round the combined ZEC total up to a whole zatoshi. ' +
  'Individual shares can round down or up by less than one zatoshi. Wallet fees are separate.';

/** Removes redundant trailing zeros of the fraction, and the dot when nothing is left. */
export function normalizeDecimal(decimal: string): string {
  if (!decimal.includes('.')) {
    return decimal;
  }
  return decimal.replace(/0+$/, '').replace(/\.$/, '');
}

/** Floors each exact share, then gives one extra unit to the largest remainders, earlier people first on ties. */
function apportion(
  numerators: bigint[],
  denominator: bigint,
  target: bigint,
): { shares: bigint[]; winners: number[] } {
  const shares = numerators.map(n => n / denominator);
  const residuals = numerators.map(n => n % denominator);
  const extra = Number(target - shares.reduce((a, b) => a + b, 0n));
  const winners = residuals
    .map((residual, index) => ({ residual, index }))
    .sort((a, b) =>
      a.residual === b.residual ? a.index - b.index : a.residual > b.residual ? -1 : 1,
    )
    .slice(0, extra)
    .map(r => r.index);
  for (const index of winners) {
    shares[index] += 1n;
  }
  return { shares, winners };
}

const minorToFiat = (minor: bigint): string =>
  `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;

export function split(input: SplitInput): SplitOutcome {
  // The bill.
  const { amount, fiat } = input.total;
  if (!FIATS.has(fiat) || input.fiatDecimals !== 2) {
    return fail({ kind: 'invalid-amount', detail: 'only USD, EUR, GBP, CZK, PLN and CHF with two decimal places are supported' });
  }
  if (typeof amount !== 'string' || amount.length > 32 || !DECIMAL.test(amount)) {
    return fail({ kind: 'invalid-amount', detail: 'the total is not a plain decimal number' });
  }
  const [billWhole, billFrac = ''] = amount.split('.');
  if (billFrac.length > 2) {
    return fail({ kind: 'invalid-amount', detail: 'the total has more than two decimal places' });
  }
  const bill = BigInt(billWhole) * 100n + BigInt(billFrac.padEnd(2, '0'));
  if (bill <= 0n || bill > MAX_BILL_MINOR) {
    return fail({ kind: 'invalid-amount', detail: 'the total must be above zero and at most 10,000,000,000' });
  }

  // The rate.
  const rate = input.rate;
  if (rate.fiat !== fiat) {
    return fail({ kind: 'invalid-rate', detail: 'the rate is in another currency than the total' });
  }
  if (typeof rate.fiatPerZec !== 'string' || rate.fiatPerZec.length > 32 || !DECIMAL.test(rate.fiatPerZec)) {
    return fail({ kind: 'invalid-rate', detail: 'the rate is not a plain decimal number' });
  }
  const fiatPerZec = normalizeDecimal(rate.fiatPerZec);
  const [rateWhole, rateFrac = ''] = fiatPerZec.split('.');
  const rateDigits = BigInt(rateWhole + rateFrac);
  const rateScale = 10n ** BigInt(rateFrac.length);
  if (rateDigits === 0n) {
    return fail({ kind: 'invalid-rate', detail: 'the rate must be above zero' });
  }
  if (typeof rate.source !== 'string' || rate.source.length === 0 || points(rate.source) > 60) {
    return fail({ kind: 'invalid-rate', detail: 'the rate has no source' });
  }
  if (typeof rate.observedAt !== 'string' || !isUtcInstant(rate.observedAt)) {
    return fail({ kind: 'invalid-rate', detail: 'the rate has no valid time' });
  }

  // The people.
  const people = input.participants;
  if (people.length === 0) {
    return fail({ kind: 'no-participants' });
  }
  if (people.length > MAX_PARTICIPANTS) {
    return fail({ kind: 'invalid-participants', detail: 'at most 50 people' });
  }
  const seen = new Set<string>();
  const weights: bigint[] = [];
  for (const person of people) {
    if (typeof person.id !== 'string' || person.id.length === 0 || points(person.id) > 80 || seen.has(person.id)) {
      return fail({ kind: 'invalid-participants', detail: 'every person needs a unique id' });
    }
    seen.add(person.id);
    if (typeof person.label !== 'string' || points(person.label) > 40) {
      return fail({ kind: 'invalid-participants', detail: 'a name is longer than 40 characters' });
    }
    const weight = person.weight ?? 1;
    if (!Number.isSafeInteger(weight) || weight <= 0) {
      return fail({ kind: 'invalid-weight', participantId: person.id });
    }
    weights.push(BigInt(weight));
  }

  // The payee.
  const address = checkAddress(input.recipient);
  if (address.kind === 'error') {
    return fail({ kind: 'invalid-recipient', detail: address.reason });
  }
  if (!onNetwork(address.network, input.network, address.addressKind)) {
    return fail({ kind: 'invalid-recipient', detail: `the address is for ${address.network}` });
  }
  const shielded = canReceiveMemo(address.addressKind);
  if (input.memoTemplate !== undefined && !shielded) {
    return fail({ kind: 'memo-not-allowed', detail: `a ${address.addressKind} address cannot receive a memo` });
  }

  // 1. Fiat shares in minor units.
  const weightSum = weights.reduce((a, b) => a + b, 0n);
  const fiatSplit = apportion(weights.map(w => bill * w), weightSum, bill);

  // 2 and 3. Convert each share, then distribute what the rounded-up total leaves over.
  const q = 100n * rateDigits;
  const totalNumerator = bill * rateScale * ZAT_PER_ZEC;
  const total = (totalNumerator + q - 1n) / q;
  const zatSplit = apportion(fiatSplit.shares.map(f => f * rateScale * ZAT_PER_ZEC), q, total);

  // 4. Nobody may be asked for nothing, and the total must exist.
  for (let i = 0; i < people.length; i++) {
    if (fiatSplit.shares[i] === 0n || zatSplit.shares[i] === 0n) {
      return fail({ kind: 'zero-share', participantId: people[i].id });
    }
  }
  if (total > MAX_ZATOSHIS) {
    return fail({ kind: 'amount-exceeds-supply' });
  }

  // 5. One request per person, read back before it is returned.
  const requests: ParticipantRequest[] = [];
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    const zatoshis = zatSplit.shares[i].toString();
    let memo: string | undefined;
    if (input.memoTemplate !== undefined) {
      memo = expandMemo(input.memoTemplate, person.label, minorToFiat(fiatSplit.shares[i]), fiat, input.createdAt);
      if (memo === undefined) return fail({ kind: 'invalid-memo-date' });
      const bytes = new TextEncoder().encode(memo).length;
      if (bytes > 512) {
        return fail({ kind: 'memo-too-long', participantId: person.id, bytes });
      }
    }
    const built = buildUri({ address: input.recipient, zatoshis, memo }, input.network);
    if (built.kind === 'error') {
      return fail({ kind: 'request-rejected', participantId: person.id, error: built.error });
    }
    const back = parseUri(built.uri, input.network);
    const memoBase64Url = memo === undefined ? undefined : memoParam(memo);
    if (
      back.kind !== 'request' ||
      back.payments.length !== 1 ||
      back.payments[0].address !== input.recipient ||
      back.payments[0].zatoshis !== zatoshis ||
      back.payments[0].memoBase64Url !== memoBase64Url
    ) {
      return fail({ kind: 'request-rejected', participantId: person.id, error: 'parseError' });
    }
    requests.push({
      participantId: person.id,
      fiatShare: minorToFiat(fiatSplit.shares[i]),
      zatoshis,
      zec: zatoshisToZec(zatSplit.shares[i]),
      ...(memo !== undefined && { memo }),
      uri: built.uri,
    });
  }

  return {
    kind: 'split',
    requests,
    recipientKind: address.addressKind,
    rate: { ...rate, fiatPerZec },
    totalZatoshis: total.toString(),
    roundingNote: ROUNDING_NOTE,
    rounding: {
      fiatRemainderParticipantIds: fiatSplit.winners.map(i => people[i].id),
      zatoshiRemainderParticipantIds: zatSplit.winners.map(i => people[i].id),
      rule: 'largest-remainder-total-ceil-v1',
    },
  };
}
