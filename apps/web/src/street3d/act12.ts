import {
  BoxGeometry, BufferAttribute, BufferGeometry, CubicBezierCurve3, CylinderGeometry, InstancedMesh, Matrix4, Mesh, Quaternion,
  SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C } from './palette.ts';
import { at, frameXY, Mesher, part, Pat, roundRect, slabXY, type Paint } from './geo.ts';
import { awning, plant } from './props.ts';
import { STATION_X } from './layout.ts';
import { clamp, inOut, lerp, out3, outBack, seg, settle, smooth } from './ease.ts';
import { CASTERS, type Halos, type World } from './world.ts';
import { shared } from './materials.ts';
import { FACE, INLAY_Z, PEOPLE, RIGHT, STUB_X, STUB_Z, tableSpot, Y0 } from './spots.ts';

/*
 * Stations 1 and 2.
 * 1, the bill desk: the receipt prints out of the printer, curls over and hangs down the desk; a gold bar drops and
 *    cuts what hangs into six strips, five equal and one narrower (Jonas pays a smaller, fixed share). The strips rise
 *    together as a fan toward the viewer, fold in half, and each widens into a cream card in a gold frame.
 * 2, the link post: the cards fly down the street into the kiosk's window and rise out of it on gold wires into a
 *    neat grid of two rows of three (the picture's). Each card then sends a packet down its wire, out of the window and
 *    along the gold inlay in the paving to the café table.
 */

export { PEOPLE };
/** The shares of the $300 dinner: five pay $56.00, Jonas a fixed $20.00. The strips' widths follow them. */
const SHARES = [56, 56, 56, 56, 56, 20];

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const X = new Vector3(1, 0, 0);

// ── Station 1: the bill desk ──────────────────────────────────────────────────────────────────────────────────────

const S1 = STATION_X[0];
const DESK = { x: S1 + 0.2, z: -2.75, top: Y0 + 1.4, front: -2.175, edge: -2.09 };
const PRINTER = { x: S1 - 0.3, y: Y0 + 1.66, z: -2.85, top: Y0 + 1.92 };
const PAPER_W = 0.62;
const SLOT_Z = -2.54;

function buildDesk(m: Mesher): void {
  const { x, z } = DESK;
  m.add(box(2.78, 0.09, 1.23), at(x, Y0 + 0.045, z), { color: C.cream, side: C.cream, part: part(), crease: true });
  m.add(box(2.7, 1.08, 1.15), at(x, Y0 + 0.09 + 0.54, z), { color: C.paper, side: C.paper, part: part(), crease: true, pat: Pat.Slats, param: 0.135 });
  m.add(box(2.76, 0.07, 1.21), at(x, Y0 + 1.17 + 0.035, z), { color: C.cream, part: part(), crease: true });
  m.add(box(2.88, 0.16, 1.32), at(x, Y0 + 1.24 + 0.08, z), { color: C.coal, part: part(), crease: true });
  // A tray of blank cards on the right of the desk.
  const tx = DESK.x + 0.85, tz = -2.5;
  m.add(box(0.66, 0.06, 0.48), at(tx, DESK.top + 0.03, tz), { color: C.coalDeep, part: part(), crease: true });
  m.add(box(0.66, 0.035, 0.035), at(tx, DESK.top + 0.075, tz + 0.24), { color: C.gold, part: part(), crease: true });
  m.add(box(0.035, 0.035, 0.48), at(tx - 0.33, DESK.top + 0.075, tz), { color: C.gold, part: part(), crease: true });
  m.add(box(0.46, 0.17, 0.3), at(tx, DESK.top + 0.06 + 0.085, tz - 0.02), { color: C.white, side: C.paper, part: part(), crease: true, pat: Pat.Boards, param: 0.034 });
  plant(m, at(S1 - 1.75, Y0, -1.15), 1.12, 0.7);
}

/** The printer: a rounded charcoal block, its slot, a gold strip on its side, a gold light on its front (it blinks
 *  while it prints). Its own mesh, so it can shake as the paper runs out. */
function buildPrinter(m: Mesher): Vector3 {
  const pr = part();
  m.add(new RoundedBoxGeometry(1.15, 0.52, 0.86, 3, 0.07), at(PRINTER.x, PRINTER.y, PRINTER.z), { color: C.coal, part: pr });
  m.add(box(0.74, 0.012, 0.055), at(PRINTER.x, PRINTER.top + 0.002, SLOT_Z), { color: 0x0c0b0b, part: pr, pat: Pat.Unlit });
  m.add(box(0.012, 0.05, 0.26), at(PRINTER.x + 0.58, PRINTER.y + 0.07, PRINTER.z + 0.08), { color: C.gold, part: part(), crease: true });
  const led = new Vector3(PRINTER.x + 0.4, PRINTER.y + 0.14, PRINTER.z + 0.432);
  m.add(new CylinderGeometry(0.03, 0.03, 0.022, 16), at(led.x, led.y, led.z, Math.PI / 2, 0, 0), { color: C.gold, part: part(), pat: Pat.Glow, param: 1 });
  m.add(box(0.12, 0.016, 0.01), at(led.x - 0.16, led.y, led.z - 0.002), { color: C.goldDeep, part: part() });
  return led.add(new Vector3(0, 0, 0.03));
}

/** The receipt's way out of the printer: up, a curl forward, down to the desk, to its edge, over it, and down. */
interface PathPoint { s: number; y: number; z: number; ty: number; tz: number }
function receiptPath(): { pts: PathPoint[]; cut: number; total: number } {
  const pts: PathPoint[] = [];
  let s = 0;
  let last: [number, number] | null = null;
  const push = (y: number, z: number, ty: number, tz: number): void => {
    if (last) s += Math.hypot(y - last[0], z - last[1]);
    last = [y, z];
    pts.push({ s, y, z, ty, tz });
  };
  const line = (y0: number, z0: number, y1: number, z1: number, n: number): void => {
    const L = Math.hypot(y1 - y0, z1 - z0);
    for (let k = pts.length ? 1 : 0; k <= n; k++) push(lerp(y0, y1, k / n), lerp(z0, z1, k / n), (y1 - y0) / L, (z1 - z0) / L);
  };
  const arcYZ = (cy: number, cz: number, r: number, a0: number, a1: number, n: number): void => {
    for (let k = 1; k <= n; k++) {
      const a = lerp(a0, a1, k / n);
      const dz = -Math.sin(a) * Math.sign(a1 - a0), dy = Math.cos(a) * Math.sign(a1 - a0);
      push(cy + r * Math.sin(a), cz + r * Math.cos(a), dy, dz);
    }
  };
  const top = PRINTER.top + 0.3, r = 0.14;
  line(PRINTER.top - 0.06, SLOT_Z, top, SLOT_Z, 12);
  arcYZ(top, SLOT_Z + r, r, Math.PI, 0, 22);
  const zc = SLOT_Z + 2 * r;
  const yb = DESK.top + 0.005 + 0.06;
  line(top, zc, yb, zc, 22);
  arcYZ(yb, zc + 0.06, 0.06, Math.PI, 1.5 * Math.PI, 6);
  line(DESK.top + 0.005, zc + 0.06, DESK.top + 0.005, DESK.edge - 0.025, 2);
  const cut = s;
  arcYZ(DESK.top - 0.02, DESK.edge - 0.025, 0.025, 0.5 * Math.PI, 0, 5);
  line(DESK.top - 0.02, DESK.edge, DESK.top - 0.66, DESK.edge + 0.018, 20);
  return { pts, cut, total: s };
}

// ── Station 2: the link post ──────────────────────────────────────────────────────────────────────────────────────

const S2 = STATION_X[1];
const KIOSK = { x: S2 + 0.25, z: -2.85, w: 2.2, d: 1.7, front: -2.0 };
const WINDOW = { x: S2 + 0.15, y: Y0 + 1.42, w: 1.3, h: 0.75 };
const TRAY = { x: S2 + 0.15, y: Y0 + 0.98, z: -1.86 };

function buildKiosk(m: Mesher): void {
  const { x, z, w, d } = KIOSK;
  m.add(box(w + 0.08, 0.1, d + 0.08), at(x, Y0 + 0.05, z), { color: C.cream, part: part(), crease: true });
  m.add(box(w, 2.2, d), at(x, Y0 + 0.1 + 1.1, z), { color: C.paper, side: C.paper, part: part(), crease: true, pat: Pat.Slats, param: 0.14 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    m.add(box(0.13, 2.32, 0.13), at(x + sx * (w / 2), Y0 + 0.1 + 1.16, z + sz * (d / 2)), { color: C.white, side: C.cream, part: part(), crease: true });
  }
  m.add(box(w + 0.1, 0.12, d + 0.1), at(x, Y0 + 2.36, z), { color: C.cream, part: part(), crease: true });
  m.add(box(w + 0.3, 0.22, d + 0.35), at(x, Y0 + 2.42 + 0.11, z + 0.08), { color: C.coal, part: part(), crease: true });
  // The window: dark inside, a cream frame, a gold-rimmed tray sticking out of it.
  m.add(box(WINDOW.w, WINDOW.h, 0.01), at(WINDOW.x, WINDOW.y, KIOSK.front + 0.006), { color: 0x1d1c1e, part: part(), pat: Pat.Glow, param: 2 });
  const fr = part();
  const fp: Paint = { color: C.white, side: C.cream, part: fr, crease: true };
  m.add(box(WINDOW.w + 0.14, 0.07, 0.07), at(WINDOW.x, WINDOW.y + WINDOW.h / 2 + 0.035, KIOSK.front + 0.035), fp);
  m.add(box(WINDOW.w + 0.14, 0.07, 0.12), at(WINDOW.x, WINDOW.y - WINDOW.h / 2 - 0.035, KIOSK.front + 0.06), fp);
  for (const sx of [-1, 1]) m.add(box(0.07, WINDOW.h, 0.07), at(WINDOW.x + sx * (WINDOW.w / 2 + 0.035), WINDOW.y, KIOSK.front + 0.035), fp);
  m.add(frameXY(1.02, 0.4, 0.05, 0.055, 0.09), at(TRAY.x, TRAY.y - 0.05, TRAY.z, -Math.PI / 2, 0, 0), { color: C.gold, part: part(), crease: true });
  m.add(box(0.92, 0.02, 0.3), at(TRAY.x, TRAY.y - 0.03, TRAY.z), { color: C.coalDeep, part: part(), crease: false });
  awning(m, x - (w + 0.12) / 2, x + (w + 0.12) / 2, Y0 + 2.12, KIOSK.front, 0.62, 0.32, 9);
  plant(m, at(S2 - 1.95, Y0, -1.05), 1.1, 2.2);
}

// ── Where the cards go ───────────────────────────────────────────────────────────────────────────────────────────

const CARD = { w: 0.58, h: 0.37 };

/** The six cards over the desk: a gentle arch on a wide screen, two rows of three on a phone. */
function cardSpot(i: number, tall: boolean, out: Vector3): Vector3 {
  if (tall) {
    const col = (i % 3) - 1, row = i < 3 ? 1 : 0;
    return out.set(S1 + 0.0, Y0 + 2.28 + row * 0.62, -1.8).addScaledVector(RIGHT, col * 0.84);
  }
  const c = i - 2.5;
  return out.set(S1 + 0.0, Y0 + 2.55 + 0.1 * (1 - (c / 2.5) ** 2), -1.8).addScaledVector(RIGHT, c * 0.68);
}
/** The fan the strips rise into: a hand of six, spread in front of the desk toward the viewer. */
let narrow = false;
function fanSpot(i: number, out: Vector3): Vector3 {
  const c = i - 2.5;
  return out.set(S1 - 0.1, Y0 + 2.05 - 0.035 * c * c, -1.45).addScaledVector(RIGHT, c * (narrow ? 0.13 : 0.2));
}
const fanRoll = (i: number): number => -(i - 2.5) * 0.13;

/** The grid over the kiosk: top row 0-2, lower row 3-5, left to right on screen. */
function gridSpot(i: number, out: Vector3): Vector3 {
  const col = (i % 3) - 1;
  const row = i < 3 ? 1 : 0;
  return out.set(S2 + 0.12, Y0 + 3.25 + row * 0.66, -1.5).addScaledVector(RIGHT, col * 0.8);
}

function cardGeometry(): BufferGeometry {
  const m = new Mesher();
  const p = part();
  m.add(frameXY(CARD.w, CARD.h, 0.07, 0.06, 0.05), at(0, 0, -0.025), { color: C.gold, part: p, crease: true, pat: Pat.Sheen });
  m.add(slabXY(roundRect(CARD.w - 0.1, CARD.h - 0.1, 0.03, 4), 0.03), at(0, 0, -0.02), { color: C.white, part: p, crease: false, pat: Pat.Screen });
  return m.build();
}

/** A tube that is drawn on from its start (its index range grows). */
class Wire {
  readonly mesh: Mesh;
  readonly curve: CubicBezierCurve3;
  private readonly segs: number;
  constructor(world: World, curve: CubicBezierCurve3, segs: number, radius: number, index: number) {
    this.curve = curve;
    this.segs = segs;
    const m = new Mesher();
    m.add(new TubeGeometry(curve, segs, radius, 6, false), new Matrix4(), { color: C.gold, part: part(), crease: false, noShadow: true, pat: Pat.Wire, param: index, paramFromUv: true });
    const g = m.build();
    g.setDrawRange(0, 0);
    this.mesh = world.movingMesh(g, false);
    this.mesh.frustumCulled = false;
  }
  draw(t: number): void {
    const n = Math.round(clamp(t) * this.segs);
    this.mesh.geometry.setDrawRange(0, n * 36);
    this.mesh.visible = n > 0;
  }
}

/** A path made of points, walked by length. */
export class Walk {
  private readonly pts: Vector3[];
  private readonly lens: number[] = [0];
  readonly length: number;
  constructor(pts: Vector3[]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.lens.push(this.lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.lens[this.lens.length - 1];
  }
  /** Where t falls among the points: the point's index plus how far on to the next. */
  locate(t: number): number {
    const s = clamp(t) * this.length;
    let i = 1;
    while (i < this.lens.length - 1 && this.lens[i] < s) i++;
    const a = this.lens[i - 1], b = this.lens[i];
    return i - 1 + (b > a ? (s - a) / (b - a) : 0);
  }
  at(t: number, out: Vector3): Vector3 {
    const s = clamp(t) * this.length;
    let i = 1;
    while (i < this.lens.length - 1 && this.lens[i] < s) i++;
    const a = this.lens[i - 1], b = this.lens[i];
    return out.copy(this.pts[i - 1]).lerp(this.pts[i], b > a ? (s - a) / (b - a) : 0);
  }
}

export interface Spot { pos: Vector3; visible: boolean }
/** One person's state at the current station: moving now, and finished here. */
export interface Item { active: boolean; done: boolean }

export interface Act {
  /** Moves this act to progress p at idle time t (`tall`: a portrait screen; `speed`: how fast p moves, per second).
   *  Returns true when a caster moved. */
  update(p: number, t: number, tall: boolean, speed: number): boolean;
  /** Glows to draw this frame. */
  halos(h: Halos, p: number, t: number): void;
  /** Where the six people's cards or phones are now (world), and whether they show; false when this act has none. */
  people(p: number, out: Spot[]): boolean;
  /** Each person's state at the station this act is playing at p; false when it is not this act's. */
  items(p: number, out: Item[]): boolean;
}

export function act12(world: World): Act {
  const still = new Mesher();
  buildDesk(still);
  buildKiosk(still);
  world.addStill(still, 'stations-1-2');
  const printerM = new Mesher();
  const ledAt = buildPrinter(printerM);
  const printer = world.movingMesh(printerM.build(), true);

  // ── The receipt: one dynamic mesh of seven ribbons (the part still in one piece, and the six strips) ──
  const path = receiptPath();
  const UP_SEGS = 90, STRIP_SEGS = 26;
  const ribbons = 7;
  const vertsOf = (k: number): number => (k === 0 ? UP_SEGS + 1 : STRIP_SEGS + 1) * 2;
  const totalVerts = vertsOf(0) + 6 * vertsOf(1);
  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3);
  const info = new Float32Array(totalVerts * 4);
  const anim = new Float32Array(totalVerts * 4);
  const idx: number[] = [];
  const base: number[] = [];
  {
    let v = 0;
    for (let r = 0; r < ribbons; r++) {
      base.push(v);
      const segs = r === 0 ? UP_SEGS : STRIP_SEGS;
      for (let k = 0; k < segs; k++) {
        const a = v + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      v += vertsOf(r);
    }
  }
  {
    const tmp = new Mesher();
    tmp.add(new BoxGeometry(0.01, 0.01, 0.01), new Matrix4(), { color: C.paper, part: 0 });
    for (let v = 0; v < totalVerts; v++) { col[v * 3] = tmp.col[0]; col[v * 3 + 1] = tmp.col[1]; col[v * 3 + 2] = tmp.col[2]; }
  }
  const paperPart = part();
  const stripParts = PEOPLE.map(() => part());
  const setInfo = (cut: boolean): void => {
    for (let r = 0; r < ribbons; r++) {
      const id = r === 0 || !cut ? paperPart : stripParts[r - 1];
      for (let k = 0; k < vertsOf(r); k++) {
        const o = (base[r] + k) * 4;
        info[o] = id; info[o + 1] = 0; info[o + 2] = Pat.None; info[o + 3] = 0;
      }
    }
  };
  setInfo(false);
  let wasCut = false;
  const paperGeo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3);
  const norAttr = new BufferAttribute(nor, 3);
  const infoAttr = new BufferAttribute(info, 4);
  paperGeo.setAttribute('position', posAttr);
  paperGeo.setAttribute('normal', norAttr);
  paperGeo.setAttribute('color', new BufferAttribute(col, 3));
  paperGeo.setAttribute('aInfo', infoAttr);
  paperGeo.setAttribute('aAnim', new BufferAttribute(anim, 4));
  paperGeo.setIndex(idx);
  const paper = world.movingMesh(paperGeo, true);
  paper.frustumCulled = false;

  const pAt = (s: number, out: PathPoint): PathPoint => {
    const pts = path.pts;
    s = clamp(s, 0, path.total);
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].s < s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    out.s = s; out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t);
    const ty = lerp(a.ty, b.ty, t), tz = lerp(a.tz, b.tz, t), l = Math.hypot(ty, tz) || 1;
    out.ty = ty / l; out.tz = tz / l;
    return out;
  };
  const pp: PathPoint = { s: 0, y: 0, z: 0, ty: 0, tz: 0 };

  /** Writes ribbon r's vertex pair k: centre c, across-direction a (unit), half-width hw, normal n. */
  const put = (r: number, k: number, c: Vector3, a: Vector3, hw: number, n: Vector3): void => {
    const v = base[r] + k * 2;
    pos[v * 3] = c.x - a.x * hw; pos[v * 3 + 1] = c.y - a.y * hw; pos[v * 3 + 2] = c.z - a.z * hw;
    pos[v * 3 + 3] = c.x + a.x * hw; pos[v * 3 + 4] = c.y + a.y * hw; pos[v * 3 + 5] = c.z + a.z * hw;
    nor[v * 3] = n.x; nor[v * 3 + 1] = n.y; nor[v * 3 + 2] = n.z;
    nor[v * 3 + 3] = n.x; nor[v * 3 + 4] = n.y; nor[v * 3 + 5] = n.z;
  };

  // The strips' widths: shares of the paper's width, Jonas's last and narrower.
  const total = SHARES.reduce((a, b) => a + b, 0);
  const stripX: [number, number][] = [];
  {
    let x = PRINTER.x - PAPER_W / 2;
    for (const sh of SHARES) { const w = (PAPER_W * sh) / total; stripX.push([x, x + w]); x += w; }
  }
  const L = path.total - path.cut;

  // The gold cutter bar on its two posts (a guillotine).
  const barM = new Mesher();
  const barP = part();
  barM.add(new CylinderGeometry(0.045, 0.045, PAPER_W + 0.16, 18), at(0, 0, 0, 0, 0, Math.PI / 2), { color: C.gold, part: barP });
  for (const sx of [-1, 1]) barM.add(new CylinderGeometry(0.058, 0.058, 0.05, 18), at(sx * (PAPER_W / 2 + 0.1), 0, 0, 0, 0, Math.PI / 2), { color: C.goldDeep, part: barP, crease: true });
  const bar = world.movingMesh(barM.build(), true);
  const BAR_REST = new Vector3(PRINTER.x, DESK.top + 0.005 + 0.05, DESK.edge - 0.06);
  {
    const posts = new Mesher();
    const pp2 = part();
    for (const sx of [-1, 1]) {
      posts.add(new BoxGeometry(0.04, 0.6, 0.04), at(BAR_REST.x + sx * (PAPER_W / 2 + 0.135), DESK.top + 0.3, BAR_REST.z - 0.02), { color: C.coal, part: pp2, crease: true });
      posts.add(new BoxGeometry(0.07, 0.04, 0.07), at(BAR_REST.x + sx * (PAPER_W / 2 + 0.135), DESK.top + 0.6, BAR_REST.z - 0.02), { color: C.gold, part: part(), crease: true });
    }
    world.addStill(posts, 'cutter-posts');
  }

  // The six cards (one instanced draw).
  const cards = new InstancedMesh(cardGeometry(), world.moving, 6);
  cards.frustumCulled = false;
  world.addMoving(cards, true);

  // Wires: from the tray up to each lower card, and from each lower card up to the one above it (never crossing).
  const grid = PEOPLE.map((_, i) => gridSpot(i, new Vector3()));
  const trays = [-1, 0, 1].map(k => new Vector3(TRAY.x, TRAY.y + 0.02, TRAY.z).addScaledVector(RIGHT, k * 0.13));
  const lowWires = [0, 1, 2].map(k => {
    const a = trays[k];
    const f = grid[3 + k].clone().add(new Vector3(0, -CARD.h / 2 - 0.02, 0));
    const curve = new CubicBezierCurve3(a, a.clone().add(new Vector3(0, 0.3, 0.95)).addScaledVector(RIGHT, (k - 1) * 0.12),
      f.clone().add(new Vector3(0, -0.85, 0.32)).addScaledVector(RIGHT, (k - 1) * 0.05), f);
    return new Wire(world, curve, 40, 0.019, k);
  });
  const highWires = [0, 1, 2].map(k => {
    const a = grid[3 + k].clone().add(new Vector3(0, CARD.h / 2 + 0.01, 0));
    const f = grid[k].clone().add(new Vector3(0, -CARD.h / 2 - 0.02, 0));
    const curve = new CubicBezierCurve3(a, a.clone().add(new Vector3(0, 0.1, 0)), f.clone().add(new Vector3(0, -0.1, 0)), f);
    return new Wire(world, curve, 12, 0.017, 3 + k);
  });
  /** The way card i rises out of the window: up its low wire (and on up the high one for the top row). */
  const riseWalk = PEOPLE.map((_, i) => {
    const k = i % 3;
    const pts: Vector3[] = [];
    for (let j = 0; j <= 24; j++) pts.push(lowWires[k].curve.getPointAt(j / 24));
    if (i < 3) for (let j = 1; j <= 8; j++) pts.push(highWires[k].curve.getPointAt(j / 8));
    pts.push(grid[i].clone());
    return new Walk(pts);
  });
  /** The packets' way: down the card's wires into the window, out over the tray, down to the inlay's stub, along it
   *  to the café's stub, and up onto the table to the person's place. */
  const packetWalk = PEOPLE.map((_, i) => {
    const k = i % 3;
    const pts: Vector3[] = [];
    if (i < 3) for (let j = 8; j >= 0; j--) pts.push(highWires[k].curve.getPointAt(j / 8));
    for (let j = 24; j >= 0; j--) pts.push(lowWires[k].curve.getPointAt(j / 24));
    const g = 0.035;
    pts.push(new Vector3(TRAY.x, TRAY.y + 0.06, TRAY.z + 0.18));
    pts.push(new Vector3(STUB_X[1], Y0 + g, STUB_Z));
    pts.push(new Vector3(STUB_X[1], Y0 + g, -0.02));
    pts.push(new Vector3(STUB_X[1], g, 0.04));
    pts.push(new Vector3(STUB_X[1], g, INLAY_Z));
    pts.push(new Vector3(STUB_X[2], g, INLAY_Z));
    pts.push(new Vector3(STUB_X[2], g, 0.04));
    pts.push(new Vector3(STUB_X[2], Y0 + g, -0.02));
    pts.push(new Vector3(STUB_X[2], Y0 + g, -0.75));
    const to = tableSpot(i);
    pts.push(new Vector3(lerp(STUB_X[2], to.x, 0.3), to.y + 0.55, lerp(-0.75, to.z, 0.5)));
    pts.push(to.clone().add(new Vector3(0, 0.05, 0)));
    return new Walk(pts);
  });

  // Packets: small bright beads (one instanced draw, no shadow).
  const beadM = new Mesher();
  beadM.add(new SphereGeometry(0.05, 14, 10), new Matrix4(), { color: 0xfff1c4, part: part(), pat: Pat.Unlit, noShadow: true });
  const beads = new InstancedMesh(beadM.build(), world.moving, 6);
  beads.frustumCulled = false;
  world.addMoving(beads, false);
  beads.layers.disable(CASTERS);

  // ── Scratch ──
  const c = new Vector3(), a = new Vector3(), n = new Vector3(), v = new Vector3(), w = new Vector3(), T = new Vector3();
  const q = new Quaternion(), q2 = new Quaternion(), qr = new Quaternion();
  const mtx = new Matrix4();
  const scl = new Vector3();
  const cardPos = PEOPLE.map(() => new Vector3());
  const cardShow = PEOPLE.map(() => false);
  const beadPos = PEOPLE.map(() => new Vector3());
  const beadOn = PEOPLE.map(() => 0);
  const spotT = new Vector3(), fanT = new Vector3();
  const Z = new Vector3(0, 0, 1);
  const Y = new Vector3(0, 1, 0);
  let lastKey = '';
  let lastP = 0;
  let cutT = -99;
  let led = 0;
  let windowGlow = 0;
  const windowAt = new Vector3(WINDOW.x, WINDOW.y, KIOSK.front + 0.05);
  const qf = new Quaternion();

  /** The strips' phases, each 0 to 1: rising into the fan, folding, the card forming, the cards settling. */
  const riseOf = (p: number, i: number): number => seg(p, 0.1 + i * 0.003, 0.142 + i * 0.003);
  const foldOf = (p: number, i: number): number => seg(p, 0.145 + i * 0.004, 0.166 + i * 0.004);
  const formOf = (p: number, i: number): number => seg(p, 0.158 + i * 0.004, 0.184 + i * 0.004);
  const settleOf = (p: number): number => seg(p, 0.19, 0.214);
  const flyOf = (p: number, i: number): number => seg(p, 0.222 + i * 0.0045, 0.27 + i * 0.0035);
  const diveOf = (p: number, i: number): number => seg(p, 0.27 + i * 0.0035, 0.281 + i * 0.0035);
  const upOf = (p: number, i: number): number => seg(p, 0.284 + (i % 3) * 0.006 + (i < 3 ? 0.012 : 0), 0.316 + (i % 3) * 0.006 + (i < 3 ? 0.014 : 0));
  const sendOf = (p: number, i: number): number => seg(p, 0.338 + i * 0.006, 0.452 + i * 0.002);

  const update = (p: number, t: number, tall: boolean, speed = 0): boolean => {
    narrow = tall;
    // ── The printer: it shakes a little while the paper runs (as fast as the page moves it), its light blinks ──
    const printing = seg(p, 0.01, 0.07);
    const runs = printing > 0 && printing < 1 ? Math.min(1, Math.abs(speed) * 14) : 0;
    const shake = 0.0055 * runs;
    printer.position.set(Math.sin(t * 61) * shake, Math.abs(Math.sin(t * 47)) * shake * 0.6, Math.sin(t * 53) * shake * 0.7);
    led = printing > 0 && printing < 1 ? (Math.sin(t * 15) > 0 ? 1 : 0.25) : 0.3;
    shared.uGlow.value[1] = led;
    // ── The cut: a burst of gold sparks along the blade as it comes down (once, going forward) ──
    if (lastP < 0.088 && p >= 0.088 && p < 0.12) {
      cutT = t;
      world.sparks.burst(new Vector3(PRINTER.x, DESK.top + 0.05, DESK.edge + 0.02), 20, t, { along: X, len: PAPER_W + 0.08, dir: new Vector3(0.2, 1, 0.35).normalize(), speed: 1.25, life: 0.6, size: 0.1 });
    }
    lastP = p;
    // ── Printing: the paper's leading edge runs along the path ──
    const fed = path.total * out3(seg(p, 0.01, 0.07));
    const upper = Math.min(fed, path.cut);
    for (let k = 0; k <= UP_SEGS; k++) {
      pAt((upper * k) / UP_SEGS, pp);
      c.set(PRINTER.x, pp.y, pp.z);
      n.set(0, -pp.tz, pp.ty);
      put(0, k, c, X, PAPER_W / 2, n);
    }
    // ── The cut ──
    const drop = seg(p, 0.074, 0.088);
    const cut = p >= 0.088;
    if (cut !== wasCut) { setInfo(cut); infoAttr.needsUpdate = true; wasCut = cut; }
    const spread = cut ? smooth(seg(p, 0.088, 0.1)) : 0;
    const hang = Math.max(0, fed - path.cut);
    // ── The strips ──
    for (let i = 0; i < 6; i++) {
      const r = i + 1;
      const [x0, x1] = stripX[i];
      const gap = 0.0075 * spread;
      const hw = Math.max(0.001, (x1 - x0) / 2 - gap);
      const xc = (x0 + x1) / 2 + (i - 2.5) * 0.005 * spread;
      const rise = riseOf(p, i);
      if (rise <= 0) {
        // Hanging along the path; once cut, a little swing, and they flutter as they part.
        const swing = cut ? settle(seg(p, 0.088, 0.115), 2.2, 4) * 0.04 * (i % 2 ? 1 : -1) : 0;
        const flutter = cut ? Math.max(Math.exp(-Math.max(0, t - cutT) * 2.2), Math.sin(Math.PI * seg(p, 0.088, 0.1))) : 0;
        for (let k = 0; k <= STRIP_SEGS; k++) {
          pAt(path.cut + (hang * k) / STRIP_SEGS, pp);
          const below = Math.max(0, DESK.top - pp.y);
          const f = flutter * (k / STRIP_SEGS);
          c.set(xc + Math.sin(t * 9.5 + i * 2.3) * 0.006 * f, pp.y, pp.z + swing * below + Math.sin(t * 13 + k * 0.5 + i * 1.7) * 0.018 * f);
          n.set(0, -pp.tz, pp.ty);
          put(r, k, c, X, hw, n);
        }
        continue;
      }
      // Rising: carried by its top end along an arc into the fan, turning to face the viewer as it goes.
      const e = inOut(rise);
      const start = v.set(xc, DESK.top - 0.02, DESK.edge + 0.018);
      const end = fanSpot(i, fanT);
      const ctl = w.set(lerp(start.x, end.x, 0.5), Math.max(start.y, end.y) + 0.25, lerp(start.z, end.z, 0.5) + 0.25);
      const u = 1 - e;
      const ax = u * u * start.x + 2 * u * e * ctl.x + e * e * end.x;
      const ay = u * u * start.y + 2 * u * e * ctl.y + e * e * end.y;
      const az = u * u * start.z + 2 * u * e * ctl.z + e * e * end.z;
      qr.setFromAxisAngle(Z, fanRoll(i) * e);
      q.identity().slerp(FACE, e).multiply(qr);
      // A soft wave down the strip while it travels, gone once it arrives.
      const wave = Math.sin(e * Math.PI) * 0.12;
      // The fold: the lower half swings up behind the upper half.
      const fold = inOut(foldOf(p, i));
      const th = fold * Math.PI * 0.985;
      const form = formOf(p, i);
      const gone = form > 0.55 ? 0 : 1;
      a.copy(X).applyQuaternion(q);
      for (let k = 0; k <= STRIP_SEGS; k++) {
        const s = (L * k) / STRIP_SEGS;
        let ly: number, lz: number, ty: number, tz: number;
        if (s <= L / 2) {
          ly = -s; lz = wave * Math.sin((s / L) * Math.PI * 2); ty = -1; tz = 0;
        } else {
          const d = s - L / 2;
          ly = -L / 2 - d * Math.cos(th);
          lz = -d * Math.sin(th) - 0.008 * Math.sin(th / 2);
          ty = -Math.cos(th); tz = -Math.sin(th);
        }
        c.set(0, ly * gone, lz * gone).applyQuaternion(q);
        c.x += ax; c.y += ay; c.z += az;
        T.set(0, ty, tz).applyQuaternion(q);
        n.crossVectors(a, T).normalize();
        put(r, k, c, a, hw * gone, n);
      }
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
    paperGeo.computeBoundingSphere();
    // ── The bar ──
    const raise = 0.42 * (1 - drop * drop) + (p >= 0.088 ? -0.012 * settle(seg(p, 0.088, 0.104), 2, 6) : 0);
    bar.position.set(BAR_REST.x, BAR_REST.y + raise, BAR_REST.z);
    bar.visible = fed > path.cut * 0.8;

    // ── The cards ──
    const st = inOut(settleOf(p));
    for (let i = 0; i < 6; i++) {
      const form = formOf(p, i);
      const fly = flyOf(p, i), dive = diveOf(p, i), up = upOf(p, i);
      let s = 0, sx = 1, sy = 1;
      q.copy(FACE);
      if (form > 0 && fly <= 0) {
        // Widening out of the folded strip, then settling into its place over the desk.
        const f = fanSpot(i, fanT);
        qr.setFromAxisAngle(Z, fanRoll(i));
        c.copy(f).add(v.set(0, -L / 4, 0).applyQuaternion(q2.copy(FACE).multiply(qr)));
        cardSpot(i, tall, spotT);
        c.lerp(spotT, st);
        qr.setFromAxisAngle(Z, fanRoll(i) * (1 - st));
        // A quick flip as it forms: it turns from its back to its face.
        qf.setFromAxisAngle(Y, (1 - smooth(seg(form, 0, 0.75))) * Math.PI);
        q.copy(FACE).multiply(qr).multiply(qf);
        const grow = outBack(form, 1.6);
        const w0 = (stripX[i][1] - stripX[i][0]) / CARD.w;
        sx = lerp(w0, 1, grow);
        sy = lerp(L / 2 / CARD.h, 1, smooth(form));
        s = 1;
        c.y += Math.sin(t * 1.6 + i * 1.1) * 0.022 * st;
      } else if (fly > 0 && dive < 1) {
        const e = inOut(fly);
        cardSpot(i, tall, spotT);
        const tray = trays[i % 3];
        const p1 = v.copy(spotT).add(scl.set(2.6, 1.2, 0.5));
        const p2 = w.copy(tray).add(n.set(-2.2, 1.4, 0.9));
        const u = 1 - e;
        c.set(0, 0, 0).addScaledVector(spotT, u * u * u).addScaledVector(p1, 3 * u * u * e).addScaledVector(p2, 3 * u * e * e).addScaledVector(tray, e * e * e);
        q2.setFromAxisAngle(RIGHT, Math.sin(e * Math.PI) * 0.16 * (i % 2 ? 1 : -1));
        q.premultiply(q2);
        s = lerp(1, 0.5, e);
        if (dive > 0) { c.z -= 0.18 * dive; c.y -= 0.05 * dive; s = lerp(0.5, 0.0, smooth(dive)); }
      } else if (up > 0) {
        const e = out3(up);
        riseWalk[i].at(e, c);
        if (up >= 1) { c.copy(grid[i]); c.y += Math.sin(t * 1.4 + i * 0.9) * 0.025; }
        else c.y += (CARD.h / 2 + 0.02) * e;
        s = lerp(0.2, 1, outBack(up, 1.4));
      }
      cardShow[i] = s > 0.05 && (form > 0.55 || fly > 0);
      cardPos[i].copy(c);
      // A light sweeps across the frame as it settles into shape.
      const sw = seg(form, 0.5, 0.97);
      shared.uSheen.value[i].set(c.x, c.y, c.z, sw > 0 && sw < 1 && fly <= 0 ? lerp(-0.42, 0.42, sw) : -1);
      scl.set(Math.max(0.0001, s * sx), Math.max(0.0001, s * sy), Math.max(0.0001, s));
      mtx.compose(c, q, scl);
      cards.setMatrixAt(i, mtx);
    }
    cards.instanceMatrix.needsUpdate = true;

    // ── Wires and packets ──
    for (let k = 0; k < 3; k++) {
      lowWires[k].draw(out3(seg(p, 0.284 + k * 0.006, 0.3 + k * 0.006)));
      highWires[k].draw(out3(seg(p, 0.3 + k * 0.006, 0.312 + k * 0.006)));
    }
    for (let k = 0; k < 6; k++) shared.uPulse.value[k] = -1;
    windowGlow = 0;
    for (let i = 0; i < 6; i++) {
      const go = sendOf(p, i);
      if (go > 0 && go < 1) {
        // Where the packet is among its walk's points: on a wire (a pulse runs there), or leaving the window.
        const fi = packetWalk[i].locate(inOut(go));
        const hi = i < 3 ? 9 : 0;
        if (i < 3 && fi <= 8) shared.uPulse.value[3 + i] = 1 - fi / 8;
        else if (fi >= hi && fi <= hi + 24) shared.uPulse.value[i % 3] = 1 - (fi - hi) / 24;
        windowGlow = Math.max(windowGlow, Math.max(0, 1 - Math.abs(fi - (hi + 25)) / 2.2));
      }
      let on = 0;
      if (go > 0 && go < 1) { packetWalk[i].at(inOut(go), beadPos[i]); on = 1; }
      else if (go >= 1) { packetWalk[i].at(1, beadPos[i]); on = 1 - seg(p, 0.452 + i * 0.002, 0.468 + i * 0.002); }
      beadOn[i] = on;
      scl.setScalar(on > 0 ? 0.6 + 0.4 * on : 0.0001);
      mtx.compose(beadPos[i], q.identity(), scl);
      beads.setMatrixAt(i, mtx);
    }
    beads.instanceMatrix.needsUpdate = true;
    shared.uGlow.value[2] = windowGlow;

    const key = `${fed.toFixed(4)}|${drop.toFixed(4)}|${tall}|${shake.toFixed(4)}|${PEOPLE.map((_, i) => `${riseOf(p, i).toFixed(3)}${foldOf(p, i).toFixed(3)}${formOf(p, i).toFixed(3)}`).join(',')}|${seg(p, 0.185, 0.34).toFixed(4)}`;
    const moved = key !== lastKey;
    lastKey = key;
    return moved;
  };

  const halos = (h: Halos, p: number, t: number): void => {
    for (let i = 0; i < 6; i++) if (beadOn[i] > 0) h.push(beadPos[i], 0.4, beadOn[i] * (0.9 + 0.1 * Math.sin(t * 9 + i)));
    if (p < 0.2) h.push(v.copy(ledAt).add(printer.position), 0.16, led * 0.85);
    // The blade's flash at the cut: a line of light along it, gone in a quarter of a second.
    const age = t - cutT;
    if (age >= 0 && age < 0.3 && p < 0.12) {
      const k = 1 - age / 0.3;
      world.beams.push(v.set(PRINTER.x - PAPER_W / 2 - 0.08, DESK.top + 0.06, DESK.edge + 0.01), w.set(PRINTER.x + PAPER_W / 2 + 0.08, DESK.top + 0.06, DESK.edge + 0.01), 0.07, k);
      h.push(v.set(PRINTER.x, DESK.top + 0.06, DESK.edge + 0.02), 0.7, k);
    }
    if (windowGlow > 0.01) h.push(windowAt, 0.9, windowGlow * 0.75);
    // A brief flash where the bar meets the paper.
    const flash = p > 0.087 && p < 0.106 ? 1 - seg(p, 0.088, 0.106) : 0;
    if (flash > 0) h.push(v.set(BAR_REST.x, BAR_REST.y, BAR_REST.z + 0.05), 0.9, flash * 0.8);
    // Each card's birth: a soft glow as it widens out of its strip.
    for (let i = 0; i < 6; i++) {
      const f = formOf(p, i);
      const g = f > 0 && f < 1 ? Math.sin(f * Math.PI) : 0;
      if (g > 0) h.push(cardPos[i], 0.62, g * 0.65);
    }
  };

  const people = (p: number, out: Spot[]): boolean => {
    if (p < 0.15 || p > 0.345) return false;
    for (let i = 0; i < 6; i++) { out[i].pos.copy(cardPos[i]); out[i].visible = cardShow[i]; }
    return true;
  };

  const moving = (x: number): boolean => x > 0 && x < 1;
  const items = (p: number, out: Item[]): boolean => {
    if (p >= 0.47) return false;
    for (let i = 0; i < 6; i++) {
      if (p < 0.215) {
        // Station 1: the card forming out of its strip.
        out[i].active = moving(riseOf(p, i)) || moving(foldOf(p, i)) || moving(formOf(p, i));
        out[i].done = formOf(p, i) >= 1;
      } else {
        // Station 2: the card flying in and rising, then its packet on its way to the table.
        out[i].active = moving(flyOf(p, i)) || moving(upOf(p, i)) || moving(sendOf(p, i));
        out[i].done = sendOf(p, i) >= 1;
      }
    }
    return true;
  };

  return { update, halos, people, items };
}
