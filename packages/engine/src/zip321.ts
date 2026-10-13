import { base64urlnopad } from '@scure/base';
import {
  canReceiveMemo,
  checkAddress,
  onNetwork,
  type AddressKind,
  type Network,
} from './address.ts';

/** The rejection reasons shared with the ZecDev ZIP-321 conformance corpus. */
export type Zip321Error =
  | 'invalidBase64'
  | 'memoBytesError'
  | 'transparentMemo'
  | 'zeroValuedTransparentOutput'
  | 'tooManyPayments'
  | 'duplicateParameter'
  | 'recipientMissing'
  | 'invalidAddress'
  | 'unknownRequiredParameter'
  | 'invalidParamIndex'
  | 'amountExceededSupply'
  | 'amountInvalid'
  | 'invalidURI'
  | 'parseError';

export interface Payment {
  /** 0 is the empty paramindex. */
  index: number;
  address: string;
  addressKind: AddressKind;
  /** Zatoshis as an integer string. Absent when the request names no amount. */
  zatoshis?: string;
  /** The memo exactly as written: base64url without padding. */
  memoBase64Url?: string;
  label?: string;
  message?: string;
  /** Unrecognised optional parameters, in order, percent-decoded. */
  other: Array<[string, string]>;
}

export type ParseResult =
  | { kind: 'request'; payments: Payment[] }
  | { kind: 'error'; error: Zip321Error; detail: string };

const MAX_ZATOSHIS = 21_000_000n * 100_000_000n;
const MAX_MEMO_BYTES = 512;
const AMOUNT = /^(\d+)(?:\.(\d{1,8}))?$/;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9+-]*$/;
const PARAM_INDEX = /^[1-9][0-9]{0,3}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
// qchar minus pct-encoded: unreserved, the allowed delimiters, ":" and "@".
const QCHAR = /^[A-Za-z0-9\-._~!$'()*+,;:@]$/;

const fail = (error: Zip321Error, detail: string): ParseResult => ({
  kind: 'error',
  error,
  detail,
});

/** Decodes a qchar string, or returns undefined when a character or escape is illegal. */
function decodeQchars(raw: string): string | undefined {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '%') {
      const pair = raw.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(pair)) {
        return undefined;
      }
      bytes.push(parseInt(pair, 16));
      i += 2;
    } else if (QCHAR.test(c)) {
      bytes.push(c.charCodeAt(0));
    } else {
      return undefined;
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    return undefined;
  }
}

/** Converts a ZIP-321 decimal amount to zatoshis without floating point. */
export function zecToZatoshis(amount: string): bigint | undefined {
  const m = AMOUNT.exec(amount);
  if (!m) {
    return undefined;
  }
  return BigInt(m[1]) * 100_000_000n + BigInt((m[2] ?? '').padEnd(8, '0'));
}

/** Writes zatoshis as the shortest ZIP-321 decimal. */
export function zatoshisToZec(zatoshis: bigint): string {
  const whole = zatoshis / 100_000_000n;
  const frac = (zatoshis % 100_000_000n).toString().padStart(8, '0');
  const trimmed = frac.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : `${whole}`;
}

type Draft = Partial<Omit<Payment, 'index' | 'other'>> & {
  other: Array<[string, string]>;
  seen: Set<string>;
};

/**
 * Strictly parses a ZIP-321 payment request. When `network` is given, every
 * address must belong to it.
 */
export function parseUri(uri: string, network?: Network): ParseResult {
  if (!uri.startsWith('zcash:')) {
    return fail('parseError', 'the URI does not start with "zcash:"');
  }
  const rest = uri.slice('zcash:'.length);
  if (rest.startsWith('//')) {
    return fail('invalidURI', '"zcash://" has an authority component');
  }
  const q = rest.indexOf('?');
  const lead = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? '' : rest.slice(q + 1);

  const drafts = new Map<number, Draft>();
  const draft = (index: number): Draft => {
    let d = drafts.get(index);
    if (!d) {
      d = { other: [], seen: new Set() };
      drafts.set(index, d);
    }
    return d;
  };

  const setAddress = (index: number, address: string): ParseResult | undefined => {
    const check = checkAddress(address);
    if (check.kind === 'error') {
      return fail('invalidAddress', `${check.reason}: ${address.slice(0, 16)}`);
    }
    if (network && !onNetwork(check.network, network, check.addressKind)) {
      return fail('invalidAddress', `address is for ${check.network}, expected ${network}`);
    }
    const d = draft(index);
    d.address = address;
    d.addressKind = check.addressKind;
    return undefined;
  };

  if (lead !== '') {
    const d = draft(0);
    d.seen.add('address');
    const bad = setAddress(0, lead);
    if (bad) {
      return bad;
    }
  }

  if (query !== '') {
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        return fail('parseError', `parameter without "=": ${pair.slice(0, 24)}`);
      }
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const dot = key.indexOf('.');
      const name = dot === -1 ? key : key.slice(0, dot);
      if (!PARAM_NAME.test(name)) {
        return fail('parseError', `illegal parameter name: ${key.slice(0, 24)}`);
      }
      let index = 0;
      if (dot !== -1) {
        const idx = key.slice(dot + 1);
        if (!PARAM_INDEX.test(idx)) {
          return fail('invalidParamIndex', `illegal paramindex: ${idx.slice(0, 12)}`);
        }
        index = parseInt(idx, 10);
      }
      const d = draft(index);
      if (d.seen.has(name)) {
        return fail('duplicateParameter', `${key} occurs more than once`);
      }
      d.seen.add(name);

      if (name === 'address') {
        const bad = setAddress(index, value);
        if (bad) {
          return bad;
        }
      } else if (name === 'amount') {
        const zat = zecToZatoshis(value);
        if (zat === undefined) {
          return fail('amountInvalid', `not a ZIP-321 decimal: ${value.slice(0, 24)}`);
        }
        if (zat > MAX_ZATOSHIS) {
          return fail('amountExceededSupply', `${value.slice(0, 24)} exceeds 21000000 ZEC`);
        }
        d.zatoshis = zat.toString();
      } else if (name === 'memo') {
        if (!BASE64URL.test(value) || value.length % 4 === 1) {
          return fail('invalidBase64', 'memo is not base64url without padding');
        }
        let bytes: Uint8Array;
        try {
          bytes = base64urlnopad.decode(value);
        } catch {
          return fail('invalidBase64', 'memo is not base64url without padding');
        }
        if (bytes.length > MAX_MEMO_BYTES) {
          return fail('memoBytesError', `memo is ${bytes.length} bytes, the limit is 512`);
        }
        d.memoBase64Url = value;
      } else if (name === 'label' || name === 'message') {
        const text = decodeQchars(value);
        if (text === undefined) {
          return fail('invalidURI', `illegal character or escape in ${key}`);
        }
        d[name] = text;
      } else if (name.startsWith('req-')) {
        return fail('unknownRequiredParameter', `unknown required parameter ${name}`);
      } else {
        const text = decodeQchars(value);
        if (text === undefined) {
          return fail('invalidURI', `illegal character or escape in ${key}`);
        }
        d.other.push([name, text]);
      }
    }
  }

  const payments: Payment[] = [];
  for (const index of [...drafts.keys()].sort((a, b) => a - b)) {
    const d = drafts.get(index)!;
    if (d.address === undefined || d.addressKind === undefined) {
      return fail('recipientMissing', `no address for paramindex ${index}`);
    }
    if (!canReceiveMemo(d.addressKind)) {
      if (d.memoBase64Url !== undefined) {
        return fail('transparentMemo', `a ${d.addressKind} address cannot receive a memo`);
      }
      if (d.zatoshis === '0') {
        return fail('zeroValuedTransparentOutput', 'a transparent output cannot be zero');
      }
    }
    payments.push({
      index,
      address: d.address,
      addressKind: d.addressKind,
      ...(d.zatoshis !== undefined && { zatoshis: d.zatoshis }),
      ...(d.memoBase64Url !== undefined && { memoBase64Url: d.memoBase64Url }),
      ...(d.label !== undefined && { label: d.label }),
      ...(d.message !== undefined && { message: d.message }),
      other: d.other,
    });
  }
  return { kind: 'request', payments };
}

export interface RequestParts {
  address: string;
  /** Zatoshis as an integer string. */
  zatoshis: string;
  /** Memo text. Only for recipients that can receive one. */
  memo?: string;
  label?: string;
  message?: string;
}

export type BuildResult =
  | { kind: 'uri'; uri: string }
  | { kind: 'error'; error: Zip321Error; detail: string };

const encodeQchars = (text: string): string =>
  Array.from(new TextEncoder().encode(text), b => {
    const c = String.fromCharCode(b);
    return QCHAR.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }).join('');

/** Memo text as a request carries it: base64url of its UTF-8 bytes, without padding. */
export const memoParam = (text: string): string =>
  base64urlnopad.encode(new TextEncoder().encode(text));

/** Builds a ZIP-321 request for one payment, refusing anything parseUri would reject. */
export function buildUri(parts: RequestParts, network?: Network): BuildResult {
  if (!/^(0|[1-9][0-9]*)$/.test(parts.zatoshis)) {
    return { kind: 'error', error: 'amountInvalid', detail: 'zatoshis must be a whole number' };
  }
  const params = [`amount=${zatoshisToZec(BigInt(parts.zatoshis))}`];
  if (parts.memo !== undefined) {
    params.push(`memo=${memoParam(parts.memo)}`);
  }
  if (parts.label !== undefined) {
    params.push(`label=${encodeQchars(parts.label)}`);
  }
  if (parts.message !== undefined) {
    params.push(`message=${encodeQchars(parts.message)}`);
  }
  const uri = `zcash:${parts.address}?${params.join('&')}`;
  const parsed = parseUri(uri, network);
  return parsed.kind === 'error' ? parsed : { kind: 'uri', uri };
}
