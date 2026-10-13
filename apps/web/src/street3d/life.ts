import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, type OrthographicCamera } from 'three';
import { Mesher, part, Pat } from './geo.ts';
import { C } from './palette.ts';
import { CASTERS, type Halos, type World } from './world.ts';

/*
 * Life that belongs to no station: birds now and then in the day sky, dust motes in the lamps' light at night.
 * Everything here runs on the idle clock, so it stops with "Pause motion" and while the street is off screen.
 */

const RIGHT = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
const BACK = new Vector3(-Math.SQRT1_2, 0, -Math.SQRT1_2);

/** A bird as an ink stroke: two wings, a shallow gull's "m", drawn in the XY plane (it is turned to face the camera). */
function birdGeometry(): BufferGeometry {
  const wing: [number, number][] = [[0, 0], [0.045, 0.032], [0.095, 0.038], [0.16, 0.012]];
  const w = 0.016;
  const pos: number[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < wing.length - 1; i++) {
      const [x0, y0] = wing[i], [x1, y1] = wing[i + 1];
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      // Thinner toward the tip, like a brush stroke.
      const t0 = w * (1 - 0.55 * (i / (wing.length - 1))), t1 = w * (1 - 0.55 * ((i + 1) / (wing.length - 1)));
      const nx = -dy / l, ny = dx / l;
      const a = [side * (x0 + nx * t0 / 2), y0 + ny * t0 / 2, 0], b = [side * (x0 - nx * t0 / 2), y0 - ny * t0 / 2, 0];
      const c = [side * (x1 + nx * t1 / 2), y1 + ny * t1 / 2, 0], d = [side * (x1 - nx * t1 / 2), y1 - ny * t1 / 2, 0];
      pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const nor = new Float32Array(pos.length);
  for (let i = 2; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  const m = new Mesher();
  m.add(g, new Matrix4(), { color: C.ink, part: part(), pat: Pat.Unlit, noShadow: true, sway: [0.55, 0, 0, 3] });
  return m.build();
}

/** A pair of birds that glides across the view every so often, by day. */
export class Birds {
  readonly mesh: InstancedMesh;
  private readonly origin = new Vector3();
  private h = 1;
  private w = 1;
  private cycle = -1;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly at = new Vector3();

  constructor(world: World) {
    this.mesh = new InstancedMesh(birdGeometry(), world.moving, 2);
    this.mesh.frustumCulled = false;
    world.addMoving(this.mesh, false);
    this.mesh.layers.disable(CASTERS);
  }

  /** t: the idle clock; target, h, aspect: the camera's shot; night 0 to 1; p the story's progress. */
  update(t: number, camera: OrthographicCamera, target: Vector3, h: number, aspect: number, night: number, p: number): void {
    const period = 19, flight = 8.5;
    const c = Math.floor((t + 6) / period);
    const u = ((t + 6) - c * period) / flight;
    // Each flight starts from where the camera is looking then, so a scroll during it moves past them, as it should.
    if (c !== this.cycle) { this.cycle = c; this.origin.copy(target); this.h = h; this.w = h * aspect; }
    const show = u < 1 && p > 0.03 ? 1 - night : 0;
    for (let b = 0; b < 2; b++) {
      const k = Math.min(1, u);
      const x = (-0.62 + 1.3 * k) * this.w - b * 0.075 * this.w;
      this.at.copy(this.origin).addScaledVector(RIGHT, x).addScaledVector(BACK, 0.6);
      this.at.y += (0.24 + 0.035 * Math.sin(k * Math.PI * 1.3 + b) - b * 0.035) * this.h / 0.816;
      this.q.copy(camera.quaternion);
      this.s.setScalar(Math.max(0.0001, 0.14 * this.h * show * (b ? 0.85 : 1)));
      this.m.compose(this.at, this.q, this.s);
      this.mesh.setMatrixAt(b, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = show > 0.001;
  }
}

/** Warm dust motes rising slowly through each lamp's light, after dark. */
export function motes(h: Halos, lamps: readonly { bulb: Vector3 }[], t: number, night: number): void {
  if (night < 0.05) return;
  const v = new Vector3();
  lamps.forEach((l, k) => {
    for (let j = 0; j < 5; j++) {
      const u = (t * 0.045 + j * 0.21 + k * 0.13) % 1;
      v.set(l.bulb.x + Math.sin(t * 0.35 + j * 2.1 + k) * 0.42, l.bulb.y - 2.5 + 2.2 * u, l.bulb.z + Math.cos(t * 0.3 + j * 1.7 + k) * 0.42);
      h.push(v, 0.055, night * 0.6 * Math.sin(Math.PI * u));
    }
  });
}
