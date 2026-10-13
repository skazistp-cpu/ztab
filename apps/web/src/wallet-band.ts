// The wallet band's entry for the opening: a chunk of its own (wallet-band-*.js and .css), asked for when the band comes
// near (landing-sections.ts walletBand), so a visit that never gets that far fetches none of it.
export { mountWalletBand, renderWalletBandStatic, type BandHandle } from './landing-band/index.ts';
