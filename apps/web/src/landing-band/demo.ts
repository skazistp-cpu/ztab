import { decodeShare, parseUri, zatoshisToZec, type ShareLink } from '../../../../packages/engine/src/index.ts';
import { LANDING_SAMPLE } from '../landing-sample.ts';
import { requestFor } from '../pay.ts';
import { makeTab } from '../tab.ts';

/*
 * The request the band's phone shows: Ana's share of the sample dinner, made by the app's own makeTab from the
 * figures on the opening's ribbon, read back through the engine's link decoder, built into its ZIP 321 request by
 * the pay page's own requestFor, and then read again by the engine's parser, as a wallet reads it. The sheet shows
 * what the parser read, nothing typed by hand. Nothing is requested, stored or sent.
 */

/** Only the engine sees this address (Zcash's test network): the opening's example payee. */
export const BAND_PAYEE = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
/** The tab was made on the Friday evening of the dinner (UTC); the note carries that date. */
export const BAND_MADE_AT = '2026-10-09T19:30:00.000Z';
/** Whose pay page it is. */
export const BAND_PAYER = 'Ana';

export interface DemoRequest {
  /** Ana's share as her link carries it (what the pay page is given). */
  readonly share: ShareLink;
  /** The ZIP 321 request behind "Open in my wallet". */
  readonly uri: string;
  /** What a wallet reads from that request, through the engine's parser. */
  readonly address: string;
  /** The two ends of the address, as the pay page shows them beside the name. */
  readonly addressShort: string;
  /** The amount in ZEC, as the request writes it. */
  readonly zec: string;
  /** The note, decoded from the request's memo. */
  readonly note: string;
}

const utf8OfBase64Url = (text: string): string => {
  const bytes = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes, c => c.charCodeAt(0)));
};

/** The two ends of an address, exactly as pay.ts sets them beside the name. */
export const shortAddress = (address: string): string => `${address.slice(0, 8)}…${address.slice(-8)}`;

let made: DemoRequest | undefined;

/** Ana's request, derived once. Throws if the engine will not make it: the lab's tests catch that before anyone sees it. */
export function demoRequest(): DemoRequest {
  if (made) return made;
  const [, ...friends] = LANDING_SAMPLE.shares;
  const tab = makeTab({
    createdAt: BAND_MADE_AT,
    from: LANDING_SAMPLE.organiser,
    label: LANDING_SAMPLE.label,
    payee: BAND_PAYEE,
    fiat: LANDING_SAMPLE.fiat,
    total: LANDING_SAMPLE.total,
    ownShare: '',
    people: friends.map(share => ({ name: share.name, amount: LANDING_SAMPLE.fixed[share.name] ?? '' })),
    rate: { fiatPerZec: LANDING_SAMPLE.rate, source: 'Manual entry', observedAt: BAND_MADE_AT },
  });
  if (tab.kind !== 'tab') throw new Error(`band: the sample tab was not made (${tab.message})`);
  const row = tab.rows.find(r => r.name === BAND_PAYER);
  if (!row) throw new Error('band: no row for the payer');
  const decoded = decodeShare(row.fragment);
  if (decoded.kind !== 'share') throw new Error(`band: the link did not read back (${decoded.detail})`);
  const request = requestFor(decoded.share);
  if (request.kind !== 'request') throw new Error(`band: no request (${request.detail})`);
  const read = parseUri(request.uri, decoded.share.network);
  if (read.kind !== 'request' || read.payments.length !== 1) throw new Error('band: the request did not parse');
  const [payment] = read.payments;
  if (payment.zatoshis === undefined || payment.memoBase64Url === undefined) throw new Error('band: the request has no amount or note');
  made = {
    share: decoded.share,
    uri: request.uri,
    address: payment.address,
    addressShort: shortAddress(payment.address),
    zec: zatoshisToZec(BigInt(payment.zatoshis)),
    note: utf8OfBase64Url(payment.memoBase64Url),
  };
  return made;
}
