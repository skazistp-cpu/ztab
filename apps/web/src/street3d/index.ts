import { OrthographicCamera, Vector3 } from 'three';
import { Pipeline } from './pipeline.ts';
import { World } from './world.ts';
import { buildStreetSteps } from './street.ts';
import { act12, PEOPLE, type Act, type Item, type Spot } from './act12.ts';
import { act345 } from './act345.ts';
import { INLAY_Z, inlayHead, STUB_X, STUB_Z, stubLit } from './spots.ts';
import { Birds, motes } from './life.ts';
import { swayed, type Bulb } from './props.ts';
import { aim, shotAt, TALL, WIDE, type Shot } from './camera.ts';
import { shared, LAMPS } from './materials.ts';
import { clamp, seg, smooth } from './ease.ts';

/*
 * The Ztab street: a real-time isometric street the camera travels along as the page scrolls, one station for each
 * step of a tab. The page owns the scroll and the captions; this module owns the canvas.
 *
 *   const street = await mountStreet(host);   // rejects without WebGL 2
 *   street.setProgress(p);                     // 0..1 through the pinned section; eased here (a critically damped spring)
 *   street.setPaused(true);                    // "Pause motion": holds everything; a new progress then jumps, unanimated
 *
 * It draws only while the camera is still settling or the idle motion runs, never while paused, hidden or off screen.
 */

export interface StreetHandle {
  setProgress(p: number): void;
  setPaused(paused: boolean): void;
  resize(): void;
  dispose(): void;
  /** Progress at which each of the five stations is centred (for captions and the progress rail). */
  stations: number[];
  /** Screen positions (CSS px, relative to the canvas) of the six people's cards or phones, for DOM labels. */
  anchors(): { id: string; x: number; y: number; visible: boolean }[];
  /** Nightfall: over this span of progress the street goes from day to night (the page fades its own background
   *  white to ink over the same span; the canvas stays transparent). */
  dusk: [number, number];
  /** Each person's state at the station now playing (for a compact legend on phones): moving now, done here. */
  items(): { id: string; active: boolean; done: boolean }[];
}

export interface StreetDebug {
  /** Sets progress with no easing (stills, tests). */
  jump(p: number): void;
  /** Holds the camera on a point (tests: e.g. the table code up close); null gives it back to the path. */
  look(at: [number, number, number] | null, h?: number): void;
  /** Sets the idle clock (stills, tests). */
  time(t: number): void;
  stats(): { calls: number; triangles: number; dpr: number; frameMs: number; progress: number; halos: number; puffs: number; sparks: boolean };
  /** Every mesh's full triangle count (tests). */
  meshes(): { name: string; triangles: number; casts: boolean }[];
  readonly canvas: HTMLCanvasElement;
}

export interface StreetOptions {
  onReady?: () => void;
  /** Highest device pixel ratio (default: 1.75, or 1.5 on a phone). */
  maxDpr?: number;
  /** Line width in CSS px (default 1.5). */
  line?: number;
}

/** Nightfall's span of progress. */
const DUSK: [number, number] = [0.94, 1.0];

/** Each station's centre on the scroll (the middle of the camera's stay there). */
const STATIONS = [0.15, 0.322, 0.54, 0.72, 0.87];

/** Gives the main thread back for a moment (a frame can be drawn, the page can answer the visitor). */
const breathe = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export function mountStreet(host: HTMLElement, opts: StreetOptions = {}): Promise<StreetHandle & { debug: StreetDebug }> {
  // The mount comes in short steps, not one long task: on a phone at a quarter of a desktop's speed no step is longer
  // than about a tenth of a second, and the shaders are compiled off the main thread where the browser can.
  return new Promise((resolve, reject) => { (async () => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) { reject(new Error('WebGL 2 is not available')); return; }
    host.appendChild(canvas);

    let pipe: Pipeline;
    let world: World;
    let acts: Act[] = [];
    let lamps: { x: number; bulb: Vector3; index: number }[] = [];
    let bulbs: Bulb[] = [];
    let windows: Bulb[] = [];
    let birds: Birds;
    try {
      pipe = new Pipeline(canvas, gl);
      world = new World();
      await breathe();
      const steps = buildStreetSteps(world);
      let step = steps.next();
      while (!step.done) { await breathe(); step = steps.next(); }
      const street = step.value;
      lamps = street.lamps;
      bulbs = street.bulbs;
      windows = street.windows;
      await breathe();
      const late = act345(world);
      await breathe();
      acts = [act12(world), late];
      bulbs = bulbs.concat(late.bulbs);
      birds = new Birds(world);
    } catch (err) {
      canvas.remove();
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 150);
    const shot: Shot = { at: new Vector3(), h: 1, az: 0, fx: 0.5, fy: 0.5 };
    const phone = matchMedia('(max-width: 759px)').matches || Math.min(screen.width, screen.height) < 600;
    const dprCap = opts.maxDpr ?? (phone ? 1.5 : 1.75);
    const line = opts.line ?? 1.5;
    let dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    let width = 1, height = 1, aspect = 1;
    let keys = WIDE;

    // The eased progress (a critically damped spring toward the page's progress) and the idle clock.
    let aimP = 0, p = 0, vel = 0;
    let idle = 0;
    let paused = false;
    let visible = true;
    let disposed = false;
    let ready = false;
    let raf = 0;
    let last = 0;
    let shadowDirty = true;
    let lastCam = '';
    let frameMs = 16.7;
    let slow = 0, fast = 0;
    let lookAt: [number, number, number] | null = null;
    let lookH = 1;

    // Lamp k's light: on once the camera has passed it, and all of them at the end.
    for (const l of lamps) if (l.index < LAMPS) shared.uLamp.value[l.index].copy(l.bulb);
    // Each shop's windows have a light of their own (slots after the street's lamps): a soft warm room by day once its
    // street lamp is lit, and at nightfall full on, the shops one by one in no particular order. At night that light
    // also falls on the pavement in front and the near side of the trees' crowns.
    const shopLights = windows.filter(w => w.lamp >= lamps.length && w.lamp < LAMPS).map((wdw, k) => {
      shared.uLamp.value[wdw.lamp].set(wdw.pos.x, wdw.pos.y - 0.2, wdw.pos.z + 0.5);
      const r = Math.sin(k * 91.17 + 3.7) * 43758.5453;
      return { slot: wdw.lamp, near: wdw.near ?? 0, at: (r - Math.floor(r)) * 0.72 };
    });
    // At nightfall the street lamps come up to full one by one, from the far end (where the camera has been) back.
    const lampRank = new Map(lamps.slice().sort((a, b) => b.x - a.x).map((l, r) => [l.index, r]));
    // The gold inlay down the street: from the first station's stub to the last.
    shared.uInlay.value.set(INLAY_Z, STUB_X[0], STUB_X[4], 0.05);
    STUB_X.forEach((x, k) => { shared.uStubX.value[k] = x; });
    shared.uStubZ.value = STUB_Z;
    const lampLight = (k: number, x: number, camX: number, prog: number, night: number): number => {
      const passed = seg(camX, x - 4.6, x - 1.6);
      const finale = seg(prog, 0.905 + k * 0.008, 0.93 + k * 0.008);
      const u = Math.max(passed, finale);
      if (u <= 0) return 0;
      // Coming on: a quick flicker, then steady.
      const on = u >= 1 ? 1 : u * (0.55 + 0.45 * Math.abs(Math.sin(u * 23 + k)));
      // By day a lit lamp glows softly; at nightfall it comes up to full in its turn, with a flicker of its own.
      const r = lampRank.get(k) ?? 0;
      const b = seg(night, r * 0.1, r * 0.1 + 0.2);
      const flick = b > 0 && b < 1 ? 0.62 + 0.38 * Math.abs(Math.sin(b * 37 + k * 3.1)) : 1;
      return on * (0.72 + 0.28 * b) * flick;
    };
    const breath = { calm: 1 };
    const tmpV = new Vector3();

    const size = (): void => {
      const r = host.getBoundingClientRect();
      width = Math.max(1, Math.round(r.width));
      height = Math.max(1, Math.round(r.height));
      aspect = width / height;
      keys = aspect < 0.8 ? TALL : WIDE;
      pipe.setSize(width, height, dpr, line);
      lastCam = '';
      shadowDirty = true;
    };

    const draw = (): void => {
      pipe.begin();
      shared.uTime.value = idle;
      const fx0 = 0.6, fy0 = 0.5;
      shotAt(keys, p, fx0, fy0, shot);
      if (lookAt) { shot.at.set(lookAt[0], lookAt[1], lookAt[2]); shot.h = lookH; shot.fx = 0.5; shot.fy = 0.5; shot.az = 0; }
      // What the sun has to cover is decided before the camera's breath (that is far too small to matter to it).
      const camKey = `${shot.at.x.toFixed(3)},${shot.at.y.toFixed(3)},${shot.at.z.toFixed(3)},${shot.h.toFixed(3)},${shot.az.toFixed(2)},${aspect.toFixed(3)}`;
      // The camera breathes a little when the page is still (a hand-held drift, about 0.15% of the frame, 7-9 s), and
      // holds still while the page is scrolled.
      breath.calm += ((1 - smooth(seg(Math.abs(vel), 0.01, 0.08))) - breath.calm) * 0.06;
      if (!lookAt && breath.calm > 0.001) {
        const a = 0.0015 * shot.h * breath.calm;
        shot.at.addScaledVector(tmpV.set(Math.SQRT1_2, 0, -Math.SQRT1_2), a * aspect * Math.sin(idle * 0.86 + 0.4));
        shot.at.y += (a / 0.816) * Math.sin(idle * 0.71 + 1.3);
      }
      const centre = aim(camera, shot, aspect);
      // Nightfall.
      const night = smooth(seg(p, DUSK[0], DUSK[1]));
      shared.uNight.value = night;
      // Lamps.
      for (const l of lamps) {
        const on = lampLight(l.index, l.x, shot.at.x, p, night);
        shared.uLampOn.value[l.index] = on * (0.94 + 0.06 * Math.sin(idle * 2.1 + l.index * 1.7));
      }
      // Shop windows: soft by day once their street lamp is lit; at nightfall full on, each in its own moment.
      for (const w of shopLights) {
        const day = 0.45 * Math.min(1, shared.uLampOn.value[w.near] / 0.72);
        const b = seg(night, w.at, w.at + 0.07);
        const flick = b > 0 && b < 1 ? 0.5 + 0.5 * Math.abs(Math.sin(b * 29 + w.slot)) : 1;
        shared.uLampOn.value[w.slot] = Math.max(day, b * flick);
      }
      // Now and then a slow shimmer runs down the inlay (by day; the shader fades it at night).
      const sc = (idle % 26) / 26;
      shared.uShimmer.value = sc < 0.62 ? -12 + (sc / 0.62) * 66 : -999;
      // The inlay: lit where the story has passed.
      shared.uInlayLit.value.set(STUB_X[0] - 0.02, inlayHead(p));
      for (let k = 0; k < 5; k++) shared.uStubLit.value[k] = stubLit(k, p);
      const tall = keys === TALL;
      let moved = false;
      for (const act of acts) moved = act.update(p, idle, tall, vel) || moved;
      // The sun's shadow map follows the view; redrawn only when the view or a caster moved.
      if (camKey !== lastCam) { lastCam = camKey; shadowDirty = true; }
      if (moved) shadowDirty = true;
      if (shadowDirty) {
        const ground = centre.clone();
        ground.y = 0;
        pipe.aimSun(ground, Math.max(shot.h, shot.h * aspect) * 0.75 + 4);
        pipe.renderShadow(world);
        shadowDirty = false;
      }
      // Halos: lamps and string lights (where their sway has taken them), then the acts' own, sparks, motes.
      const h = world.halos;
      h.begin();
      world.beams.begin();
      world.puffs.begin();
      world.wisps.begin();
      for (let i = 0; i < bulbs.length; i++) {
        const b = bulbs[i];
        const on = shared.uLampOn.value[b.lamp];
        if (on > 0.01) h.push(swayed(b, idle, tmpV), b.size, on * (0.9 + 0.1 * Math.sin(idle * 3.1 + i * 2.3)));
      }
      // At night the shop windows glow too.
      if (night > 0.01) for (const wdw of windows) h.push(wdw.pos, wdw.size, night * 0.55 * shared.uLampOn.value[wdw.lamp]);
      for (const act of acts) act.halos(h, p, idle);
      world.sparks.push(h, world.beams, idle);
      motes(h, lamps, idle, night);
      h.end();
      world.beams.end();
      world.puffs.end();
      world.wisps.end();
      birds.update(idle, camera, shot.at, shot.h, aspect, night, p);
      pipe.render(world, camera);
    };

    const running = (): boolean => !disposed && visible && !document.hidden;

    const frame = (now: number): void => {
      raf = 0;
      if (!running()) { last = 0; return; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      if (last) {
        const ms = now - last;
        frameMs += (ms - frameMs) * 0.08;
        // Adaptive resolution: under 50 fps for a while, draw fewer pixels; well above 60 for long, a few more.
        if (frameMs > 20) { slow++; fast = 0; } else if (frameMs < 13) { fast++; slow = 0; } else { slow = 0; fast = 0; }
        if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); slow = 0; frameMs = 16.7; size(); }
        if (fast > 600 && dpr < Math.min(dprCap, window.devicePixelRatio || 1)) { dpr = Math.min(dprCap, dpr + 0.25); fast = 0; size(); }
      }
      last = now;
      if (!paused) {
        idle += dt;
        // Critically damped spring (exact step, frame-rate independent).
        const omega = 7.5;
        const x0 = p - aimP;
        const temp = (vel + omega * x0) * dt;
        vel = (vel - omega * temp) * Math.exp(-omega * dt);
        p = aimP + (x0 + temp) * Math.exp(-omega * dt);
        if (Math.abs(p - aimP) < 1e-5 && Math.abs(vel) < 1e-5) { p = aimP; vel = 0; }
      }
      draw();
      if (!ready) { ready = true; opts.onReady?.(); }
      if (!paused) raf = requestAnimationFrame(frame);
    };

    const wake = (): void => {
      if (!raf && running()) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => { size(); wake(); });
    ro.observe(host);
    const io = new IntersectionObserver(entries => {
      const was = visible;
      for (const e of entries) visible = e.isIntersecting;
      // Back on screen after a while away: start where the page is now, not with a fly-through to catch up.
      if (visible && !was) { p = aimP; vel = 0; }
      if (visible) wake();
    });
    io.observe(host);
    const onVisibility = (): void => { if (!document.hidden) { last = 0; p = aimP; vel = 0; wake(); } };
    document.addEventListener('visibilitychange', onVisibility);

    size();
    // Every material compiled up front (the glows, steam and rays appear only later, and must not stall a frame when
    // they do), in parallel off the main thread where the browser can; then the first frame, so the handle resolves
    // with a picture on the canvas.
    await breathe();
    try {
      await pipe.renderer.compileAsync(world.scene, camera);
      for (const o of [world.halos.mesh, ...world.overlays]) await pipe.renderer.compileAsync(o, camera);
    } catch { /* compiling ahead is only an optimisation */ }
    draw();

    const handle: StreetHandle & { debug: StreetDebug } = {
      setProgress(next: number): void {
        aimP = clamp(next);
        if (paused) { p = aimP; vel = 0; draw(); return; }
        wake();
      },
      setPaused(on: boolean): void {
        if (paused === on) return;
        paused = on;
        last = 0;
        if (paused) { if (raf) cancelAnimationFrame(raf); raf = 0; draw(); }
        else wake();
      },
      resize(): void { size(); if (paused) draw(); else wake(); },
      dispose(): void {
        disposed = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        world.scene.traverse(o => {
          const mesh = o as unknown as { geometry?: { dispose(): void } };
          mesh.geometry?.dispose();
        });
        world.still.dispose();
        world.moving.dispose();
        world.halos.material.dispose();
        pipe.dispose();
        canvas.remove();
      },
      stations: STATIONS.slice(),
      dusk: [DUSK[0], DUSK[1]],
      anchors() {
        const spots: Spot[] = PEOPLE.map(() => ({ pos: new Vector3(), visible: false }));
        let any = false;
        for (const act of acts) { if (act.people(p, spots)) { any = true; break; } }
        // On a phone the stations from the link post to the bank are too small for a label on each object: the page
        // shows a legend from items() there instead.
        if (keys === TALL && p >= 0.215 && p < 0.79) any = false;
        const v = new Vector3();
        return PEOPLE.map((id, i) => {
          v.copy(spots[i].pos).project(camera);
          const x = ((v.x + 1) / 2) * width;
          const y = ((1 - v.y) / 2) * height;
          const inside = x >= 0 && x <= width && y >= 0 && y <= height;
          return { id, x, y, visible: any && spots[i].visible && inside };
        });
      },
      items() {
        const out: Item[] = PEOPLE.map(() => ({ active: false, done: false }));
        for (const act of acts) if (act.items(p, out)) break;
        return PEOPLE.map((id, i) => ({ id, active: out[i].active, done: out[i].done }));
      },
      debug: {
        jump(next: number): void { aimP = clamp(next); p = aimP; vel = 0; draw(); },
        time(t: number): void { idle = t; draw(); },
        look(at: [number, number, number] | null, h = 1): void { lookAt = at; lookH = h; draw(); },
        meshes() {
          const out: { name: string; triangles: number; casts: boolean }[] = [];
          world.scene.traverse(o => {
            const m = o as unknown as { isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number } }; drawRange: { count: number } }; count?: number; name: string; layers: { test(l: unknown): boolean; mask: number } };
            if (!m.isMesh || !m.geometry) return;
            const g = m.geometry;
            const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
            out.push({ name: m.name || o.type, triangles: Math.round(n * (m.count ?? 1)), casts: (m.layers.mask & 2) !== 0 });
          });
          return out;
        },
        stats() {
          const info = pipe.renderer.info.render;
          return { calls: info.calls, triangles: info.triangles, dpr, frameMs, progress: p, halos: world.halos.count, puffs: world.puffs.count, sparks: world.sparks.busy };
        },
        canvas,
      },
    };
    wake();
    resolve(handle);
  })().catch(err => reject(err instanceof Error ? err : new Error(String(err)))); });
}
