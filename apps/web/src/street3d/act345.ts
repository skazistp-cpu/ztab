import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, Quaternion, SphereGeometry, TubeGeometry,
  Vector3, LatheGeometry, Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C } from './palette.ts';
import { at, frameXY, Mesher, mul, part, Pat, roundRect, slabXY, type Paint } from './geo.ts';
import { awning, plant, post, stringLights, type Bulb } from './props.ts';
import { STATION_X } from './layout.ts';
import { clamp, inOut, lerp, out3, outBack, seg, smooth } from './ease.ts';
import { shared } from './materials.ts';
import { CASTERS, type Halos, type World } from './world.ts';
import { angleOf, FACE, INLAY_Z, PEOPLE, RIGHT, STUB_X, STUB_Z, TABLE, tableSpot, UP, Y0 } from './spots.ts';
import { Walk, type Act, type Item, type Spot } from './act12.ts';

/*
 * Stations 3, 4 and 5.
 * 3, the café: the packets reach the six places at the table; the phones rise, the table code's scan line runs and
 *    a ray reaches each phone in turn (a scan bracket lights on its screen), and a blank name tag pops over each.
 *    The code is decoration: a 23-module grid of noise, which no reader decodes.
 * 4, the wallet bank: the phones glide on along the street to the bank, a vault whose door is a big phone with a
 *    wallet on its screen; a gold coin arcs from each phone into the door, which glows a little more with each.
 *    No amounts, nothing that says paid.
 * 5, the ledger house: one packet runs along the inlay from the bank to the board; a gold tick lands in each of its
 *    six rows, one by one, and the ring beside it fills. Then every lamp on the street comes on and the camera pulls
 *    back to the whole street.
 */

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 20): CylinderGeometry => new CylinderGeometry(r1, r0, h, seg);

// ── Station 3: the café ──────────────────────────────────────────────────────────────────────────────────────────

const S3 = STATION_X[2];
const COUNTER = { x: S3 - 1.05, z: -3.75, w: 2.5, d: 0.95, h: 1.05 };
/** The QR stand on the table: its panel faces the viewer (leaning back a little). */
const QR = { size: 0.27, height: 0.42, width: 0.36, lean: 0.24 };
const QR_TURN = Math.PI / 4;
/** Where the two coffee cups stand on the table (its open front, either side of the code). */
const CUP_ANGLES = [Math.PI / 4 + 0.62, Math.PI / 4 - 0.62];

function buildCafe(m: Mesher, bulbs: Bulb[]): void {
  const { x, z, w, d, h } = COUNTER;
  // The counter: slatted cream, a charcoal top.
  m.add(box(w + 0.06, 0.08, d + 0.06), at(x, Y0 + 0.04, z), { color: C.cream, part: part(), crease: true });
  m.add(box(w, h - 0.08, d), at(x, Y0 + 0.08 + (h - 0.08) / 2, z), { color: C.paper, side: C.paper, part: part(), crease: true, pat: Pat.Slats, param: 0.13 });
  m.add(box(w + 0.16, 0.1, d + 0.2), at(x, Y0 + h + 0.05, z + 0.04), { color: C.coal, part: part(), crease: true });
  const top = Y0 + h + 0.1;
  // The roof over it on two posts, its striped awning, two hanging lamps.
  for (const sx of [-1, 1]) {
    m.add(box(0.12, 1.45, 0.12), at(x + sx * (w / 2 - 0.08), top + 0.72, z - d / 2 + 0.08), { color: C.paper, side: C.cream, part: part(), crease: true });
  }
  m.add(box(w + 0.1, 0.9, 0.08), at(x, top + 0.45 + 0.12, z - d / 2 + 0.02), { color: C.paper, side: C.cream, part: part(), crease: true, pat: Pat.Slats, param: 0.13 });
  m.add(box(w + 0.35, 0.2, d + 0.65), at(x, top + 1.55, z + 0.12), { color: C.coal, part: part(), crease: true });
  awning(m, x - (w + 0.35) / 2, x + (w + 0.35) / 2, top + 1.45, z + d / 2 + 0.44, 0.5, 0.3, 9);
  for (const sx of [-0.6, 0.6]) {
    const lx = x + sx * 1.2 * 0.7, lz = z + 0.15;
    // Each hangs on its cord from under the roof and sways a little.
    const hang: readonly [number, number, number, number] = [0.06, top + 1.45, sx * 3.1, 1];
    m.add(cyl(0.012, 0.012, 0.3, 6), at(lx, top + 1.3, lz), { color: C.coal, part: part(), sway: hang });
    const shade = new LatheGeometry([new Vector2(0.04, 0.09), new Vector2(0.1, 0.07), new Vector2(0.15, 0.02), new Vector2(0.17, -0.03)], 18);
    m.add(shade, at(lx, top + 1.12, lz), { color: C.gold, part: part(), crease: true, sway: hang });
    const b = new Vector3(lx, top + 1.06, lz);
    m.add(new SphereGeometry(0.07, 12, 10), at(b.x, b.y, b.z), { color: C.bulbOff, part: part(), pat: Pat.Bulb, param: 2, noShadow: true, sway: hang });
    bulbs.push({ pos: b, lamp: 2, size: 0.45, sway: [hang[0], hang[1], hang[2]] });
  }
  // On the counter: a charcoal machine with gold trim, stacks of cups, a small box.
  m.add(new RoundedBoxGeometry(0.62, 0.42, 0.42, 2, 0.04), at(x - 0.55, top + 0.21, z - 0.05), { color: C.coal, part: part() });
  m.add(box(0.5, 0.035, 0.035), at(x - 0.55, top + 0.12, z + 0.17), { color: C.gold, part: part(), crease: true });
  m.add(box(0.035, 0.18, 0.035), at(x - 0.35, top + 0.3, z + 0.17), { color: C.gold, part: part(), crease: true });
  for (const [cx, n] of [[0.1, 5], [0.28, 3]] as const) {
    for (let k = 0; k < n; k++) m.add(cyl(0.065, 0.075, 0.07, 14), at(x + cx, top + 0.035 + k * 0.072, z + 0.05), { color: C.white, part: part(), crease: true });
  }
  m.add(box(0.32, 0.12, 0.22), at(x + 0.7, top + 0.06, z - 0.05), { color: C.coalDeep, part: part(), crease: true });

  // The round table: a cream top with a gold band, a fluted charcoal pedestal on a gold ring.
  const tb = part();
  m.add(cyl(TABLE.r, TABLE.r, 0.06, 48), at(TABLE.x, TABLE.top - 0.03, TABLE.z), { color: C.paper, part: tb, crease: true });
  m.add(cyl(TABLE.r + 0.035, TABLE.r + 0.035, 0.05, 48), at(TABLE.x, TABLE.top - 0.07, TABLE.z), { color: C.gold, part: part(), crease: true });
  m.add(cyl(0.24, 0.3, 0.86, 24), at(TABLE.x, Y0 + 0.08 + 0.43, TABLE.z), { color: C.coal, part: part(), pat: Pat.Slats, param: 0.07 });
  m.add(cyl(0.38, 0.38, 0.06, 32), at(TABLE.x, Y0 + 0.07, TABLE.z), { color: C.gold, part: part(), crease: true });
  m.add(cyl(0.42, 0.42, 0.05, 32), at(TABLE.x, Y0 + 0.025, TABLE.z), { color: C.coal, part: part(), crease: true });

  // The QR stand: a gold frame round a cream face (the code is drawn on it by the shader), a charcoal back leaning on it.
  const stand = mul(at(TABLE.x, TABLE.top, TABLE.z, 0, QR_TURN, 0), at(0, 0, 0, -QR.lean, 0, 0));
  const g = (mat: Matrix4): Matrix4 => mul(stand, mat);
  m.add(frameXY(QR.width, QR.height, 0.03, 0.035, 0.04), g(at(0, QR.height / 2, 0.0)), { color: C.gold, part: part(), crease: true });
  m.add(box(QR.width - 0.06, QR.height - 0.06, 0.02), g(at(0, QR.height / 2, 0.012)), { color: C.white, part: part(), pat: Pat.Qr });
  // The back leg of the tent card hinges at the face's top and reaches back down to the table.
  const topY = QR.height * Math.cos(QR.lean), topZ = -QR.height * Math.sin(QR.lean);
  const legLean = 0.55, legLen = topY / Math.cos(legLean);
  const back = mul(at(TABLE.x, TABLE.top, TABLE.z, 0, QR_TURN, 0), at(0, topY, topZ - 0.03, legLean, 0, 0));
  m.add(box(QR.width - 0.05, legLen, 0.025), mul(back, at(0, -legLen / 2, -0.015)), { color: C.coal, part: part(), crease: true });
  // The code's face for the shader: its top-left corner and its axes.
  const face = g(at(0, QR.height / 2, 0.024));
  const ux = new Vector3(1, 0, 0).transformDirection(face);
  const vy = new Vector3(0, -1, 0).transformDirection(face);
  const centre = new Vector3().setFromMatrixPosition(face);
  shared.uQrU.value.copy(ux);
  shared.uQrV.value.copy(vy);
  shared.uQrSize.value = QR.size;
  shared.uQrO.value.copy(centre).addScaledVector(ux, -QR.size / 2).addScaledVector(vy, -QR.size / 2);

  // Two cups of coffee on the table's open front, white with gold rims, on saucers (they steam).
  for (const a of CUP_ANGLES) {
    const cx = TABLE.x + 0.74 * Math.cos(a), cz = TABLE.z + 0.74 * Math.sin(a);
    m.add(cyl(0.11, 0.11, 0.014, 20), at(cx, TABLE.top + 0.007, cz), { color: C.white, part: part(), crease: true });
    const cup = part();
    m.add(cyl(0.05, 0.062, 0.085, 18), at(cx, TABLE.top + 0.014 + 0.0425, cz), { color: C.white, part: cup, crease: true });
    // A gold band round its rim (open, so the coffee shows), and the coffee just below the rim.
    m.add(new CylinderGeometry(0.0635, 0.063, 0.014, 18, 1, true), at(cx, TABLE.top + 0.092, cz), { color: C.gold, part: part(), crease: true });
    m.add(cyl(0.056, 0.056, 0.004, 16), at(cx, TABLE.top + 0.089, cz), { color: 0x4a3426, part: cup });
  }
  // Two chairs in front of the table, as in the picture.
  chair(m, at(TABLE.x - 0.3, Y0, TABLE.z + 1.35, 0, Math.PI - 0.3, 0));
  chair(m, at(TABLE.x + 1.35, Y0, TABLE.z + 0.3, 0, -Math.PI / 2 - 0.2, 0));
  plant(m, at(S3 - 2.0, Y0, -0.95), 1.15, 3.1);
  // String lights from the café's roof to a post at the plinth's corner.
  const p1 = post(m, at(S3 + 2.15, Y0, -4.55), 2.9);
  bulbs.push(...stringLights(m, new Vector3(x + w / 2 + 0.1, top + 1.5, z + 0.5), p1, 0.38, 5, 3));
}

/** A café chair (the café picture's): charcoal, a rounded back, gold tips on the legs. Faces +z at rest. */
function chair(m: Mesher, base: Matrix4): void {
  const p = part();
  const g = (mat: Matrix4): Matrix4 => mul(base, mat);
  const seat = 0.5;
  m.add(new RoundedBoxGeometry(0.5, 0.07, 0.48, 2, 0.03), g(at(0, seat, 0)), { color: C.coal, part: p });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * 0.2, lz = sz * 0.19;
    m.add(cyl(0.022, 0.03, seat - 0.08, 10), g(at(lx, (seat - 0.08) / 2 + 0.08, lz)), { color: C.coal, part: p });
    m.add(cyl(0.024, 0.024, 0.08, 10), g(at(lx, 0.04, lz)), { color: C.gold, part: part(), crease: true });
  }
  for (const sx of [-1, 1]) m.add(cyl(0.022, 0.022, 0.5, 10), g(at(sx * 0.2, seat + 0.25, -0.21)), { color: C.coal, part: p });
  m.add(new RoundedBoxGeometry(0.5, 0.26, 0.06, 2, 0.03), g(at(0, seat + 0.42, -0.22, -0.08, 0, 0)), { color: C.coal, part: p });
}

// ── Station 4: the wallet bank ───────────────────────────────────────────────────────────────────────────────────

const S4 = STATION_X[3];
const BANK = { x: S4 + 0.1, z: -3.25, w: 3.4, d: 1.65, h: 2.0 };
const DOOR = { x: S4 + 0.1, y: Y0 + 0.96, z: BANK.z + BANK.d / 2 + 0.07, w: 0.9, h: 1.5 };

function buildBank(m: Mesher, bulbs: Bulb[]): void {
  const { x, z, w, d, h } = BANK;
  m.add(box(w + 0.08, 0.12, d + 0.08), at(x, Y0 + 0.06, z), { color: C.coal, part: part(), crease: true });
  m.add(box(w, h - 0.12, d), at(x, Y0 + 0.12 + (h - 0.12) / 2, z), { color: C.paper, side: C.paper, part: part(), crease: true, pat: Pat.Slats, param: 0.14 });
  m.add(box(w + 0.24, 0.24, d + 0.3), at(x, Y0 + h + 0.12, z + 0.04), { color: C.coal, part: part(), crease: true });
  m.add(box(w - 0.7, 0.34, d - 0.1), at(x + 0.1, Y0 + h + 0.24 + 0.17, z - 0.08), { color: C.coal, part: part(), crease: true });
  // The portal: a charcoal surround, two cream columns with gold bands, a gold bar across the top.
  m.add(box(DOOR.w + 0.36, DOOR.h + 0.36, 0.1), at(DOOR.x, Y0 + 0.12 + (DOOR.h + 0.36) / 2 - 0.12, BANK.z + d / 2 + 0.05), { color: C.coal, part: part(), crease: true });
  for (const sx of [-1, 1]) {
    const cx = DOOR.x + sx * (DOOR.w / 2 + 0.34);
    m.add(cyl(0.085, 0.085, 1.62, 18), at(cx, Y0 + 0.2 + 0.81, BANK.z + d / 2 + 0.1), { color: C.paper, part: part() });
    m.add(cyl(0.12, 0.12, 0.09, 18), at(cx, Y0 + 0.17, BANK.z + d / 2 + 0.1), { color: C.gold, part: part(), crease: true });
    m.add(cyl(0.12, 0.12, 0.09, 18), at(cx, Y0 + 1.83, BANK.z + d / 2 + 0.1), { color: C.gold, part: part(), crease: true });
    m.add(box(0.26, 0.12, 0.2), at(cx, Y0 + 0.06, BANK.z + d / 2 + 0.1), { color: C.coal, part: part(), crease: true });
  }
  m.add(cyl(0.065, 0.065, DOOR.w + 1.1, 18), at(DOOR.x, Y0 + 1.96, BANK.z + d / 2 + 0.14, 0, 0, Math.PI / 2), { color: C.gold, part: part() });
  for (const sx of [-1, 1]) m.add(cyl(0.08, 0.08, 0.05, 18), at(DOOR.x + sx * (DOOR.w / 2 + 0.58), Y0 + 1.96, BANK.z + d / 2 + 0.14, 0, 0, Math.PI / 2), { color: C.goldDeep, part: part(), crease: true });
  // The door: a big phone. Charcoal body, gold edge, a cream screen that glows, a wallet on it.
  const dz = DOOR.z;
  m.add(slabXY(roundRect(DOOR.w, DOOR.h, 0.1, 6), 0.08), at(DOOR.x, DOOR.y, dz - 0.04), { color: C.coal, part: part() });
  m.add(frameXY(DOOR.w + 0.03, DOOR.h + 0.03, 0.11, 0.025, 0.085), at(DOOR.x, DOOR.y, dz - 0.045), { color: C.gold, part: part(), crease: true });
  m.add(slabXY(roundRect(DOOR.w - 0.14, DOOR.h - 0.26, 0.04, 4), 0.02), at(DOOR.x, DOOR.y + 0.02, dz + 0.035), { color: C.paper, part: part(), pat: Pat.Glow, param: 0 });
  m.add(box(0.2, 0.025, 0.012), at(DOOR.x, DOOR.y - DOOR.h / 2 + 0.07, dz + 0.042), { color: C.gold, part: part(), crease: true });
  // The wallet on the screen.
  const wy = DOOR.y + 0.06;
  m.add(slabXY(roundRect(0.4, 0.28, 0.05, 4), 0.025), at(DOOR.x, wy, dz + 0.055), { color: C.coal, part: part(), crease: true });
  m.add(slabXY(roundRect(0.32, 0.1, 0.03, 3), 0.02), at(DOOR.x - 0.02, wy + 0.16, dz + 0.045, 0, 0, 0.12), { color: C.coalDeep, part: part(), crease: true });
  m.add(cyl(0.035, 0.035, 0.02, 14), at(DOOR.x + 0.13, wy - 0.01, dz + 0.085, Math.PI / 2, 0, 0), { color: C.paper, part: part() });
  // Wall lamps either side, gold domes.
  for (const sx of [-1, 1]) {
    const lx = x + sx * 1.32, ly = Y0 + 1.55, lz = BANK.z + d / 2 + 0.02;
    m.add(box(0.05, 0.05, 0.22), at(lx, ly + 0.1, lz + 0.1), { color: C.coal, part: part(), crease: true });
    const shade = new LatheGeometry([new Vector2(0.03, 0.07), new Vector2(0.09, 0.05), new Vector2(0.14, 0.0), new Vector2(0.15, -0.04)], 16);
    m.add(shade, at(lx, ly, lz + 0.2), { color: C.gold, part: part(), crease: true });
    const b = new Vector3(lx, ly - 0.06, lz + 0.2);
    m.add(new SphereGeometry(0.06, 12, 10), at(b.x, b.y, b.z), { color: C.bulbOff, part: part(), pat: Pat.Bulb, param: 3, noShadow: true });
    bulbs.push({ pos: b, lamp: 3, size: 0.42 });
  }
  // Stacks of coins by the door, and plants either side.
  const coinStack = (cx: number, cz: number, n: number): void => {
    for (let k = 0; k < n; k++) m.add(cyl(0.12, 0.12, 0.045, 22), at(cx, Y0 + 0.0225 + k * 0.047, cz, 0, k * 0.4, 0), { color: C.gold, part: part(), crease: true });
  };
  coinStack(DOOR.x - 1.0, DOOR.z + 0.45, 5);
  coinStack(DOOR.x - 0.72, DOOR.z + 0.62, 3);
  coinStack(DOOR.x - 1.08, DOOR.z + 0.85, 1);
  plant(m, at(S4 - 2.0, Y0, -1.25), 1.1, 4.2);
  plant(m, at(S4 + 1.95, Y0, -1.05), 1.0, 5.3);
}

// ── Station 5: the ledger house ──────────────────────────────────────────────────────────────────────────────────

const S5 = STATION_X[4];
const HOUSE = { x: S5 - 0.15, z: -3.2, w: 3.0, d: 1.7, h: 2.35 };
const BOARD = { x: S5 - 0.55, row: 0.24, y0: 0.72, rows: 6, w: 1.55, z: HOUSE.z + HOUSE.d / 2 + 0.07 };
const RING = { x: S5 + 0.72, y: Y0 + 1.75, z: HOUSE.z + HOUSE.d / 2 + 0.04, r: 0.27, tube: 0.05 };

const doorLights: Bulb[] = [];
function buildHouse(m: Mesher): void {
  const { x, z, w, d, h } = HOUSE;
  m.add(box(w + 0.08, 0.1, d + 0.08), at(x, Y0 + 0.05, z), { color: C.cream, part: part(), crease: true });
  m.add(box(w, h - 0.1, d), at(x, Y0 + 0.1 + (h - 0.1) / 2, z), { color: C.paper, side: C.paper, part: part(), crease: true, pat: Pat.Slats, param: 0.14 });
  m.add(box(w + 0.28, 0.26, d + 0.34), at(x, Y0 + h + 0.13, z + 0.04), { color: C.coal, part: part(), crease: true });
  // The board: a charcoal frame round a cream face ruled in six rows (row lines drawn by the shader).
  const bh = BOARD.row * BOARD.rows;
  const by = BOARD.y0 + bh / 2;
  m.add(frameXY(BOARD.w + 0.14, bh + 0.14, 0.02, 0.07, 0.07), at(BOARD.x, by, BOARD.z - 0.035), { color: C.coal, part: part(), crease: true });
  m.add(box(BOARD.w, bh, 0.02), at(BOARD.x, by, BOARD.z - 0.01), { color: C.white, part: part(), pat: Pat.Ledger, param: BOARD.row });
  // A gold picture light over the board, on two charcoal arms.
  for (const sx of [-1, 1]) m.add(box(0.03, 0.03, 0.2), at(BOARD.x + sx * 0.45, by + bh / 2 + 0.2, BOARD.z + 0.06), { color: C.coal, part: part(), crease: true });
  m.add(cyl(0.04, 0.04, 1.05, 16), at(BOARD.x, by + bh / 2 + 0.17, BOARD.z + 0.16, 0, 0, Math.PI / 2), { color: C.gold, part: part() });
  // The ring's track (it fills with gold).
  m.add(new TubeGeometry(circle(RING.r, 64), 64, RING.tube * 0.92, 8, true), at(RING.x, RING.y, RING.z), { color: C.cream, side: C.cream, part: part(), crease: false });
  // The doorway on the side: a frame standing out from the wall, a warm-lit room inside it, a gold lamp hanging there.
  const wx = x + w / 2, dz = z + 0.15, dw = 0.74, dh = 1.5, depth = 0.2, yb = Y0 + 0.1;
  m.add(box(0.012, dh, dw), at(wx + 0.006, yb + dh / 2, dz), { color: 0xf1cf83, part: part(), pat: Pat.Unlit });
  m.add(box(depth, 0.012, dw), at(wx + depth / 2, yb + 0.006, dz), { color: 0xe7c272, part: part(), pat: Pat.Unlit });
  m.add(box(depth, dh, 0.012), at(wx + depth / 2, yb + dh / 2, dz - dw / 2 + 0.006), { color: 0xdcb565, part: part(), pat: Pat.Unlit });
  m.add(box(depth, dh, 0.012), at(wx + depth / 2, yb + dh / 2, dz + dw / 2 - 0.006), { color: 0xf6dc9c, part: part(), pat: Pat.Unlit });
  m.add(box(depth, 0.012, dw), at(wx + depth / 2, yb + dh - 0.006, dz), { color: 0xc99f50, part: part(), pat: Pat.Unlit });
  const jamb: Paint = { color: C.white, side: C.cream, part: part(), crease: true };
  m.add(box(depth + 0.04, dh + 0.1, 0.08), at(wx + depth / 2, yb + (dh + 0.1) / 2, dz - dw / 2 - 0.04), jamb);
  m.add(box(depth + 0.04, dh + 0.1, 0.08), at(wx + depth / 2, yb + (dh + 0.1) / 2, dz + dw / 2 + 0.04), jamb);
  m.add(box(depth + 0.04, 0.1, dw + 0.16), at(wx + depth / 2, yb + dh + 0.05, dz), jamb);
  m.add(box(0.03, 0.03, 0.3), at(wx + 0.02, yb + dh - 0.25, dz + 0.4), { color: C.coal, part: part(), crease: true });
  const lx = wx + 0.09, ly = yb + dh - 0.3;
  const hang: readonly [number, number, number, number] = [0.05, ly + 0.28, 4.4, 1];
  m.add(cyl(0.008, 0.008, 0.26, 6), at(lx, ly + 0.15, dz), { color: C.coal, part: part(), sway: hang });
  const dome = new LatheGeometry([new Vector2(0.03, 0.07), new Vector2(0.08, 0.05), new Vector2(0.12, 0.0), new Vector2(0.13, -0.03)], 16);
  m.add(dome, at(lx, ly, dz), { color: C.gold, part: part(), crease: true, sway: hang });
  const bulb = new Vector3(lx, ly - 0.06, dz);
  m.add(new SphereGeometry(0.055, 12, 10), at(bulb.x, bulb.y, bulb.z), { color: C.bulbOff, part: part(), pat: Pat.Bulb, param: 4, noShadow: true, sway: hang });
  doorLights.push({ pos: bulb, lamp: 4, size: 0.5, sway: [hang[0], hang[1], hang[2]] }, { pos: new Vector3(wx + 0.3, yb + dh * 0.45, dz), lamp: 4, size: 1.15 });
  plant(m, at(S5 + 0.55, Y0, -1.05), 1.05, 6.1);
  plant(m, at(S5 - 2.05, Y0, -1.15), 0.9, 6.9);
}

/** A circle in the XY plane as a curve (for the ring's tubes). */
function circle(r: number, n: number): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  // Starts at the top and runs clockwise (as a progress ring does).
  for (let k = 0; k < n; k++) {
    const a = Math.PI / 2 - (k / n) * Math.PI * 2;
    pts.push(new Vector3(r * Math.cos(a), r * Math.sin(a), 0));
  }
  return new CatmullRomCurve3(pts, true, 'centripetal');
}

// ── The moving parts ──────────────────────────────────────────────────────────────────────────────────────────────

function phoneGeometry(): BufferGeometry {
  const m = new Mesher();
  const p = part();
  m.add(slabXY(roundRect(0.2, 0.37, 0.035, 4), 0.03), at(0, 0, -0.015), { color: C.coal, part: p });
  m.add(frameXY(0.212, 0.382, 0.04, 0.012, 0.026), at(0, 0, -0.013), { color: C.gold, part: p, crease: true });
  m.add(slabXY(roundRect(0.165, 0.31, 0.02, 3), 0.004), at(0, 0.008, 0.015), { color: C.white, part: p, pat: Pat.Screen });
  return m.build();
}
/** The scan brackets on a phone's screen: four gold corners. */
function bracketGeometry(): BufferGeometry {
  const m = new Mesher();
  const p = part();
  const s = 0.055, t = 0.012, L = 0.03;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    m.add(box(L, t, 0.006), at(sx * (s - L / 2 + t / 2), sy * s + 0.01, 0.021), { color: C.gold, part: p });
    m.add(box(t, L, 0.006), at(sx * s, sy * (s - L / 2 + t / 2) + 0.01, 0.021), { color: C.gold, part: p });
  }
  return m.build();
}
/** A blank name tag: a cream bubble in a gold frame with a small tail. */
function tagGeometry(): BufferGeometry {
  const m = new Mesher();
  const p = part();
  m.add(frameXY(0.46, 0.2, 0.07, 0.025, 0.03), at(0, 0, -0.015), { color: C.gold, part: p, crease: true });
  m.add(slabXY(roundRect(0.42, 0.16, 0.05, 4), 0.02), at(0, 0, -0.012), { color: C.white, part: p, pat: Pat.Screen });
  m.add(slabXY([[-0.04, -0.098], [0.04, -0.098], [0, -0.16]], 0.03), at(0, 0, -0.015), { color: C.gold, part: p });
  return m.build();
}
function coinGeometry(): BufferGeometry {
  const m = new Mesher();
  const p = part();
  m.add(cyl(0.11, 0.11, 0.028, 26), at(0, 0, 0, Math.PI / 2, 0, 0), { color: C.gold, part: p, crease: true });
  m.add(cyl(0.075, 0.075, 0.032, 26), at(0, 0, 0, Math.PI / 2, 0, 0), { color: C.goldHi, part: p, crease: false });
  return m.build();
}
function tickGeometry(): BufferGeometry {
  const m = new Mesher();
  const p = part();
  // A check mark: a short arm and a long one, meeting at the bottom.
  m.add(box(0.08, 0.034, 0.035), at(-0.035, 0.0, 0, 0, 0, -0.85), { color: C.gold, part: p, crease: true });
  m.add(box(0.15, 0.034, 0.035), at(0.035, 0.045, 0, 0, 0, 0.95), { color: C.gold, part: p, crease: true });
  return m.build();
}

export interface Act345 extends Act {
  /** Bulbs that belong to these stations (lit with the street's lamps). */
  bulbs: Bulb[];
}

export function act345(world: World): Act345 {
  const still = new Mesher();
  const bulbs: Bulb[] = [];
  buildCafe(still, bulbs);
  buildBank(still, bulbs);
  buildHouse(still);
  bulbs.push(...doorLights);
  world.addStill(still, 'stations-3-5');

  const phones = new InstancedMesh(phoneGeometry(), world.moving, 6);
  const brackets = new InstancedMesh(bracketGeometry(), world.moving, 6);
  const tags = new InstancedMesh(tagGeometry(), world.moving, 6);
  const coins = new InstancedMesh(coinGeometry(), world.moving, 6);
  const ticks = new InstancedMesh(tickGeometry(), world.moving, 6);
  for (const im of [phones, brackets, tags, coins, ticks]) { im.frustumCulled = false; world.addMoving(im, true); }
  brackets.layers.disable(CASTERS);

  // The ring's gold fill: a tube drawn on round the track.
  const ringM = new Mesher();
  ringM.add(new TubeGeometry(circle(RING.r, 64), 96, RING.tube, 8, true), at(RING.x, RING.y, RING.z + 0.012), { color: C.gold, part: part(), crease: false });
  const ringGeo = ringM.build();
  ringGeo.setDrawRange(0, 0);
  const ring = world.movingMesh(ringGeo, false);
  ring.frustumCulled = false;

  // The last packet: from the bank's door along the inlay to the board.
  const lastWalk = new Walk([
    new Vector3(DOOR.x, DOOR.y - 0.2, DOOR.z + 0.15),
    new Vector3(STUB_X[3], Y0 + 0.035, DOOR.z + 0.4),
    new Vector3(STUB_X[3], Y0 + 0.035, -0.02),
    new Vector3(STUB_X[3], 0.035, 0.04),
    new Vector3(STUB_X[3], 0.035, INLAY_Z),
    new Vector3(STUB_X[4], 0.035, INLAY_Z),
    new Vector3(STUB_X[4], 0.035, 0.04),
    new Vector3(STUB_X[4], Y0 + 0.035, -0.02),
    new Vector3(STUB_X[4], Y0 + 0.035, STUB_Z),
    new Vector3(BOARD.x - BOARD.w / 2 + 0.2, BOARD.y0 + BOARD.row * 5.5, BOARD.z + 0.08),
  ]);
  const lastPos = new Vector3();
  let lastOn = 0;

  // Where each phone is: on the table, standing over it, then hovering before the bank.
  const rest = PEOPLE.map((_, i) => tableSpot(i));
  const stand = PEOPLE.map((_, i) => {
    const a = angleOf(i);
    return new Vector3(TABLE.x + 0.74 * Math.cos(a), TABLE.top + 0.36, TABLE.z + 0.74 * Math.sin(a));
  });
  // A neat arc in front of the door (centred on it on screen), its ends drawn back a little toward the building.
  const TOWARD = new Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  const hoverWide = PEOPLE.map((_, i) => {
    const c = (i - 2.5) / 2.5;
    return new Vector3(DOOR.x + 0.85, Y0 + 1.12 + 0.2 * (1 - c * c), DOOR.z + 0.85).addScaledVector(RIGHT, c * 1.32).addScaledVector(TOWARD, -0.32 * c * c);
  });
  // On a phone: two rows of three, so every name fits on the screen.
  const hoverTall = PEOPLE.map((_, i) => {
    const col = (i % 3) - 1, row = i < 3 ? 1 : 0;
    return new Vector3(DOOR.x + 0.85, Y0 + 0.95 + row * 0.72, DOOR.z + 0.85).addScaledVector(RIGHT, col * 0.88);
  });
  let hover = hoverWide;
  const rowAt = (k: number, out: Vector3): Vector3 => out.set(BOARD.x - BOARD.w / 2 + 0.2, BOARD.y0 + BOARD.row * (BOARD.rows - k - 0.5), BOARD.z + 0.03);

  const qFlat = PEOPLE.map((_, i) => {
    // Lying face up, its long side pointing at the code in the middle.
    const a = angleOf(i);
    return new Quaternion().setFromAxisAngle(UP, -a - Math.PI / 2).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
  });
  const qUp = PEOPLE.map((_, i) => new Quaternion().setFromAxisAngle(UP, (i - 2.5) * -0.07).multiply(FACE));

  const c = new Vector3(), v = new Vector3(), w = new Vector3(), q = new Quaternion(), scl = new Vector3(), mtx = new Matrix4();
  const phonePos = PEOPLE.map(() => new Vector3());
  const phoneShow = PEOPLE.map(() => false);
  const tagPos = PEOPLE.map(() => new Vector3());
  const tagShow = PEOPLE.map(() => 0);
  const coinPos = PEOPLE.map(() => new Vector3());
  const coinOn = PEOPLE.map(() => 0);
  const tickOn = PEOPLE.map(() => 0);
  const qrCentre = new Vector3().copy(shared.uQrO.value).addScaledVector(shared.uQrU.value, QR.size / 2).addScaledVector(shared.uQrV.value, QR.size / 2);
  let scanAt = -1;
  let doorGlow = 0;
  let lastKey = '';
  let lastP = 0;
  const landT = PEOPLE.map(() => -99);
  const coinGlint = PEOPLE.map(() => 0);
  const Zax = new Vector3(0, 0, 1);
  const qw = new Quaternion();
  const steamFrom = [
    new Vector3(COUNTER.x - 0.55, Y0 + COUNTER.h + 0.1 + 0.45, COUNTER.z - 0.05),
    ...CUP_ANGLES.map(a => new Vector3(TABLE.x + 0.74 * Math.cos(a), TABLE.top + 0.12, TABLE.z + 0.74 * Math.sin(a))),
  ];

  const arriveOf = (p: number, i: number): number => seg(p, 0.452 + i * 0.002, 0.47 + i * 0.002);
  const riseOf = (p: number, i: number): number => seg(p, 0.48 + i * 0.006, 0.515 + i * 0.006);
  const scanOf = (p: number, i: number): number => seg(p, 0.528 + i * 0.008, 0.546 + i * 0.008);
  const tagOf = (p: number, i: number): number => seg(p, 0.548 + i * 0.008, 0.566 + i * 0.008);
  const goOf = (p: number, i: number): number => seg(p, 0.616 + i * 0.004, 0.66 + i * 0.003);
  const coinOf = (p: number, i: number): number => seg(p, 0.672 + i * 0.012, 0.7 + i * 0.012);
  const leaveOf = (p: number): number => seg(p, 0.79, 0.806);
  const tickOf = (p: number, k: number): number => seg(p, 0.838 + k * 0.009, 0.85 + k * 0.009);

  const update = (p: number, t: number, tall: boolean): boolean => {
    hover = tall ? hoverTall : hoverWide;
    // Events, going forward: a coin goes into the door (a ring spreads on it), a tick lands (a burst of sparks).
    for (let i = 0; i < 6; i++) {
      if (coinOf(lastP, i) < 1 && coinOf(p, i) >= 1) landT[i] = t;
      if (tickOf(lastP, i) < 0.55 && tickOf(p, i) >= 0.55 && p < 0.95) {
        world.sparks.burst(rowAt(i, new Vector3()).add(new Vector3(0, 0.02, 0.06)), 9, t, { dir: new Vector3(0.1, 1, 0.3).normalize(), speed: 0.8, life: 0.5, size: 0.085 });
      }
    }
    lastP = p;
    // ── Phones ──
    const leave = leaveOf(p);
    for (let i = 0; i < 6; i++) {
      const rise = riseOf(p, i), go = goOf(p, i);
      let s = 1;
      if (go > 0) {
        // Gliding on to the bank, in an arc over the street.
        const e = inOut(go);
        v.copy(stand[i]);
        w.copy(hover[i]);
        c.copy(v).lerp(w, e);
        c.y += Math.sin(e * Math.PI) * 0.9;
        q.copy(qUp[i]);
        if (go >= 1) c.y += Math.sin(t * 1.5 + i) * 0.025;
        // A touch larger at the bank, where they stand on their own.
        s = (1 + 0.3 * smooth(go)) * (1 - smooth(leave));
      } else if (rise > 0) {
        const e = inOut(rise);
        c.copy(rest[i]).lerp(stand[i], e);
        c.y += Math.sin(e * Math.PI) * 0.12;
        q.copy(qFlat[i]).slerp(qUp[i], e);
        if (rise >= 1) c.y += Math.sin(t * 1.5 + i) * 0.018;
      } else {
        c.copy(rest[i]);
        q.copy(qFlat[i]);
      }
      // A tiny "haptic" wiggle while it is scanned.
      const sc = scanOf(p, i);
      if (sc > 0 && sc < 1 && go <= 0) q.multiply(qw.setFromAxisAngle(Zax, Math.sin(t * 52) * 0.085 * Math.sin(Math.PI * sc)));
      // Each phone appears on the table as its packet arrives.
      s *= outBack(arriveOf(p, i), 1.4);
      phonePos[i].copy(c);
      phoneShow[i] = s > 0.05;
      scl.setScalar(Math.max(0.0001, s));
      mtx.compose(c, q, scl);
      phones.setMatrixAt(i, mtx);
      // The scan bracket on its screen.
      const b = scanOf(p, i);
      const bs = b > 0 && go <= 0 ? outBack(b, 2) : go > 0 ? 1 - seg(go, 0, 0.3) : 0;
      scl.setScalar(Math.max(0.0001, bs * s));
      mtx.compose(c, q, scl);
      brackets.setMatrixAt(i, mtx);
      // The name tag over it.
      const tg = tagOf(p, i);
      const ts = (tg > 0 ? outBack(tg, 1.55) : 0) * (1 - seg(p, 0.608, 0.62));
      // Tags at two heights, alternately, so neighbours' names never sit on each other.
      tagPos[i].copy(stand[i]).add(v.set(0, 0.34 + (i % 2) * 0.24, 0));
      tagPos[i].y += Math.sin(t * 1.5 + i) * 0.018;
      tagShow[i] = ts;
      scl.setScalar(Math.max(0.0001, ts));
      q.copy(qUp[i]).multiply(qw.setFromAxisAngle(Zax, (1 - smooth(tg)) * 0.3 * (i % 2 ? 1 : -1)));
      mtx.compose(tagPos[i], q, scl);
      tags.setMatrixAt(i, mtx);
      // The coin it sends into the door.
      const cn = coinOf(p, i);
      if (cn > 0 && cn < 1) {
        const e = inOut(cn);
        v.copy(hover[i]).add(w.set(0, 0.3, 0));
        w.set(DOOR.x + (i - 2.5) * 0.06, DOOR.y + 0.1, DOOR.z + 0.05);
        c.copy(v).lerp(w, e);
        c.y += Math.sin(e * Math.PI) * 0.75;
        const turn = e * Math.PI * 5 + i;
        q.setFromAxisAngle(UP, turn);
        // The face catches the light when it turns toward the viewer (azimuth 45 degrees).
        coinGlint[i] = Math.pow(Math.max(0, Math.cos(turn - Math.PI / 4)), 24);
        coinOn[i] = 1;
        coinPos[i].copy(c);
        scl.setScalar(1 - 0.35 * e);
      } else {
        coinOn[i] = 0;
        scl.setScalar(0.0001);
      }
      mtx.compose(coinPos[i], q, scl);
      coins.setMatrixAt(i, mtx);
    }
    phones.instanceMatrix.needsUpdate = true;
    brackets.instanceMatrix.needsUpdate = true;
    tags.instanceMatrix.needsUpdate = true;
    coins.instanceMatrix.needsUpdate = true;

    // ── The code's scan line (twice down) and the door's glow (a step with each coin) ──
    const sweep = seg(p, 0.522, 0.58);
    scanAt = sweep > 0 && sweep < 1 ? Math.abs(((sweep * 2) % 2) - 1) : -1;
    shared.uScan.value = scanAt >= 0 ? 1 - scanAt : -1;
    let landed = 0;
    for (let i = 0; i < 6; i++) landed += coinOf(p, i) >= 1 ? 1 : 0;
    const lastLand = PEOPLE.reduce((m, _, i) => Math.max(m, coinOf(p, i) >= 1 ? 1 - seg(p, 0.7 + i * 0.012, 0.72 + i * 0.012) : 0), 0);
    doorGlow = Math.min(1, landed / 6) * 0.75 + lastLand * 0.25;
    shared.uGlow.value[0] = doorGlow * (0.92 + 0.08 * Math.sin(t * 2.4));
    // A ring of gold spreading across the door from where the latest coin went in.
    const latest = Math.max(...landT);
    const rAge = t - latest;
    if (rAge >= 0 && rAge < 0.9 && p > 0.66 && p < 0.8) shared.uRipple.value.set(DOOR.x, DOOR.y + 0.1, 0.05 + rAge * 0.95, (1 - rAge / 0.9) * 0.95);
    else shared.uRipple.value.w = 0;

    // ── The last packet, the ticks and the ring ──
    const run = seg(p, 0.792, 0.836);
    lastOn = run > 0 && run < 1 ? 1 : 0;
    if (lastOn) lastWalk.at(inOut(run), lastPos);
    for (let k = 0; k < 6; k++) {
      const tk = tickOf(p, k);
      tickOn[k] = tk;
      rowAt(k, c);
      scl.setScalar(Math.max(0.0001, outBack(tk, 2.2)));
      mtx.compose(c, q.identity(), scl);
      ticks.setMatrixAt(k, mtx);
    }
    ticks.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < 6; k++) {
      const tk = tickOf(p, k);
      shared.uRowGlow.value[k] = 0.32 * smooth(seg(tk, 0.4, 1)) + 0.68 * (tk > 0.4 && tk < 1 ? Math.sin(Math.PI * seg(tk, 0.4, 1)) : 0);
    }
    const fill = out3(seg(p, 0.842, 0.9));
    ringGeo.setDrawRange(0, Math.round(fill * 96) * 8 * 6);
    ring.visible = fill > 0;

    const key = `${tall}|${PEOPLE.map((_, i) => `${riseOf(p, i).toFixed(3)}${goOf(p, i).toFixed(3)}${arriveOf(p, i).toFixed(3)}${coinOf(p, i).toFixed(3)}${tickOf(p, i).toFixed(3)}`).join(',')}|${seg(p, 0.548, 0.62).toFixed(3)}`;
    const moved = key !== lastKey;
    lastKey = key;
    return moved;
  };

  const halos = (h: Halos, p: number, t: number): void => {
    // Each phone wakes as its packet arrives.
    for (let i = 0; i < 6; i++) {
      const a = arriveOf(p, i);
      const g = a > 0 && a < 1 ? Math.sin(a * Math.PI) : 0;
      if (g > 0) h.push(rest[i], 0.55, g * 0.8);
      const b = scanOf(p, i);
      const sg = b > 0 && b < 1 ? Math.sin(b * Math.PI) : 0;
      if (sg > 0) h.push(phonePos[i], 0.5, sg * 0.7);
      if (coinOn[i]) {
        h.push(coinPos[i], 0.3, 0.55);
        if (coinGlint[i] > 0.02) h.push(coinPos[i], 0.55, coinGlint[i]);
      }
      const tk = tickOn[i];
      const tg = tk > 0 && tk < 1 ? Math.sin(tk * Math.PI) : 0;
      if (tg > 0) h.push(rowAt(i, v), 0.45, tg * 0.8);
    }
    if (scanAt >= 0) {
      h.push(qrCentre, 0.5, 0.45);
      // The scan line glints as it runs.
      v.copy(shared.uQrO.value).addScaledVector(shared.uQrU.value, QR.size * (0.5 + 0.35 * Math.sin(t * 3))).addScaledVector(shared.uQrV.value, QR.size * (1 - scanAt));
      h.push(v, 0.22, 0.95);
    }
    if (doorGlow > 0.01) h.push(v.set(DOOR.x, DOOR.y + 0.05, DOOR.z + 0.1), 1.25, doorGlow * 0.55);
    if (lastOn) h.push(lastPos, 0.45, 0.95);
    const fill = seg(p, 0.842, 0.9);
    if (fill > 0 && fill < 1) {
      // The ring's fill has a bright head.
      const a = Math.PI / 2 - out3(fill) * Math.PI * 2;
      h.push(v.set(RING.x + RING.r * Math.cos(a), RING.y + RING.r * Math.sin(a), RING.z + 0.05), 0.42, 1);
    }
    // Steam from the coffee machine and the two cups, drawn as an illustrator would: thin wavy grey lines that rise,
    // curl, and thin out (in the plane facing the viewer, so they read as strokes).
    if (p > 0.38 && p < 0.7) {
      const wisps = world.wisps;
      steamFrom.forEach((o, e) => {
        for (let j = 0; j < 2; j++) {
          const u = (t / (2.4 + 0.3 * j) + j * 0.5 + e * 0.31) % 1;
          const len = (e === 0 ? 0.42 : 0.32) * Math.min(1, u * 2.2);
          const fade = Math.sin(Math.PI * Math.min(1, u * 1.15));
          const base = 0.02 + u * 0.12;
          const side = (j - 0.5) * 0.05;
          let prev: Vector3 | null = null;
          for (let k = 0; k <= 7; k++) {
            const sAlong = k / 7;
            const y = base + sAlong * len;
            const sway = Math.sin(sAlong * 5.5 - t * 2.6 + j * 2 + e) * 0.028 * (0.3 + sAlong);
            const pt = new Vector3(o.x, o.y + y, o.z).addScaledVector(RIGHT, side + sway);
            if (prev) wisps.push(prev, pt, 0.014 * (1 - sAlong * 0.55), fade * (1 - sAlong * 0.45));
            prev = pt;
          }
        }
      });
    }
    // The scan: a ray from the code to each phone in turn.
    for (let i = 0; i < 6; i++) {
      const b = scanOf(p, i);
      const on = b > 0 && b < 1 ? Math.sin(b * Math.PI) : 0;
      if (on > 0) world.beams.push(qrCentre, phonePos[i], 0.12, on);
    }
  };

  const people = (p: number, out: Spot[]): boolean => {
    if (p < 0.47 || p > 0.93) return false;
    for (let i = 0; i < 6; i++) {
      if (p < 0.6) {
        // At the table: the tags once they are up, else the phones.
        out[i].pos.copy(tagShow[i] > 0.5 ? tagPos[i] : phonePos[i]);
        out[i].visible = phoneShow[i] && riseOf(p, i) > 0.6;
      } else if (p < 0.8) {
        out[i].pos.copy(phonePos[i]).add(v.set(0, 0.3, 0));
        out[i].visible = phoneShow[i] && goOf(p, i) > 0.7;
      } else {
        rowAt(i, out[i].pos).add(v.set(0.12, 0, 0));
        out[i].visible = tickOn[i] > 0.6;
      }
    }
    return true;
  };

  const moving = (x: number): boolean => x > 0 && x < 1;
  const items = (p: number, out: Item[]): boolean => {
    if (p < 0.47) return false;
    for (let i = 0; i < 6; i++) {
      if (p < 0.615) {
        // Station 3: the phone waking, rising, scanning, its tag popping.
        out[i].active = moving(arriveOf(p, i)) || moving(riseOf(p, i)) || moving(scanOf(p, i)) || moving(tagOf(p, i));
        out[i].done = tagOf(p, i) >= 1;
      } else if (p < 0.79) {
        // Station 4: the phone gliding over, its coin arcing into the door.
        out[i].active = moving(goOf(p, i)) || moving(coinOf(p, i));
        out[i].done = coinOf(p, i) >= 1;
      } else {
        // Station 5: the tick landing in its row.
        out[i].active = moving(tickOf(p, i));
        out[i].done = tickOf(p, i) >= 1;
      }
    }
    return true;
  };

  void clamp; void lerp;
  return { update, halos, people, items, bulbs };
}
