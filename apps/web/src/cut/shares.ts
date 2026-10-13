import { LANDING_SAMPLE } from '../landing-sample.ts';

/** The Z's own cut: 17 across for every 16 down (the right end of the mark's gold bar). */
export const SLANT = 17 / 16;
/** The same cut as a CSS skew: the ribbon leans like the mark. */
export const SKEW = `skewX(${(-Math.atan(SLANT) * 180 / Math.PI).toFixed(3)}deg)`;

/**
 * How long each share's piece is when the six together are `run` long: exactly in proportion to the share.
 * The shares are the engine's split of the sample bill (see landing-sample.ts and its test).
 */
export function pieceLengths(run: number): number[] {
  const total = Number(LANDING_SAMPLE.total);
  return LANDING_SAMPLE.shares.map(share => (run * Number(share.fiatShare)) / total);
}
