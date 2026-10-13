import { Quaternion, Vector3 } from 'three';
import { PLINTH, STATION_X } from './layout.ts';

/** The six people of the example dinner, in the order of their cards, phones and rows. Jonas pays the fixed $20. */
export const PEOPLE = ['lena', 'ana', 'dragan', 'tomas', 'priya', 'jonas'] as const;

export const Y0 = PLINTH.top;
/** The screen's right, on the ground (the camera's azimuth is 45 degrees). */
export const RIGHT = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
export const UP = new Vector3(0, 1, 0);
/** Facing the street, turned a little toward the viewer and tipped back to the light (the pictures' cards are lit). */
export const FACE = new Quaternion().setFromAxisAngle(UP, 0.32).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.22));

/** Station 3's café table: where it stands, its top, its radius. */
export const TABLE = { x: STATION_X[2] + 0.75, z: -1.95, top: Y0 + 1.0, r: 1.0 } as const;

/** Where phone i lies on the café table (round the QR stand), and where the packets run to. */
export function tableSpot(i: number, out = new Vector3()): Vector3 {
  const a = angleOf(i);
  return out.set(TABLE.x + 0.66 * Math.cos(a), TABLE.top + 0.022, TABLE.z + 0.66 * Math.sin(a));
}
/**
 * Phone i's angle round the table: the six on the far half, from the screen's left round the back to its right
 * (135 to 315 degrees), so the front stays open and the QR stand in the middle is never hidden.
 */
export function angleOf(i: number): number {
  return (135 + 36 * i) * (Math.PI / 180);
}

/** Where the gold inlay's stubs meet each station (the receipt, the kiosk window, the table, the vault door, the board). */
export const STUB_X = [-0.3, STATION_X[1] + 0.15, STATION_X[2] + 0.75, STATION_X[3] + 0.1, STATION_X[4] - 0.35] as const;
/** The inlay's line down the street (z), and how far back each stub runs (z). */
export const INLAY_Z = 0.5;
export const STUB_Z = -1.7;

/**
 * How far down the street the story has lit the inlay (x of its head), at progress p: under the cards' flight
 * (1 to 2), the packets (2 to 3), the phones (3 to 4) and the last packet (4 to 5).
 */
export function inlayHead(p: number): number {
  const legs: [number, number, number, number][] = [
    [0.222, 0.272, STUB_X[0], STUB_X[1]],
    [0.392, 0.452, STUB_X[1], STUB_X[2]],
    [0.618, 0.662, STUB_X[2], STUB_X[3]],
    [0.792, 0.832, STUB_X[3], STUB_X[4]],
  ];
  let x = STUB_X[0];
  for (const [a, b, x0, x1] of legs) {
    if (p <= a) return x;
    const t = Math.min(1, (p - a) / (b - a));
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    x = x0 + (x1 - x0) * e;
    if (t < 1) return x;
  }
  return x;
}
/** How lit stub k is at progress p. */
export function stubLit(k: number, p: number): number {
  const at = [0.15, 0.272, 0.452, 0.662, 0.832][k];
  return Math.min(1, Math.max(0, (p - at) / 0.012));
}
