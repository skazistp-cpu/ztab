/**
 * The figures on the opening's ribbon: the engine's own split of a 300.00 USD dinner at 1 ZEC = 1,229.06 USD
 * (the rate in our short film). Lena paid the bill, so her own share is already covered; Jonas had only the soup
 * and owes a fixed 20.00; the rest is split equally. A test checks every figure against `makeTab`.
 * The picture shows them; nothing is requested, stored or sent.
 */
export interface SampleShare {
  readonly name: string;
  /** The organiser's own share: already covered, so it has no link. */
  readonly own: boolean;
  readonly fiatShare: string;
  readonly zec: string;
  /** An example link, cut in the middle as the picture shows it (the same as cut/plan.ts). Made-up characters: it opens nothing. */
  readonly link: string;
}

export const LANDING_SAMPLE = {
  label: 'Dinner, Friday',
  fiat: 'USD',
  rate: '1229.06',
  total: '300.00',
  organiser: 'Lena',
  /** The organiser first, then the five friends who are each sent a link, in the order of the ribbon. */
  shares: [
    { name: 'Lena', own: true, fiatShare: '56.00', zec: '0.04556328', link: '' },
    { name: 'Ana', own: false, fiatShare: '56.00', zec: '0.04556328', link: 'ztab.sebrona.com/#s3.Qm8k…f2Za' },
    { name: 'Dragan', own: false, fiatShare: '56.00', zec: '0.04556328', link: 'ztab.sebrona.com/#s3.Lr4d…9wPe' },
    { name: 'Tomás', own: false, fiatShare: '56.00', zec: '0.04556327', link: 'ztab.sebrona.com/#s3.Xb7n…kT3s' },
    { name: 'Priya', own: false, fiatShare: '56.00', zec: '0.04556327', link: 'ztab.sebrona.com/#s3.Hc2v…Yq6m' },
    { name: 'Jonas', own: false, fiatShare: '20.00', zec: '0.0162726', link: 'ztab.sebrona.com/#s3.Nf9t…a1Rd' },
  ] as readonly SampleShare[],
  /** Jonas's share is a fixed amount; the others split the rest. */
  fixed: { Jonas: '20.00' } as Readonly<Record<string, string>>,
} as const;
