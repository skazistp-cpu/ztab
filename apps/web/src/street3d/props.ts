import { BoxGeometry, CylinderGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, SphereGeometry, Vector2, Vector3, type BufferGeometry } from 'three';
import { C } from './palette.ts';
import { at, frameXY, leaf, mul, part, Pat, slabXY, type Sink, type Paint, CREASE } from './geo.ts';

/*
 * The street's furniture, modelled after Jarvis's prop sheets (prop-lamp, prop-bench, prop-plant) and the café picture
 * (the A-frame sign, the string lights). Each adds itself to a Mesher at a transform; sizes are in tiles (1 = a tile).
 */

const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 16): BufferGeometry => new CylinderGeometry(r1, r0, h, seg);

/** Where the bulbs are, for the halos and the lamps uniform; `sway` as the shader moves them (amplitude, pivot height,
 *  phase), so their halos follow; `near` the street lamp a window follows by day. */
export interface Bulb { pos: Vector3; lamp: number; size: number; sway?: readonly [number, number, number]; near?: number }

/** Where a hanging thing has swayed to (the same sums as the shader's, for halos). */
export function swayed(b: Bulb, t: number, out: Vector3): Vector3 {
  out.copy(b.pos);
  if (!b.sway) return out;
  const [a, pivot, ph] = b.sway;
  const d = a * (pivot > 0 ? Math.max(0, pivot - b.pos.y) : 1);
  out.x += d * Math.sin(t * 1.7 + ph);
  out.z += d * 0.6 * Math.sin(t * 1.3 + ph * 1.3);
  return out;
}

/**
 * A street lamp (prop-lamp): a stepped charcoal base with a gold foot, a gold collar, a tall charcoal pole with a gold
 * ball on top, an arm, and a gold shade over a bulb. `facing` turns the arm (radians about Y; 0 = toward +X).
 */
export function lamp(m: Sink, base: Matrix4, lampIndex: number, facing = 0, height = 3.3): Bulb {
  const coal = part();
  const goldP = part();
  const g = (mat: Matrix4): Matrix4 => mul(base, mat);
  // The foot: a gold band, then a tapered charcoal block.
  m.add(box(0.5, 0.07, 0.5), g(at(0, 0.035, 0)), { color: C.gold, part: goldP, crease: true });
  m.add(cyl(0.3, 0.2, 0.36, 4), g(at(0, 0.07 + 0.18, 0, 0, Math.PI / 4)), { color: C.coal, part: coal, crease: true, flat: true });
  m.add(cyl(0.1, 0.1, 0.07, 16), g(at(0, 0.465, 0)), { color: C.gold, part: goldP, crease: true });
  m.add(cyl(0.065, 0.065, height - 0.5, 14), g(at(0, 0.5 + (height - 0.5) / 2, 0)), { color: C.coal, part: coal });
  m.add(cyl(0.08, 0.08, 0.05, 16), g(at(0, height + 0.02, 0)), { color: C.gold, part: goldP, crease: true });
  m.add(new SphereGeometry(0.11, 12, 8), g(at(0, height + 0.14, 0)), { color: C.gold, part: goldP });
  // The arm, its gold collar where it meets the pole, the drop and the shade.
  const arm = mul(base, at(0, 0, 0, 0, facing, 0));
  const ga = (mat: Matrix4): Matrix4 => mul(arm, mat);
  const armY = height - 0.32;
  const reach = 0.72;
  m.add(cyl(0.075, 0.075, 0.05, 14), ga(at(0.06, armY, 0, 0, 0, Math.PI / 2)), { color: C.gold, part: goldP, crease: true });
  m.add(box(reach, 0.06, 0.06), ga(at(reach / 2 + 0.06, armY, 0)), { color: C.coal, part: coal, crease: true });
  // The head hangs from the arm's end and sways a little, like a pendulum.
  const pivotY = new Vector3(reach, armY - 0.02, 0).applyMatrix4(arm).y;
  const hang: readonly [number, number, number, number] = [0.05, pivotY, lampIndex * 1.9, 1];
  m.add(cyl(0.022, 0.022, 0.2, 8), ga(at(reach, armY - 0.12, 0)), { color: C.coal, part: coal, sway: hang });
  m.add(cyl(0.07, 0.06, 0.1, 12), ga(at(reach, armY - 0.26, 0)), { color: C.coal, part: coal, crease: true, sway: hang });
  const shade = new LatheGeometry([new Vector2(0.05, 0.12), new Vector2(0.13, 0.1), new Vector2(0.2, 0.04), new Vector2(0.23, -0.04), new Vector2(0.22, -0.06)], 20);
  m.add(shade, ga(at(reach, armY - 0.38, 0)), { color: C.gold, part: part(), crease: true, sway: hang });
  const bulbAt = new Vector3(reach, armY - 0.48, 0).applyMatrix4(arm);
  m.add(new SphereGeometry(0.11, 12, 8), at(bulbAt.x, bulbAt.y, bulbAt.z), { color: C.bulbOff, part: part(), pat: Pat.Bulb, param: lampIndex, noShadow: true, sway: hang });
  return { pos: bulbAt, lamp: lampIndex, size: 0.75, sway: [hang[0], hang[1], hang[2]] };
}

/** A bench (prop-bench): charcoal frame with gold feet and caps, three cream seat slats and two back slats. Faces +Z. */
export function bench(m: Sink, base: Matrix4, len = 1.7): void {
  const frame = part();
  const slats = part();
  const g = (mat: Matrix4): Matrix4 => mul(base, mat);
  const d = 0.62, seat = 0.46, back = 1.0, leg = 0.075;
  for (const sx of [-1, 1]) {
    const x = sx * (len / 2 - 0.04);
    // Front and back legs, the back one rising into the back post; gold feet.
    m.add(box(leg, seat, leg), g(at(x, seat / 2, d / 2 - 0.05)), { color: C.coal, part: frame, crease: true });
    m.add(box(leg, back, leg), g(at(x, back / 2, -d / 2 + 0.05)), { color: C.coal, part: frame, crease: true });
    m.add(box(leg + 0.012, 0.07, leg + 0.012), g(at(x, 0.035, d / 2 - 0.05)), { color: C.gold, part: part(), crease: true });
    m.add(box(leg + 0.012, 0.07, leg + 0.012), g(at(x, 0.035, -d / 2 + 0.05)), { color: C.gold, part: part(), crease: true });
    m.add(new SphereGeometry(0.05, 8, 6), g(at(x, back + 0.03, -d / 2 + 0.05)), { color: C.gold, part: part() });
    // Armrest and the rail under the seat.
    m.add(box(leg, 0.06, d - 0.02), g(at(x, seat + 0.24, 0)), { color: C.coal, part: frame, crease: true });
    m.add(box(leg, 0.24, leg * 0.8), g(at(x, seat + 0.12, d / 2 - 0.05)), { color: C.coal, part: frame, crease: true });
    m.add(box(leg * 0.8, 0.05, d - 0.08), g(at(x, seat - 0.05, 0)), { color: C.coal, part: frame, crease: true });
  }
  m.add(box(len - 0.06, 0.05, 0.05), g(at(0, seat - 0.05, d / 2 - 0.05)), { color: C.coal, part: frame, crease: true });
  for (let k = 0; k < 3; k++) {
    const z = -d / 2 + 0.13 + k * ((d - 0.2) / 2.2);
    m.add(box(len - 0.12, 0.05, 0.15), g(at(0, seat + 0.02, z)), { color: C.paper, side: C.cream, part: slats + 0 * k, crease: true });
  }
  for (let k = 0; k < 2; k++) {
    m.add(box(len - 0.14, 0.17, 0.035), g(at(0, seat + 0.27 + k * 0.24, -d / 2 + 0.04)), { color: C.paper, side: C.cream, part: part(), crease: true });
  }
}

/** A faceted pot with leaves (prop-plant). `size` scales it; `phase` desynchronises its sway. */
export function plant(m: Sink, base: Matrix4, size = 1, phase = 0): void {
  const potP = part();
  const g = (mat: Matrix4): Matrix4 => mul(base, mat);
  const profile = [new Vector2(0.001, 0), new Vector2(0.2, 0), new Vector2(0.29, 0.2), new Vector2(0.29, 0.34), new Vector2(0.255, 0.5), new Vector2(0.21, 0.5), new Vector2(0.2, 0.44)];
  const pot = new LatheGeometry(profile, 8);
  m.add(pot, g(at(0, 0, 0, 0, 0.2, 0, size)), { color: C.pot, part: potP, flat: true });
  // The soil, dark, just below the rim.
  m.add(cyl(0.2, 0.2, 0.02, 8), g(at(0, 0.44 * size, 0, 0, 0.2, 0, size)), { color: C.coalDeep, part: potP, flat: true });
  const rootY = new Vector3(0, 0.44 * size, 0).applyMatrix4(base).y;
  // Leaves: dark ones and lighter ones, fanned around, each leaning out.
  const leaves: [number, number, number, number, number][] = [
    // [turn about Y, lean out, length, width, colour index]
    [0.2, 0.32, 0.95, 0.24, 0],
    [2.3, 0.42, 0.85, 0.22, 1],
    [4.1, 0.38, 0.9, 0.24, 0],
    [1.2, 0.6, 0.75, 0.22, 2],
    [3.3, 0.66, 0.72, 0.2, 1],
    [5.3, 0.62, 0.78, 0.22, 2],
    [0.8, 0.05, 1.0, 0.2, 1],
  ];
  const colours = [C.leafDark, C.leafMid, C.leafLight];
  for (const [turn, lean, len, wid, ci] of leaves) {
    const blade = leaf(len * size, wid * size, lean * 0.6, 0.38);
    // Stand the blade up, lean it out, turn it about the stem.
    const mat = g(at(0, 0.42 * size, 0, 0, turn, 0));
    const tilt = at(0, 0, 0, lean, 0, 0);
    m.add(blade, mul(mat, tilt), { color: colours[ci], part: part(), crease: false, sway: [0.03 / size, rootY, phase + turn] });
  }
}

/** An A-frame sign (the café picture): a blank cream board in a charcoal frame on gold feet. Faces +Z. */
export function aframe(m: Sink, base: Matrix4): void {
  const frame = part();
  const g = (mat: Matrix4): Matrix4 => mul(base, mat);
  const h = 1.05, w = 0.62, splay = 0.24;
  for (const side of [1, -1]) {
    // Each board hinges at the top and spreads its foot away from the other.
    const leanM = mul(g(at(0, h, 0)), mul(at(0, 0, 0, side * splay, 0, 0), at(0, -h, 0)));
    const lg = (mat: Matrix4): Matrix4 => mul(leanM, mat);
    const zOff = side * 0.03;
    for (const sx of [-1, 1]) {
      m.add(box(0.06, h, 0.05), lg(at(sx * (w / 2), h / 2, zOff)), { color: C.coal, part: frame, crease: true });
      m.add(box(0.075, 0.07, 0.065), lg(at(sx * (w / 2), 0.035, zOff)), { color: C.gold, part: part(), crease: true });
    }
    m.add(box(w + 0.06, 0.06, 0.05), lg(at(0, h - 0.03, zOff)), { color: C.coal, part: frame, crease: true });
    m.add(box(w + 0.06, 0.06, 0.05), lg(at(0, 0.2, zOff)), { color: C.coal, part: frame, crease: true });
    m.add(box(w - 0.03, h - 0.3, 0.02), lg(at(0, 0.2 + (h - 0.23) / 2, zOff + side * 0.014)), { color: C.paper, part: part(), crease: true });
  }
  m.add(cyl(0.03, 0.03, w + 0.1, 10), g(at(0, h + 0.005, 0, 0, 0, Math.PI / 2)), { color: C.gold, part: part() });
}

/** A string-light post: slim charcoal pole with a gold ball (the café picture's posts). Returns the top. */
export function post(m: Sink, base: Matrix4, height = 3.2): Vector3 {
  const p = part();
  m.add(cyl(0.05, 0.05, height, 12), mul(base, at(0, height / 2, 0)), { color: C.coal, part: p });
  m.add(box(0.2, 0.06, 0.2), mul(base, at(0, 0.03, 0)), { color: C.gold, part: part(), crease: true });
  m.add(new SphereGeometry(0.075, 10, 7), mul(base, at(0, height + 0.07, 0)), { color: C.gold, part: part() });
  return new Vector3(0, height - 0.12, 0).applyMatrix4(base);
}

/**
 * String lights hung between two points: a charcoal wire in a catenary-like sag, with bulbs under little gold-capped
 * sockets. The bulbs share lamp `lampIndex`'s light. Returns the bulbs for the halos.
 */
export function stringLights(m: Sink, a: Vector3, b: Vector3, sag: number, count: number, lampIndex: number): Bulb[] {
  const wire = part();
  // They swing in the breeze, most at mid-span; each string with its own phase.
  const swing = 0.045, phase = lampIndex * 2.7 + a.x * 0.31;
  const pts: Vector3[] = [];
  const N = 28;
  // A cosh curve through both ends, sagging `sag` in the middle.
  const cosh = (x: number): number => (Math.exp(x) + Math.exp(-x)) / 2;
  const k = 2.2;
  const norm = cosh(k) - 1;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = a.clone().lerp(b, t);
    p.y -= sag * (1 - (cosh(k * (2 * t - 1)) - 1) / norm);
    pts.push(p);
  }
  for (let i = 0; i < N; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const len = p0.distanceTo(p1);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const dir = p1.clone().sub(p0).normalize();
    const mat = new Matrix4().lookAt(new Vector3(), dir, new Vector3(0, 1, 0));
    mat.multiply(at(0, 0, 0, Math.PI / 2, 0, 0));
    mat.setPosition(mid);
    const t = (i + 0.5) / N;
    m.add(cyl(0.012, 0.012, len + 0.01, 4), mat, { color: C.coal, part: wire, noShadow: true, sway: [swing * Math.sin(Math.PI * t), 0, phase, 1] });
  }
  const bulbs: Bulb[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const idx = Math.min(N - 1, Math.floor(t * N));
    const f = t * N - idx;
    const p = pts[idx].clone().lerp(pts[idx + 1], f);
    const sw: readonly [number, number, number, number] = [swing * Math.sin(Math.PI * t), 0, phase, 1];
    m.add(cyl(0.035, 0.035, 0.08, 10), at(p.x, p.y - 0.05, p.z), { color: C.coal, part: part(), crease: true, sway: sw });
    m.add(cyl(0.02, 0.07, 0.07, 14), at(p.x, p.y - 0.12, p.z), { color: C.gold, part: part(), crease: true, sway: sw });
    const bp = new Vector3(p.x, p.y - 0.2, p.z);
    m.add(new SphereGeometry(0.065, 8, 6), at(bp.x, bp.y, bp.z), { color: C.bulbOff, part: part(), pat: Pat.Bulb, param: lampIndex, noShadow: true, sway: sw });
    bulbs.push({ pos: bp, lamp: lampIndex, size: 0.42, sway: [sw[0], 0, phase] });
  }
  return bulbs;
}

export { CREASE };

/**
 * A striped awning over a wall facing +z: stripes slope out and down from the wall, a scalloped edge hangs from the
 * front (the kiosk and café pictures). x0..x1 along the wall; topY where it meets the wall; `out` how far it reaches.
 */
export function awning(m: Sink, x0: number, x1: number, topY: number, wallZ: number, out: number, drop: number, n: number, colours: readonly [number, number] = [C.gold, C.paper]): void {
  const aw = part();
  const width = x1 - x0, sw = width / n;
  const slope = Math.atan2(drop, out);
  const len = Math.hypot(drop, out);
  for (let j = 0; j < n; j++) {
    const cx = x0 + (j + 0.5) * sw;
    const colour = colours[j % 2];
    m.add(new BoxGeometry(sw + 0.002, 0.03, len), at(cx, topY - drop / 2, wallZ + out / 2, slope, 0, 0), { color: colour, part: aw });
    const tab: [number, number][] = [[-sw / 2, 0.02], [-sw / 2, -0.07]];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + (k / 10) * Math.PI;
      tab.push([(sw / 2) * Math.cos(a), -0.07 + (sw / 2) * Math.sin(a)]);
    }
    tab.push([sw / 2, -0.07], [sw / 2, 0.02]);
    m.add(slabXY(tab, 0.025), at(cx, topY - drop, wallZ + out - 0.012), { color: colour, part: aw, sway: [0.012, topY - drop + 0.02, x0 * 0.7, 2] });
  }
}

/** One lobe of a crown: a smooth sphere, lighter on top and darker underneath (the pictures' plants are two-tone). */
function lobe(r: number): BufferGeometry {
  const g = new SphereGeometry(r, 14, 10);
  const N = g.getAttribute('normal');
  const col: number[] = [];
  for (let i = 0; i < N.count; i++) {
    const y = N.getY(i);
    const t = Math.min(1, Math.max(0, (y + 0.3) / 1.0));
    const e = t * t * (3 - 2 * t);
    col.push(0.8 + 0.4 * e, 0.82 + 0.38 * e, 0.78 + 0.34 * e);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A tree in a planter: a charcoal box with a gold band, a slim charcoal trunk, and a crown of five or six overlapping
 * round lobes in the leaves' grey-green, inked only round its outside. Crowns go to `crowns` (they cast no shadow:
 * the sun would throw it behind the shops).
 */
export function tree(m: Sink, base: Matrix4, size = 1, phase = 0, crowns: Sink = m): void {
  const g = (mat: Matrix4): Matrix4 => mul(base, mat);
  m.add(new BoxGeometry(0.8, 0.46, 0.8), g(at(0, 0.23, 0)), { color: C.coal, part: part(), crease: true });
  m.add(new BoxGeometry(0.86, 0.06, 0.86), g(at(0, 0.36, 0)), { color: C.gold, part: part(), crease: true });
  m.add(new BoxGeometry(0.74, 0.02, 0.74), g(at(0, 0.465, 0)), { color: C.coalDeep, part: part() });
  const trunk = part();
  m.add(new CylinderGeometry(0.045 * size, 0.065 * size, 1.5 * size, 8), g(at(0, 0.46 + 0.75 * size, 0)), { color: C.coal, part: trunk });
  m.add(new CylinderGeometry(0.02 * size, 0.03 * size, 0.45 * size, 6), g(at(0.12 * size, 0.46 + 1.2 * size, 0.02, 0, 0, -0.6)), { color: C.coal, part: trunk });
  const rootY = new Vector3(0, 0.46 + 1.25 * size, 0).applyMatrix4(base).y;
  const cy = 0.46 + 1.85 * size;
  const crownPart = part();
  const lobes: [number, number, number, number][] = [[0, 0.02, 0, 0.5]];
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = phase * 1.3 + (k / n) * Math.PI * 2;
    lobes.push([Math.cos(a) * 0.36, -0.04 + 0.1 * (k % 2), Math.sin(a) * 0.36, 0.34 + 0.05 * ((k + 1) % 2)]);
  }
  lobes.push([0.04, 0.36, -0.04, 0.33]);
  for (const [x, y, z, r] of lobes) {
    crowns.add(lobe(r * size), g(at(x * size, cy + y * size, z * size)), { color: C.crown, part: crownPart, soft: true, sway: [0.008 / size, rootY, phase] });
  }
}

/**
 * A shopfront on the far side of the street (its front faces +z): cream slatted walls (or charcoal for a few),
 * a charcoal roof, a gold-framed window that lights with lamp `lamp`, a door, a small striped awning.
 */
export function shop(m: Sink, x: number, zFront: number, w: number, h: number, d: number, variant: number, lampIndex: number, glows?: Bulb[], slot = lampIndex): void {
  const z = zFront - d / 2;
  const dark = variant % 4 === 3;
  const wall: Paint = dark
    ? { color: C.coal, side: C.coal, part: part(), crease: true, pat: Pat.Slats, param: 0.16 }
    : { color: C.paper, side: variant % 2 ? C.paper : C.cream, part: part(), crease: true, pat: Pat.Slats, param: 0.15 };
  m.add(new BoxGeometry(w + 0.08, 0.14, d + 0.08), at(x, 0.07, z), { color: dark ? C.gold : C.cream, part: part(), crease: true });
  m.add(new BoxGeometry(w, h - 0.14, d), at(x, 0.14 + (h - 0.14) / 2, z), wall);
  m.add(new BoxGeometry(w + 0.22, 0.2, d + 0.3), at(x, h + 0.1, z + 0.05), { color: C.coal, part: part(), crease: true });
  if (variant % 3 === 1) m.add(new BoxGeometry(w + 0.24, 0.05, 0.05), at(x, h + 0.1, z + 0.05 + (d + 0.3) / 2 + 0.02), { color: C.gold, part: part(), crease: true });
  // The window and its gold frame.
  const ww = Math.min(w - 1.0, 1.9), wh = Math.min(1.15, h * 0.42);
  const wx = x - w / 2 + 0.35 + ww / 2;
  const wy = 0.62 + wh / 2;
  m.add(frameXY(ww + 0.1, wh + 0.1, 0.03, 0.06, 0.06), at(wx, wy, zFront), { color: C.gold, part: part(), crease: true });
  m.add(new BoxGeometry(ww, wh, 0.02), at(wx, wy, zFront + 0.012), { color: 0x3b3a3d, part: part(), pat: Pat.Window, param: slot });
  glows?.push({ pos: new Vector3(wx, wy, zFront + 0.25), lamp: slot, size: Math.max(ww, wh) * 0.95, near: lampIndex });
  // A mullion across the glass.
  m.add(new BoxGeometry(0.035, wh, 0.03), at(wx, wy, zFront + 0.03), { color: C.gold, part: part(), crease: true });
  // The door, charcoal with a gold handle (cream on a dark front).
  const dx = x + w / 2 - 0.55;
  m.add(new BoxGeometry(0.62, 1.2, 0.04), at(dx, 0.14 + 0.6, zFront + 0.02), { color: dark ? C.paper : C.coal, part: part(), crease: true });
  m.add(new BoxGeometry(0.03, 0.16, 0.03), at(dx - 0.2, 0.8, zFront + 0.055), { color: C.gold, part: part(), crease: true });
  // A small striped awning over the window (gold, or charcoal on every third).
  const stripe: readonly [number, number] = variant % 3 === 2 ? [C.coal, C.paper] : [C.gold, C.paper];
  awning(m, wx - ww / 2 - 0.1, wx + ww / 2 + 0.1, wy + wh / 2 + 0.42, zFront, 0.48, 0.24, 7, stripe);
  if (h > 2.9) {
    // An upper window on the taller ones.
    m.add(frameXY(0.7, 0.55, 0.03, 0.05, 0.05), at(x + 0.1, h - 0.6, zFront), { color: C.gold, part: part(), crease: true });
    m.add(new BoxGeometry(0.6, 0.45, 0.02), at(x + 0.1, h - 0.6, zFront + 0.01), { color: 0x3b3a3d, part: part(), pat: Pat.Window, param: slot });
  }
}
