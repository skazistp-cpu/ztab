import { base64urlnopad } from '@scure/base';
import { checkAddress, onNetwork, type Network } from './address.ts';

/** The exchange rate a tab was made with. The engine never fetches one. */
export interface LinkRate {
  /** ISO 4217 code, e.g. "USD". */
  fiat: string;
  /** Fiat units per 1 ZEC as a plain decimal string. Never rounded, never a Number. */
  fiatPerZec: string;
  /** Where the rate came from, shown to users. */
  source: string;
  /** When the rate was observed, ISO 8601 UTC. */
  observedAt: string;
}

/** What one person's link carries: their share and nothing about the others. */
export interface ShareLink {
  network: Network;
  /** The address every share pays. */
  payee: string;
  /** What the tab was for. May be empty. */
  label: string;
  /** Who this share belongs to. May be empty. */
  name: string;
  /** Who made the tab and is being paid. May be empty. */
  from: string;
  /** This person's share in fiat, as a decimal string. */
  fiatShare: string;
  /** The amount requested, fixed when the tab was made, in zatoshis. */
  zatoshis: string;
  rate: LinkRate;
  /** Present in v2: the tab creation instant, never inferred from the exchange rate. */
  createdAt?: string;
  /** Explicit v3 suffix; absence preserves the v1/v2 request. */
  memoBrand?: 'Ztab';
}

export type LinkError =
  | 'not-a-tab-link'
  | 'unsupported-version'
  | 'damaged'
  | 'invalid-field'
  | 'invalid-address'
  | 'amounts-disagree';

export type DecodeResult =
  | { kind: 'share'; share: ShareLink }
  | { kind: 'error'; error: LinkError; detail: string };

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const FIAT_AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;
const WHOLE = /^(0|[1-9][0-9]*)$/;
const FIAT = /^[A-Z]{3}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ZAT_PER_ZEC = 100_000_000n;
const MAX_ZATOSHIS = 21_000_000n * ZAT_PER_ZEC;
// Limits are in Unicode code points for text and in characters for decimals.
const LIMITS = { label: 80, name: 40, source: 60, decimal: 32 };
const points = (s: string): number => [...s].length;

/** True for a real UTC instant; JavaScript alone would turn 31 February into 3 March. */
export function isUtcInstant(text: string): boolean {
  if (!UTC.test(text)) {
    return false;
  }
  const time = Date.parse(text);
  if (Number.isNaN(time)) {
    return false;
  }
  return new Date(time).toISOString().slice(0, 19) === text.slice(0, 19);
}

const bad = (error: LinkError, detail: string): DecodeResult => ({
  kind: 'error',
  error,
  detail,
});

const isPositiveDecimal = (s: string): boolean =>
  s.length <= LIMITS.decimal && DECIMAL.test(s) && /[1-9]/.test(s);

function fieldError(s: ShareLink): string | undefined {
  if (s.network !== 'main' && s.network !== 'test' && s.network !== 'regtest') {
    return 'network';
  }
  if (typeof s.label !== 'string' || points(s.label) > LIMITS.label) return 'label';
  if (typeof s.name !== 'string' || points(s.name) > LIMITS.name) return 'name';
  if (typeof s.from !== 'string' || points(s.from) > LIMITS.name) return 'from';
  if (typeof s.fiatShare !== 'string' || s.fiatShare.length > LIMITS.decimal || !FIAT_AMOUNT.test(s.fiatShare) || !/[1-9]/.test(s.fiatShare)) {
    return 'fiatShare';
  }
  if (typeof s.zatoshis !== 'string' || !WHOLE.test(s.zatoshis) || s.zatoshis === '0' || s.zatoshis.length > 16 || BigInt(s.zatoshis) > MAX_ZATOSHIS) {
    return 'zatoshis';
  }
  if (s.memoBrand !== undefined && (s.memoBrand !== 'Ztab' || s.createdAt === undefined)) return 'memoBrand';
  if (s.createdAt !== undefined && (typeof s.createdAt !== 'string' || !isUtcInstant(s.createdAt))) return 'createdAt';
  const r = s.rate;
  if (typeof r !== 'object' || r === null) return 'rate';
  if (typeof r.fiat !== 'string' || !FIAT.test(r.fiat)) return 'rate.fiat';
  if (typeof r.fiatPerZec !== 'string' || !isPositiveDecimal(r.fiatPerZec)) return 'rate.fiatPerZec';
  if (typeof r.source !== 'string' || r.source.length === 0 || points(r.source) > LIMITS.source) {
    return 'rate.source';
  }
  if (typeof r.observedAt !== 'string' || !isUtcInstant(r.observedAt)) {
    return 'rate.observedAt';
  }
  return undefined;
}

/** Writes one person's share as the part of a link that follows "#". */
export function encodeShare(share: ShareLink): DecodeResult | { kind: 'fragment'; fragment: string } {
  const checked = validate(share);
  if (checked.kind === 'error') {
    return checked;
  }
  const s = checked.share;
  // A fixed field order keeps the link stable for the same tab.
  const compact = [
    s.network,
    s.payee,
    s.label,
    s.name,
    s.from,
    s.fiatShare,
    s.zatoshis,
    s.rate.fiat,
    s.rate.fiatPerZec,
    s.rate.source,
    s.rate.observedAt,
  ];
  const version = s.memoBrand === 'Ztab' ? 3 : s.createdAt === undefined ? 1 : 2;
  if (s.createdAt !== undefined) compact.push(s.createdAt);
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  return { kind: 'fragment', fragment: `s${version}.` + base64urlnopad.encode(bytes) };
}

/** Digits and scale of a plain decimal: "24.5" is 245 over 10. */
const fraction = (decimal: string): { digits: bigint; scale: bigint } => {
  const [whole, frac = ''] = decimal.split('.');
  return { digits: BigInt(whole + frac), scale: 10n ** BigInt(frac.length) };
};

/**
 * True when the zatoshis are the fiat share converted at the rate and rounded
 * down or up to a whole zatoshi, which is all the rounding rule allows a share.
 */
function amountsAgree(s: ShareLink): boolean {
  const fiat = fraction(s.fiatShare);
  const rate = fraction(s.rate.fiatPerZec);
  const numerator = fiat.digits * rate.scale * ZAT_PER_ZEC;
  const denominator = fiat.scale * rate.digits;
  const floor = numerator / denominator;
  const zatoshis = BigInt(s.zatoshis);
  return zatoshis === floor || (numerator % denominator !== 0n && zatoshis === floor + 1n);
}

function validate(share: ShareLink): DecodeResult {
  const field = fieldError(share);
  if (field) {
    return bad('invalid-field', field);
  }
  if (!amountsAgree(share)) {
    return bad('amounts-disagree', 'the ZEC amount is not the share at the stated rate');
  }
  const address = checkAddress(share.payee);
  if (address.kind === 'error') {
    return bad('invalid-address', address.reason);
  }
  if (!onNetwork(address.network, share.network, address.addressKind)) {
    return bad('invalid-address', `address is for ${address.network}`);
  }
  return { kind: 'share', share };
}

/**
 * Reads the part of a link that follows "#". It rejects malformed and
 * unsupported links, and links whose ZEC amount is not the stated share at the
 * stated rate. A link is not signed: a well-formed link with another address,
 * or another share and rate that agree, is accepted, so the app shows them for
 * the payer to check.
 */
export function decodeShare(fragment: string): DecodeResult {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const m = /^s(\d+)\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m) {
    return bad('not-a-tab-link', 'the link has no tab in it');
  }
  const version = Number(m[1]);
  if (version !== 1 && version !== 2 && version !== 3) {
    return bad('unsupported-version', `version ${m[1]}`);
  }
  let fields: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      base64urlnopad.decode(m[2]),
    );
    fields = JSON.parse(text);
  } catch {
    return bad('damaged', 'the link is cut short or malformed');
  }
  if (!Array.isArray(fields) || fields.length !== (version === 1 ? 11 : 12) || fields.some(f => typeof f !== 'string')) {
    return bad('damaged', 'the link is cut short or malformed');
  }
  const [network, payee, label, name, from, fiatShare, zatoshis, fiat, fiatPerZec, source, observedAt, createdAt] =
    fields as string[];
  return validate({
    network: network as Network,
    payee,
    label,
    name,
    from,
    fiatShare,
    zatoshis,
    rate: { fiat, fiatPerZec, source, observedAt },
    ...(version >= 2 ? { createdAt } : {}),
    ...(version === 3 ? { memoBrand: 'Ztab' as const } : {}),
  });
}
