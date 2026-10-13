import { Box3, BufferAttribute, BufferGeometry, Color, Matrix3, Matrix4, Quaternion, Vector3, Euler } from 'three';

/*
 * The street is drawn by one toon material, and most of it is merged into a few meshes. Every vertex carries what
 * the material needs to draw it: its colour (linear), and `aInfo`:
 *   x  the part it belongs to (the outline pass draws ink where the part changes, so each object gets its silhouette)
 *   y  flags (1: draw creases inside this part; 2: no cast shadow falls on it)
 *   z  a pattern drawn in the shader (grout, slats, kerb joints, a lamp's bulb, ...)
 *   w  the pattern's parameter
 * and `aAnim`: x sway amplitude, y the height it sways from, z a phase (leaves move a little when idle).
 */

export const enum Pat {
  None = 0,
  /** Vertical slats on a wall (w: spacing). */
  Slats = 1,
  /** Square tiles with grout (w: tile size). */
  Tiles = 2,
  /** A lamp's bulb (w: the lamp's index); lit by the lamps uniform, not by the sun. */
  Bulb = 3,
  /** A slab's side face: joints every tile and a bevel highlight along its top (w: the top's height). */
  Kerb = 4,
  /** Drawn as it is: no light and no shade. */
  Unlit = 5,
  /** Small setts in running bond (w: sett length). */
  Setts = 6,
  /** Horizontal boards (w: spacing). */
  Boards = 7,
  /** A phone's screen: a soft gloss (w unused). */
  Screen = 8,
  /** Glows by itself (w: the strength's slot in the glow uniforms). */
  Glow = 9,
  /** The table's decorative code (drawn from the QR uniforms; it does not decode). */
  Qr = 10,
  /** A shop window: dark glass, warm once lamp w is lit. */
  Window = 11,
  /** A gold wire that a pulse runs along (w: the wire's number + how far along, 0 to 1). */
  Wire = 12,
  /** A card's gold frame, swept by a light as it forms. */
  Sheen = 13,
  /** The ledger's ruled board (rows brighten as their ticks land). */
  Ledger = 14,
}

export const CREASE = 1;
export const NO_SHADOW = 2;
/** Soft: overlapping lobes of one part draw no ink where they overlap (only the outer silhouette is inked). */
export const SOFT = 4;

let parts = 0;
/** A new part: the outline pass draws ink where one part meets another. */
export function part(): number {
  parts += 1;
  return parts;
}

export interface Paint {
  color: number;
  part: number;
  /** Colour for faces that stand up (walls of a box); `color` is then for its top and bottom. */
  side?: number;
  /** Draw creases (box edges) inside the part. Off for soft or faceted things (pots, leaves, the pavement). */
  crease?: boolean;
  noShadow?: boolean;
  pat?: Pat;
  param?: number;
  /** Faceted: every triangle its own normal. */
  flat?: boolean;
  /** Ink only round the outside of the part (a crown made of lobes). */
  soft?: boolean;
  /** Idle motion: amplitude, a height (a plant's root, a lamp's pivot, an awning's edge), phase, and the kind
   *  (0 a plant, 1 hanging, 2 an awning's edge, 3 a bird's wings). */
  sway?: readonly [number, number, number, number?];
  /** A per-vertex amplitude (hanging string lights: most at mid-span); multiplies sway's amplitude. */
  swayAt?: (x: number, y: number, z: number) => number;
  /** Add the geometry's u (how far along a tube) to `param`, per vertex (a wire's pulse needs it). */
  paramFromUv?: boolean;
}

const tmpC = new Color();
const tmpS = new Color();
const v3 = new Vector3();
const n3 = new Vector3();
const nm = new Matrix3();

/** Collects geometry with its paint, and gives one merged BufferGeometry. */
export class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  info: number[] = [];
  anim: number[] = [];

  add(source: BufferGeometry, m: Matrix4, paint: Paint): this {
    const g = source.index ? source.toNonIndexed() : source;
    if (paint.flat || !g.getAttribute('normal')) g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    // A geometry may carry its own colours (a tone across a crown); they multiply the paint's.
    const VC = g.getAttribute('color');
    const UV = paint.paramFromUv ? g.getAttribute('uv') : undefined;
    nm.getNormalMatrix(m);
    tmpC.setHex(paint.color);
    tmpS.setHex(paint.side ?? paint.color);
    const flags = (paint.crease ? CREASE : 0) | (paint.noShadow ? NO_SHADOW : 0) | (paint.soft ? SOFT : 0);
    const [sa, sy, sp, smode] = paint.sway ?? [0, 0, 0, 0];
    for (let k = 0; k < P.count; k++) {
      v3.fromBufferAttribute(P, k).applyMatrix4(m);
      n3.fromBufferAttribute(N, k).applyMatrix3(nm).normalize();
      this.pos.push(v3.x, v3.y, v3.z);
      this.nor.push(n3.x, n3.y, n3.z);
      const c = Math.abs(n3.y) < 0.5 ? tmpS : tmpC;
      if (VC) this.col.push(c.r * VC.getX(k), c.g * VC.getY(k), c.b * VC.getZ(k));
      else this.col.push(c.r, c.g, c.b);
      this.info.push(paint.part, flags, paint.pat ?? Pat.None, (paint.param ?? 0) + (UV ? Math.min(0.999, UV.getX(k)) : 0));
      this.anim.push(paint.swayAt ? sa * paint.swayAt(v3.x, v3.y, v3.z) : sa, sy, sp, smode ?? 0);
    }
    if (g !== source) g.dispose();
    return this;
  }

  get count(): number {
    return this.pos.length / 3;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aInfo', new BufferAttribute(new Float32Array(this.info), 4));
    g.setAttribute('aAnim', new BufferAttribute(new Float32Array(this.anim), 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * A Mesher that sorts what it is given into chunks along x (by where each piece ends up), so the street can be culled
 * chunk by chunk in both the main pass and the sun's. Pieces longer than a chunk (the pavement) go in a chunk of their own.
 */
/** Anything geometry can be added to. */
export interface Sink { add(source: BufferGeometry, m: Matrix4, paint: Paint): unknown }

export class ChunkMesher {
  readonly long = new Mesher();
  readonly chunks = new Map<number, Mesher>();
  private readonly box = new Box3();
  constructor(readonly size: number) {}
  add(source: BufferGeometry, m: Matrix4, paint: Paint): this {
    if (!source.boundingBox) source.computeBoundingBox();
    this.box.copy(source.boundingBox!).applyMatrix4(m);
    const w = this.box.max.x - this.box.min.x;
    if (w > this.size * 0.6) { this.long.add(source, m, paint); return this; }
    const k = Math.floor((this.box.min.x + this.box.max.x) / 2 / this.size);
    let target = this.chunks.get(k);
    if (!target) { target = new Mesher(); this.chunks.set(k, target); }
    target.add(source, m, paint);
    return this;
  }
  all(): Mesher[] {
    return [this.long, ...this.chunks.values()].filter(x => x.count > 0);
  }
}

// ── Placing things ──────────────────────────────────────────────────────────────────────────────────────────────────

const q = new Quaternion();
const e = new Euler();
const s = new Vector3();
const t = new Vector3();

/** A transform: position, rotation (radians, XYZ), scale. */
export function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): Matrix4 {
  e.set(rx, ry, rz);
  q.setFromEuler(e);
  return new Matrix4().compose(t.set(x, y, z), q, s.set(sx, sy, sz));
}

/** Parent ∘ child. */
export function mul(a: Matrix4, b: Matrix4): Matrix4 {
  return new Matrix4().multiplyMatrices(a, b);
}

// ── Shapes that three does not have ──────────────────────────────────────────────────────────────────────────────────

/**
 * A leaf: a long pointed blade with a fold down its middle, so its two halves take two tones (as in the pictures).
 * It grows from the origin along +Y, leaning toward +Z by `lean`, `len` long and `wid` wide.
 */
export function leaf(len: number, wid: number, lean: number, fold = 0.35): BufferGeometry {
  // The outline of half a blade: from the stem to the tip, its widest a third of the way up.
  const rows = [0, 0.18, 0.4, 0.62, 0.82, 1];
  const widths = [0.18, 0.78, 1, 0.86, 0.52, 0];
  const pos: number[] = [];
  const pt = (u: number, side: number): Vector3 => {
    // The spine bends forward (toward +Z) as it rises.
    const y = u * len * Math.cos(lean * u);
    const z = u * len * Math.sin(lean * u);
    const w = widths[rows.indexOf(u)] * wid * 0.5;
    // The fold: each half rises a little toward the spine (a V across the blade).
    return new Vector3(side * w, y, z - Math.abs(w) * fold);
  };
  for (let r = 0; r < rows.length - 1; r++) {
    for (const side of [-1, 1]) {
      const a = pt(rows[r], 0), b = pt(rows[r], side), c = pt(rows[r + 1], side), d = pt(rows[r + 1], 0);
      // Two triangles a-b-c, a-c-d, wound so the front faces +Z (toward the viewer's side).
      const tri = side > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const v of tri) pos.push(v.x, v.y, v.z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** A flat shape in XY, given as points, extruded by depth along +Z (no bevel). */
export function slabXY(points: readonly (readonly [number, number])[], depth: number): BufferGeometry {
  const pos: number[] = [];
  const n = points.length;
  // Faces: front (z = depth) and back (z = 0) as fans (the shapes used here are convex), and the sides.
  for (let i = 1; i < n - 1; i++) {
    const [a, b, c] = [points[0], points[i], points[i + 1]];
    pos.push(a[0], a[1], depth, b[0], b[1], depth, c[0], c[1], depth);
    pos.push(a[0], a[1], 0, c[0], c[1], 0, b[0], b[1], 0);
  }
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    pos.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], depth);
    pos.push(a[0], a[1], 0, b[0], b[1], depth, a[0], a[1], depth);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** A rounded rectangle's outline (counter-clockwise), w by h, corner radius r, centred on the origin. */
export function roundRect(w: number, h: number, r: number, seg = 5): [number, number][] {
  const out: [number, number][] = [];
  const cs: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of cs) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
}

/**
 * A frame: the band between two rounded rectangles (outer w×h, inner inset by `band`), extruded `depth` along +Z.
 * Built from quads between matching points of the two outlines, so it stays one clean ring.
 */
export function frameXY(w: number, h: number, r: number, band: number, depth: number, seg = 5): BufferGeometry {
  const o = roundRect(w, h, r, seg);
  const i = roundRect(w - 2 * band, h - 2 * band, Math.max(0.001, r - band), seg);
  const pos: number[] = [];
  const n = o.length;
  const quad = (a: number[], b: number[], c: number[], d: number[]): void => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const [o0, o1, i0, i1] = [o[k], o[k2], i[k], i[k2]];
    // front and back faces
    quad([o0[0], o0[1], depth], [o1[0], o1[1], depth], [i1[0], i1[1], depth], [i0[0], i0[1], depth]);
    quad([o0[0], o0[1], 0], [i0[0], i0[1], 0], [i1[0], i1[1], 0], [o1[0], o1[1], 0]);
    // outer and inner walls
    quad([o0[0], o0[1], 0], [o1[0], o1[1], 0], [o1[0], o1[1], depth], [o0[0], o0[1], depth]);
    quad([i0[0], i0[1], 0], [i0[0], i0[1], depth], [i1[0], i1[1], depth], [i1[0], i1[1], 0]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** A quad strip along a list of points (a ribbon), `width` across, lying in the plane given by `across`. */
export function ribbonGeometry(segments: number): BufferGeometry {
  // Positions are written every frame by the animation; normals too. (segments + 1) * 2 vertices, indexed.
  const g = new BufferGeometry();
  const verts = (segments + 1) * 2;
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(verts * 3), 3));
  const idx: number[] = [];
  for (let k = 0; k < segments; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  return g;
}
