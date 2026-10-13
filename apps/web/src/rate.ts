// The optional rate lookup, to the Tab v1 rate contract: Coinbase spot, no
// key, no polling, and no bill, participant, address or link data sent.
import { FIAT_CURRENCIES } from '../../../packages/engine/src/index.ts';

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

export const FETCHED_SOURCE = 'Coinbase spot';
export const MANUAL_SOURCE = 'Manual entry';
export const STALE_AFTER_MS = 5 * 60 * 1000;

/** How a rate's source reads on screen. A typed rate is "entered by hand" everywhere. */
export const sourceText = (source: string): string =>
  source === MANUAL_SOURCE ? 'entered by hand' : source;

/** True for a positive plain decimal of at most 32 characters. */
export function isRate(text: string): boolean {
  return text.length <= 32 && DECIMAL.test(text) && /[1-9]/.test(text);
}

/** Reads Coinbase's spot response. The amount stays the string the provider sent. */
export function readSpot(body: unknown, fiat: string): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const { base, currency, amount } = data as Record<string, unknown>;
  if (base !== 'ZEC' || currency !== fiat || typeof amount !== 'string' || !isRate(amount)) {
    return undefined;
  }
  return amount;
}

/** Fetches one spot price. Resolves to undefined on any failure; never throws. */
export async function fetchSpot(fiat: string): Promise<string | undefined> {
  if (!FIAT_CURRENCIES.some(code => code === fiat)) {
    return undefined;
  }
  const url = `https://api.coinbase.com/v2/prices/ZEC-${fiat}/spot`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: abort.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    return readSpot(await response.json(), fiat);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The current time as the contract's canonical UTC form. */
export const nowUtc = (): string => new Date().toISOString();
