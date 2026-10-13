import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, Scene, Vector3, type Material, type Object3D, type ShaderMaterial } from 'three';
import { beamMaterial, haloMaterial, toon } from './materials.ts';
import type { Mesher } from './geo.ts';

/** Shadow casters are on this layer too; the sun's camera sees only it. */
export const CASTERS = 1;

/** Glowing dots drawn over the inked picture: bulbs, packets. One instanced draw for all of them. */
export class Halos {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly data: Float32Array;
  private readonly on: Float32Array;
  private readonly aHalo: InstancedBufferAttribute;
  private readonly aOn: InstancedBufferAttribute;
  private readonly geo: InstancedBufferGeometry;
  count = 0;

  constructor(readonly capacity: number, colour?: number, strength?: number) {
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.data = new Float32Array(capacity * 4);
    this.on = new Float32Array(capacity);
    this.aHalo = new InstancedBufferAttribute(this.data, 4);
    this.aOn = new InstancedBufferAttribute(this.on, 1);
    geo.setAttribute('aHalo', this.aHalo);
    geo.setAttribute('aOn', this.aOn);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = haloMaterial(colour, strength);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Starts a frame's list. */
  begin(): void {
    this.count = 0;
  }

  push(p: Vector3, size: number, on: number): void {
    if (this.count >= this.capacity || on <= 0.001) return;
    const i = this.count++;
    this.data[i * 4] = p.x;
    this.data[i * 4 + 1] = p.y;
    this.data[i * 4 + 2] = p.z;
    this.data[i * 4 + 3] = size;
    this.on[i] = Math.min(1, on);
  }

  end(): void {
    this.geo.instanceCount = this.count;
    this.aHalo.needsUpdate = true;
    this.aOn.needsUpdate = true;
  }
}

/** Rays of light between pairs of points (one instanced draw), drawn over the inked picture. */
export class Beams {
  readonly mesh: Mesh;
  private readonly a: InstancedBufferAttribute;
  private readonly b: InstancedBufferAttribute;
  private readonly w: InstancedBufferAttribute;
  private readonly geo: InstancedBufferGeometry;
  count = 0;
  constructor(readonly capacity: number, colour?: number, stroke = false) {
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    this.a = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.b = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.w = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    geo.setAttribute('aA', this.a);
    geo.setAttribute('aB', this.b);
    geo.setAttribute('aW', this.w);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new Mesh(geo, beamMaterial(colour, stroke));
    this.mesh.frustumCulled = false;
  }
  begin(): void { this.count = 0; }
  push(a: Vector3, b: Vector3, width: number, on: number): void {
    if (this.count >= this.capacity || on <= 0.001) return;
    const i = this.count++;
    this.a.setXYZ(i, a.x, a.y, a.z);
    this.b.setXYZ(i, b.x, b.y, b.z);
    this.w.setXY(i, width, Math.min(1, on));
  }
  end(): void {
    this.geo.instanceCount = this.count;
    this.a.needsUpdate = true; this.b.needsUpdate = true; this.w.needsUpdate = true;
    this.mesh.visible = this.count > 0;
  }
}

/** Sparks: little bursts of light (the cut, a tick landing) that fly out, fall and fade, on the idle clock. */
export class Sparks {
  private readonly list: { p: Vector3; v: Vector3; t0: number; life: number; size: number }[] = [];
  /** n sparks from `at` (spread along `along` by `len`), flying out along `dir` (and a little everywhere). */
  burst(at: Vector3, n: number, t: number, opts: { along?: Vector3; len?: number; dir?: Vector3; speed?: number; life?: number; size?: number } = {}): void {
    const { along, len = 0, dir = new Vector3(0, 1, 0), speed = 1, life = 0.6, size = 0.1 } = opts;
    for (let i = 0; i < n; i++) {
      const r = (k: number): number => { const x = Math.sin(i * 12.9898 + k * 78.233 + t * 3.1) * 43758.5453; return x - Math.floor(x); };
      const p = at.clone();
      if (along) p.addScaledVector(along, (r(1) - 0.5) * len);
      // A spray: up along dir, and out to either side across the screen (so it reads in the isometric view).
      const across = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2).multiplyScalar((r(3) - 0.5) * 2.2);
      const v = dir.clone().multiplyScalar(speed * (0.55 + 0.7 * r(2)))
        .add(across.multiplyScalar(speed))
        .add(new Vector3(0, r(4) * 0.6, 0).multiplyScalar(speed));
      this.list.push({ p, v, t0: t, life: life * (0.7 + 0.5 * r(6)), size: size * (0.7 + 0.6 * r(7)) });
    }
    if (this.list.length > 60) this.list.splice(0, this.list.length - 60);
  }
  push(h: Halos, streaks: Beams, t: number): void {
    const q = new Vector3(), r = new Vector3();
    const at = (s: { p: Vector3; v: Vector3 }, age: number, out: Vector3): Vector3 => {
      out.copy(s.p).addScaledVector(s.v, age);
      out.y -= 2.4 * age * age;
      return out;
    };
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      const age = t - s.t0;
      if (age > s.life || age < 0) { this.list.splice(i, 1); continue; }
      const k = age / s.life;
      at(s, age, q);
      at(s, Math.max(0, age - 0.09), r);
      // A short bright streak along its path, and a small hot core at its head.
      streaks.push(r, q, s.size * 0.38, (1 - k) * 1.0);
      h.push(q, s.size * 0.55 * (1 - 0.5 * k), (1 - k) * (1 - k));
    }
  }
  get busy(): boolean { return this.list.length > 0; }
}

/** The scene and the two materials every mesh is drawn with. */
export class World {
  readonly scene = new Scene();
  /** For merged, never-moving geometry. */
  readonly still: ShaderMaterial = toon({ doubleSide: true });
  /** For things that move (their own transforms or rewritten vertices). */
  readonly moving: ShaderMaterial = toon({ doubleSide: true });
  readonly halos = new Halos(280);
  /** Rays and streaks of light (the scan, the blade's flash, sparks). */
  readonly beams = new Beams(96);
  /** Soft white haze (kept for warm glows that must not be gold). */
  readonly puffs = new Halos(48, 0xf7f3ec, 0.55);
  /** Thin grey strokes (the café's steam, drawn as an illustrator would: wavy lines rising). */
  readonly wisps = new Beams(96, 0x8f8a82, true);
  readonly sparks = new Sparks();
  /** Drawn after the ink and the anti-aliasing. */
  readonly overlays: Object3D[] = [this.puffs.mesh, this.wisps.mesh, this.beams.mesh];

  /** Adds merged geometry that never moves; it takes shadows, and casts them unless `casts` is false. */
  addStill(m: Mesher, name: string, casts = true): Mesh {
    const mesh = new Mesh(m.build(), this.still);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (casts) mesh.layers.enable(CASTERS);
    this.scene.add(mesh);
    return mesh;
  }

  /** Adds a moving mesh (its own geometry, the moving material). */
  addMoving<T extends Object3D>(obj: T, casts = true): T {
    if (casts) obj.traverse(o => o.layers.enable(CASTERS));
    this.scene.add(obj);
    return obj;
  }

  movingMesh(geo: BufferGeometry, casts = true, material: Material = this.moving): Mesh {
    const mesh = new Mesh(geo, material);
    return this.addMoving(mesh, casts);
  }
}

export const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
