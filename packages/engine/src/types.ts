// The engine's public contract for split(). Proposed by Maximus, owned by Lagertha.
// Pure functions only: no network, no keys, no clock (the app supplies the rate).
// parseUri and buildUri are implemented in zip321.ts and carry their own types.
// split() is implemented in split.ts to the Tab v1 rate and rounding contract.

import type { AddressKind, Network } from './address.ts';
import type { Zip321Error } from './zip321.ts';

/** An exchange rate supplied by the app. The engine never fetches one. */
export interface Rate {
  /** ISO 4217 code, e.g. "USD". */
  fiat: string;
  /** Fiat units per 1 ZEC, as a decimal string, e.g. "1327.32". */
  fiatPerZec: string;
  /** Where the rate came from, e.g. "CoinGecko simple/price". Shown to users. */
  source: string;
  /** When the rate was observed, ISO 8601 UTC. Shown to users. */
  observedAt: string;
}

export interface Participant {
  id: string;
  label: string;
  /** Relative weight for unequal splits: a positive whole number. Defaults to 1. */
  weight?: number;
}

export interface SplitInput {
  /** The organiser's address that every request pays. The engine checks its prefix, network and checksum. */
  recipient: string;
  /** The network the recipient must belong to. */
  network: Network;
  /** The bill total in fiat, as a decimal string. */
  total: { amount: string; fiat: string };
  /** Decimal places of the fiat currency's minor unit: 2 for USD and EUR, 0 for JPY. */
  fiatDecimals: number;
  participants: Participant[];
  rate: Rate;
  /** UTC creation instant supplied by the app, separate from rate time. Required for {date}. */
  createdAt?: string;
  /** Optional shielded memo: {label}, {share} (fiat amount), {date} (UTC day); {{ and }} escape braces. At most 512 UTF-8 bytes after expansion. */
  memoTemplate?: string;
}

export interface ParticipantRequest {
  participantId: string;
  /** This person's share in fiat after the rounding rule, as a decimal string. */
  fiatShare: string;
  /** The exact amount requested, in zatoshis, as an integer string. */
  zatoshis: string;
  /** The same amount as the ZEC decimal written into the URI (at most 8 places). */
  zec: string;
  memo?: string;
  /** A ZIP-321 single-payment URI. */
  uri: string;
}

export interface SplitResult {
  kind: 'split';
  requests: ParticipantRequest[];
  /** What the recipient address is; the app warns when it is transparent. */
  recipientKind: AddressKind;
  rate: Rate;
  totalZatoshis: string;
  /** Plain-language statement of the rounding rule that was applied, for display. */
  roundingNote: string;
  /** Who received a leftover cent or zatoshi, so the app can name them. */
  rounding: {
    fiatRemainderParticipantIds: string[];
    zatoshiRemainderParticipantIds: string[];
    rule: 'largest-remainder-total-ceil-v1';
  };
}

export type EngineError =
  | { kind: 'invalid-recipient'; detail: string }
  | { kind: 'invalid-amount'; detail: string }
  | { kind: 'invalid-rate'; detail: string }
  | { kind: 'invalid-weight'; participantId: string }
  | { kind: 'invalid-memo-date' }
  | { kind: 'memo-too-long'; participantId: string; bytes: number }
  | { kind: 'memo-not-allowed'; detail: string }
  | { kind: 'zero-share'; participantId: string }
  | { kind: 'amount-exceeds-supply' }
  | { kind: 'no-participants' }
  | { kind: 'invalid-participants'; detail: string }
  | { kind: 'request-rejected'; participantId: string; error: Zip321Error };

export type SplitOutcome = SplitResult | { kind: 'error'; error: EngineError };

export interface Engine {
  split(input: SplitInput): SplitOutcome;
}
