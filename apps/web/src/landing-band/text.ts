/*
 * The wallet band's two sentences, word for word as approved (the first by the claims review, 13 October 2026; the
 * second as the owner put it, 14 October 2026). Nothing here changes a word: the lines below only say where the first
 * sentence breaks and which words light up.
 */

export const BAND_S1 = 'A wallet that reads the request fills in the address and the amount, and the note if it supports one.';
export const BAND_S2 = 'Tested with Zodl, Zingo, YWallet and Zkool.';

/** What the wallet fills in, in the order it does. */
export type Key = 'address' | 'amount' | 'note';

/** A piece of a line: plain words, words that light gold when their field fills (`key`), or words kept quiet. */
export interface Piece { readonly t: string; readonly key?: Key; readonly quiet?: true }

/**
 * The first sentence as display copy: six lines of at most twenty characters, each phrase that lights up at the start
 * of its own line. Joined with single spaces the lines are BAND_S1 exactly (test/text.test.mjs holds them to it).
 */
export const S1_LINES: readonly (readonly Piece[])[] = [
  [{ t: 'A wallet that reads' }],
  [{ t: 'the request fills in' }],
  [{ t: 'the address', key: 'address' }, { t: ' and' }],
  [{ t: 'the amount', key: 'amount' }, { t: ', and' }],
  [{ t: 'the note', key: 'note' }, { t: ' ' }, { t: 'if it', quiet: true }],
  [{ t: 'supports one.', quiet: true }],
];

/** The wallets of the second sentence, in its order. */
export const WALLETS = ['Zodl', 'Zingo', 'YWallet', 'Zkool'] as const;

/**
 * The second sentence in pieces: plain text, and each wallet's name on its own (it lights and gets its check) with
 * the punctuation that follows it, so a line never breaks between a name's check and its comma.
 */
export const S2_PIECES: readonly (string | { readonly wallet: (typeof WALLETS)[number]; readonly after: string })[] = [
  'Tested with ',
  { wallet: 'Zodl', after: ',' },
  ' ',
  { wallet: 'Zingo', after: ',' },
  ' ',
  { wallet: 'YWallet', after: '' },
  ' and ',
  { wallet: 'Zkool', after: '.' },
];
