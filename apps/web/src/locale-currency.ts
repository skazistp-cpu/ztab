import { FIAT_CURRENCIES } from '../../../packages/engine/src/index.ts';

type Fiat = (typeof FIAT_CURRENCIES)[number];

// Countries that use the euro. The other currencies Ztab offers each belong to the regions listed below.
const EURO = ['AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
const BY_REGION: Record<string, Fiat> = { US: 'USD', GB: 'GBP', CZ: 'CZK', PL: 'PLN', CH: 'CHF', LI: 'CHF', ...Object.fromEntries(EURO.map(region => [region, 'EUR' as const])) };

/**
 * The currency the form starts on, from the language the browser says its user prefers: a first guess the
 * organiser can change. It reads nothing but that setting, stores nothing and asks no server.
 * A region Ztab has no currency for, or a setting that cannot be read, starts on USD as before.
 */
export function startingCurrency(languages: readonly string[] | undefined): Fiat {
  const first = languages?.[0];
  if (!first) return 'USD';
  try {
    const locale = new Intl.Locale(first);
    // "sk" alone says no region; the likely one (SK) is the best guess. "en-GB" says its own.
    const region = locale.region ?? locale.maximize().region;
    return (region && BY_REGION[region]) || 'USD';
  } catch {
    return 'USD';
  }
}
