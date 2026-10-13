import { CylinderGeometry, Matrix4, PlaneGeometry, SphereGeometry, Vector3 } from 'three';
import { C } from './palette.ts';
import { at, ChunkMesher, part, Pat, type Paint, type Sink } from './geo.ts';
import { aframe, bench, lamp, plant, post, shop, stringLights, tree, type Bulb } from './props.ts';
import { KERB_A, KERB_B, LAMP_X, LAMP_Z, LANE, PLINTH, POST_Z, SHOP_Z, SLAB, STATION_X } from './layout.ts';
import type { World } from './world.ts';

/*
 * The pavement (a long slab with a lane, kerbs either side, plinths for the stations) and its furniture: lamps with
 * string lights across the lane, benches, plants, an A-frame by the café.
 */

/** A block of pavement: its top drawn with `top`'s pattern, its visible sides (+z, +x) as stone with joints. */
export function block(m: Sink, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, top: Paint, sidePart: number, sides = { pz: true, px: true }): void {
  const w = x1 - x0, d = z1 - z0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
  m.add(new PlaneGeometry(w, d), at(cx, y1, cz, -Math.PI / 2, 0, 0), top);
  const side: Paint = { color: C.stone, part: sidePart, pat: Pat.Kerb, param: y1 };
  if (sides.pz) m.add(new PlaneGeometry(w, h), at(cx, cy, z1), side);
  if (sides.px) m.add(new PlaneGeometry(d, h), at(x1, cy, cz, 0, Math.PI / 2, 0), side);
}

export interface Lamp { x: number; bulb: Vector3; index: number }

export interface Street { bulbs: Bulb[]; lamps: Lamp[]; windows: Bulb[] }

export function buildStreet(world: World): Street {
  // In chunks along the street, so what is off screen is not drawn (nor drawn into the shadow map).
  const m = new ChunkMesher(12);
  const crowns = new ChunkMesher(12);
  const pave = part();
  const lane = part();
  const { x0, x1, z0, z1, bottom } = SLAB;
  const tiles: Paint = { color: C.pave, part: pave, pat: Pat.Tiles, param: 1 };
  // The back pavement, the kerbs, the lane (a step down), the front pavement.
  block(m, x0, x1, z0, KERB_A.z0, bottom, 0, tiles, pave, { pz: false, px: true });
  block(m, x0, x1, KERB_A.z0, KERB_A.z1, bottom, 0, { color: C.paper, part: pave, pat: Pat.Tiles, param: 1 }, pave, { pz: true, px: true });
  block(m, x0, x1, LANE.z0, LANE.z1, bottom, LANE.top, { color: C.sett, part: lane, pat: Pat.Setts, param: 0.5 }, lane, { pz: false, px: true });
  block(m, x0, x1, KERB_B.z0, KERB_B.z1, bottom, 0, { color: C.paper, part: pave, pat: Pat.Tiles, param: 1 }, pave, { pz: false, px: true });
  block(m, x0, x1, KERB_B.z1, z1, bottom, 0, tiles, pave, { pz: true, px: true });

  // The plinths, a step up, with the larger tiles of the pictures.
  for (const sx of STATION_X) {
    const p = part();
    block(m, sx - PLINTH.half, sx + PLINTH.half, PLINTH.z - PLINTH.half, PLINTH.z + PLINTH.half, -0.02, PLINTH.top,
      { color: C.tile, part: p, pat: Pat.Tiles, param: PLINTH.tile }, p);
  }

  // Bollards along the back kerb: charcoal posts with gold caps, a rhythm down the street.
  for (let x = x0 + 1.5; x < x1 - 1; x += 2.5) {
    if (LAMP_X.some(lx => Math.abs(lx - x) < 1.2)) continue;
    const b = part();
    m.add(new CylinderGeometry(0.075, 0.085, 0.5, 12), at(x, 0.25, KERB_A.z0 - 0.22), { color: C.coal, part: b, crease: true });
    m.add(new CylinderGeometry(0.09, 0.09, 0.05, 12), at(x, 0.52, KERB_A.z0 - 0.22), { color: C.gold, part: part(), crease: true });
    m.add(new SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), at(x, 0.545, KERB_A.z0 - 0.22), { color: C.gold, part: part() });
  }

  // Lamps between the stations; string lights from each lamp's pole across the lane to a slim post.
  const bulbs: Bulb[] = [];
  const lamps: Lamp[] = [];
  LAMP_X.forEach((x, i) => {
    const b = lamp(m, at(x, 0, LAMP_Z), i, 0, 3.3);
    bulbs.push(b);
    lamps.push({ x, bulb: b.pos, index: i });
    const top = post(m, at(x - 0.6, 0, POST_Z), 2.9);
    const from = new Vector3(x, 2.92, LAMP_Z);
    bulbs.push(...stringLights(m, from, top, 0.42, 5, i));
  });

  // The far side: a row of shopfronts the length of the street, trees in planters between some of them.
  const widths = [3.2, 2.5, 3.7, 2.8, 3.1, 2.4, 3.5];
  const heights = [2.6, 3.3, 2.35, 3.05, 2.55, 3.4, 2.75];
  const depths = [1.7, 1.9, 1.6, 1.8, 1.7, 2.0, 1.75];
  const windows: Bulb[] = [];
  let sx = x0 + 0.3, k = 0;
  const lampOf = (x: number): number => {
    let best = 0;
    LAMP_X.forEach((lx, i) => { if (Math.abs(lx - x) < Math.abs(LAMP_X[best] - x)) best = i; });
    return best;
  };
  while (sx < x1 - 2) {
    const w = Math.min(widths[k % widths.length], x1 - 0.3 - sx);
    if (w < 1.6) break;
    // Each shop's windows have a light of their own (after the street's six lamps), so at nightfall they can come on
    // one by one, in no order.
    const slot = LAMP_X.length + k < 24 ? LAMP_X.length + k : lampOf(sx + w / 2);
    shop(m, sx + w / 2, SHOP_Z, w, heights[k % heights.length], depths[k % depths.length], k, lampOf(sx + w / 2), windows, slot);
    sx += w;
    if (k % 2 === 0 && sx < x1 - 2) {
      tree(m, at(sx + 0.65, 0, SHOP_Z - 0.6), 1.0, k * 0.9, crowns);
      sx += 1.3;
    } else sx += 0.12;
    k++;
  }
  // Trees along the back walkway, between the stations.
  for (const x of [-4.5, 5.3, 14.6, 25.4, 34.8, 45.2]) tree(m, at(x, 0, -5.75), 0.92, x * 0.37, crowns);

  // Benches and plants in the gaps between the plinths, a little different in each.
  const gap = (k: number): number => STATION_X[0] + 5 + 10 * k;
  bench(m, at(gap(0) + 0.2, 0, -2.2));
  plant(m, at(gap(0) - 1.55, 0, -4.2), 1.05, 1.3);
  plant(m, at(gap(0) + 1.75, 0, -4.5), 0.85, 2.1);
  aframe(m, at(gap(1) + 1.1, 0, -0.35, 0, -0.5, 0));
  plant(m, at(gap(1) - 1.4, 0, -3.6), 1.1, 0.4);
  bench(m, at(gap(2), 0, -2.4));
  plant(m, at(gap(2) + 1.65, 0, -4.4), 1.0, 2.8);
  plant(m, at(gap(3) - 1.2, 0, -3.0), 1.15, 3.6);
  plant(m, at(gap(3) + 1.3, 0, -4.4), 0.9, 4.4);
  bench(m, at(gap(-1) + 0.2, 0, -2.4));
  plant(m, at(gap(-1) + 1.7, 0, -4.3), 1.0, 5.1);
  bench(m, at(gap(4), 0, -2.4));
  // Along the front pavement, a few plants.
  plant(m, at(-2.5, 0, 4.6), 0.8, 0.9);
  plant(m, at(12.5, 0, 4.6), 0.8, 1.9);
  plant(m, at(27.5, 0, 4.6), 0.8, 2.9);
  plant(m, at(42.5, 0, 4.6), 0.8, 3.9);

  m.all().forEach((chunk, i) => world.addStill(chunk, `street-${i}`));
  crowns.all().forEach((chunk, i) => world.addStill(chunk, `crowns-${i}`, false));
  return { bulbs, lamps, windows };
}

export type { Matrix4 };
