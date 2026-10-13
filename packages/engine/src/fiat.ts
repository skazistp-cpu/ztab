// Text formatting only; money arithmetic remains in split().

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€' };

/** "24.50" in USD as "$24.50". Groups thousands, keeps the decimals as written. */
export function formatFiat(amount: string, fiat: string): string {
  const [whole, frac] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = frac === undefined ? grouped : `${grouped}.${frac}`;
  return SYMBOL[fiat] ? `${SYMBOL[fiat]}${text}` : `${text} ${fiat}`;
}

