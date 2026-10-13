import { formatFiat } from './money.ts';

/**
 * Bills for the opening's ticker. Each share is the engine's equal split of the total between everyone at the table,
 * to the cent; test/landing-ticker.test.ts works every one out again with makeTab and checks the lines word for word.
 * They are examples: nothing is requested, stored or sent.
 */
export interface TickerItem {
  readonly label: string;
  /** Everyone who shares the bill, the person who paid included. */
  readonly people: number;
  readonly fiat: string;
  /** What each of them pays. */
  readonly each: string;
  readonly total: string;
  /** How the count reads: a team dinner counts people, the other bills count friends. */
  readonly noun: 'people' | 'friends';
}

export const TICKER: readonly TickerItem[] = [
  { label: 'Team dinner', people: 6, noun: 'people', fiat: 'USD', total: '300.00', each: '50.00' },
  { label: 'Pizza night', people: 4, noun: 'friends', fiat: 'USD', total: '73.60', each: '18.40' },
  { label: 'Ski trip', people: 5, noun: 'friends', fiat: 'EUR', total: '1060.00', each: '212.00' },
  { label: 'Birthday', people: 8, noun: 'friends', fiat: 'GBP', total: '196.00', each: '24.50' },
  { label: 'Brunch', people: 3, noun: 'friends', fiat: 'EUR', total: '81.90', each: '27.30' },
  { label: 'Concert tickets', people: 2, noun: 'friends', fiat: 'USD', total: '129.00', each: '64.50' },
];

/** One bill as the ticker says it, with the app's own money formatting: "Pizza night · 4 friends · $18.40 each". */
export const tickerLine = (item: TickerItem): string =>
  `${item.label} · ${item.people} ${item.noun} · ${formatFiat(item.each, item.fiat)} each`;
