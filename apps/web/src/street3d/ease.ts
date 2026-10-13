/** Clamp to [a, b]. */
export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
/** How far p has got through [a, b], 0 to 1. */
export const seg = (p: number, a: number, b: number): number => clamp((p - a) / (b - a));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const inOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const out3 = (t: number): number => 1 - Math.pow(1 - t, 3);
export const in2 = (t: number): number => t * t;
/** Ease out with a small overshoot (a pop). */
export const outBack = (t: number, s = 1.7): number => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
/** A damped bounce after an arrival: 0 at t = 0 and settling to 0. */
export const settle = (t: number, freq = 3, damp = 5): number => Math.sin(t * Math.PI * freq) * Math.exp(-t * damp) * (t > 0 ? 1 : 0);
