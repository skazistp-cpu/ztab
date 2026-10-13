import { OrthographicCamera, Vector3 } from 'three';
import { inOut, lerp } from './ease.ts';

/*
 * The camera: orthographic, true isometric (azimuth 45, elevation 35.264: the café picture's tile edges run at 30
 * degrees, measured). A path of keys along the scroll; between two keys it eases in and out, the target moving in a
 * straight line and the zoom in equal ratios. A key may turn the view a few degrees about the vertical (a quiet
 * parallax that keeps the isometric look).
 */

export interface Key {
  p: number;
  /** The point of the street it looks at. */
  at: readonly [number, number, number];
  /** How much of the street is in view, top to bottom (tiles). */
  h: number;
  /** Turn about the vertical, degrees (small). */
  az?: number;
  /** Where on the screen the point appears (0 to 1 from the left and from the top); else the layout's default. */
  fx?: number;
  fy?: number;
  /** On a phone (portrait): its own height of view and point, where the wide one does not fit. */
  ht?: number;
  aT?: readonly [number, number, number];
}

const ELEVATION = Math.atan(1 / Math.SQRT2); // 35.264 degrees: true isometric
const AZIMUTH = Math.PI / 4;
const DISTANCE = 70;

/** Wide screens: the station stands right of the middle, the left left clear for the captions. */
export const WIDE: readonly Key[] = [
  // The match cut: the printer's charcoal top fills the screen (under 3% of the scroll), then the camera pulls back.
  { p: 0, at: [-0.3, 2.16, -2.86], h: 0.25, fx: 0.5, fy: 0.5 },
  { p: 0.012, at: [-0.3, 2.16, -2.84], h: 0.42, fx: 0.5, fy: 0.5 },
  // The receipt prints: near, on the desk.
  { p: 0.05, at: [-0.2, 1.85, -2.35], h: 3.3, fx: 0.6, fy: 0.5, az: -2 },
  // The cut: close on the strips hanging from the bar.
  { p: 0.092, at: [-0.28, 1.45, -2.1], h: 2.7, fx: 0.6, fy: 0.5, az: -2.5, ht: 3.6 },
  // The strips rise as a fan toward the viewer and fold into cards: the camera pushes in on them.
  { p: 0.15, at: [-0.05, 2.1, -1.6], h: 3.0, fx: 0.6, fy: 0.5, az: -1.5, ht: 4.6 },
  { p: 0.185, at: [0.0, 2.3, -1.7], h: 2.9, fx: 0.6, fy: 0.5, az: -1, ht: 4.4 },
  // The six cards over the desk.
  { p: 0.215, at: [0.05, 2.45, -1.9], h: 4.4, az: -0.5, ht: 6.2, aT: [0.05, 2.35, -1.9] },
  // Down the street to the link post, the fan of cards over it.
  { p: 0.275, at: [10.1, 2.75, -2.0], h: 6.6, az: 2, ht: 10.6, aT: [10.1, 2.95, -2.0] },
  { p: 0.36, at: [10.1, 2.8, -2.0], h: 6.3, az: 2.5, ht: 10.2, aT: [10.1, 3.0, -2.0] },
  // Following the packets along the inlay.
  { p: 0.425, at: [15.6, 1.3, -1.2], h: 7.4, az: 0.5 },
  { p: 0.47, at: [20.55, 1.55, -1.95], h: 4.9, az: -1.5, ht: 8.4 },
  { p: 0.6, at: [20.6, 1.65, -1.95], h: 4.5, az: -2, ht: 8.0 },
  { p: 0.66, at: [30.0, 1.55, -1.7], h: 5.6, az: 1.5, ht: 9.4 },
  { p: 0.78, at: [30.0, 1.6, -1.7], h: 5.3, az: 2, ht: 9.0 },
  { p: 0.83, at: [39.8, 1.55, -2.1], h: 5.4, az: -1, ht: 9.2 },
  { p: 0.9, at: [39.8, 1.6, -2.1], h: 5.1, az: -1.5, ht: 8.8 },
  { p: 0.97, at: [20.0, 0.8, -1.8], h: 23.5, az: 0, fx: 0.5, fy: 0.5, ht: 17.5, aT: [35.6, 1.3, -2.4] },
  { p: 1, at: [20.0, 0.8, -1.8], h: 23.0, az: 0, fx: 0.5, fy: 0.5, ht: 17, aT: [35.6, 1.3, -2.4] },
];

/** Phones (portrait): closer, the station in the upper part, the bottom 30% left for the caption. */
export const TALL: readonly Key[] = WIDE.map(k => {
  const close = k.h < 1;
  const wide = k.h > 20;
  return {
    ...k,
    at: k.aT ?? k.at,
    h: k.ht ?? (close ? k.h * 1.6 : wide ? k.h * 2.7 : k.h * 1.75),
    fx: 0.5,
    fy: close ? 0.42 : wide ? 0.44 : 0.37,
  };
});

export interface Shot { at: Vector3; h: number; az: number; fx: number; fy: number }

/** The camera's shot at progress p along a path. */
export function shotAt(keys: readonly Key[], p: number, fx0: number, fy0: number, out: Shot): Shot {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i], b = keys[i + 1];
  const t = inOut(Math.min(1, Math.max(0, (p - a.p) / Math.max(1e-6, b.p - a.p))));
  out.at.set(lerp(a.at[0], b.at[0], t), lerp(a.at[1], b.at[1], t), lerp(a.at[2], b.at[2], t));
  out.h = a.h * Math.pow(b.h / a.h, t);
  out.az = lerp(a.az ?? 0, b.az ?? 0, t);
  out.fx = lerp(a.fx ?? fx0, b.fx ?? fx0, t);
  out.fy = lerp(a.fy ?? fy0, b.fy ?? fy0, t);
  return out;
}

const dir = new Vector3();
const right = new Vector3();
const up = new Vector3();
const centre = new Vector3();

/** Points an orthographic camera for a shot on a viewport of the given aspect (width / height). */
export function aim(camera: OrthographicCamera, s: Shot, aspect: number): Vector3 {
  const az = AZIMUTH + (s.az * Math.PI) / 180;
  dir.set(Math.cos(ELEVATION) * Math.sin(az), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(az));
  right.set(Math.cos(az), 0, -Math.sin(az));
  up.crossVectors(dir, right).normalize();
  const h = s.h, w = s.h * aspect;
  centre.copy(s.at).addScaledVector(right, (0.5 - s.fx) * w).addScaledVector(up, (s.fy - 0.5) * h);
  camera.position.copy(centre).addScaledVector(dir, DISTANCE);
  camera.up.copy(up);
  camera.lookAt(centre);
  camera.left = -w / 2;
  camera.right = w / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.near = 1;
  camera.far = DISTANCE * 2.2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return centre;
}
