import { motionPaused, onMotionPause } from './landing-motion.ts';

/*
 * The opening's scroll engine: parts of the page whose look follows the scroll (a camera moving down the street, the
 * page's light). Each part says which stretch of the page it follows; the engine gives it a progress from 0 to 1 that
 * eases toward where the scroll is (a critically damped follow, frame-rate independent), so nothing steps or jerks.
 * One animation frame loop for all of them, running only while something is still catching up; idle otherwise.
 *
 * Paused (landing-motion.ts), nothing eases: each part is told the scroll's own progress and that the motion is held,
 * and draws a still for it. With the system's reduce-motion setting nothing is registered at all.
 */

export interface Scrub {
  /** The stretch of the page it follows, in page pixels: [first scrollY, last scrollY]. Measured again on resize. */
  range(): readonly [number, number];
  /** Draws the part at progress p (0 to 1). `held` is true while the motion is paused: draw a still, not a step of a move. */
  apply(p: number, held: boolean): void;
  /** How quickly it follows the scroll (per 60 fps frame, 0 to 1); 0.14 by default. */
  follow?: number;
}

interface Entry { scrub: Scrub; from: number; to: number; now: number; aim: number; seen: boolean }

const entries: Entry[] = [];
let raf = 0;
let last = 0;
let booted = false;
/** Scroll speed in pixels per millisecond, smoothed; for parts that react to how fast the page moves. */
let speed = 0;
let lastY = 0;
let lastT = 0;
const speedHooks = new Set<(v: number) => void>();

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));

function measure(): void {
  for (const e of entries) {
    const [from, to] = e.scrub.range();
    e.from = from;
    e.to = Math.max(from + 1, to);
  }
}

function aims(): void {
  const y = scrollY;
  for (const e of entries) e.aim = clamp((y - e.from) / (e.to - e.from));
}

function frame(now: number): void {
  raf = 0;
  const dt = last ? Math.min(64, now - last) : 16.7;
  last = now;
  aims();
  const held = motionPaused();
  let busy = false;
  for (const e of entries) {
    if (held) {
      if (!e.seen || e.now !== e.aim) { e.now = e.aim; e.seen = true; e.scrub.apply(e.now, true); }
      continue;
    }
    const k = e.scrub.follow ?? 0.14;
    const step = 1 - Math.pow(1 - k, dt / 16.7);
    const next = Math.abs(e.aim - e.now) < 0.0004 ? e.aim : e.now + (e.aim - e.now) * step;
    if (next !== e.now || !e.seen) { e.now = next; e.seen = true; e.scrub.apply(next, false); }
    if (e.now !== e.aim) busy = true;
  }
  // Speed: how far the page moved since the last frame, eased back to rest.
  const y = scrollY;
  const v = lastT ? (y - lastY) / Math.max(1, now - lastT) : 0;
  lastY = y; lastT = now;
  speed += (v - speed) * 0.25;
  if (Math.abs(speed) < 0.002) speed = 0;
  if (!held) for (const hook of speedHooks) hook(speed);
  if (speed !== 0 && !held) busy = true;
  if (busy) raf = requestAnimationFrame(frame);
  else last = 0;
}

/** Asks for a frame (scroll, resize, play). */
export function nudge(): void {
  if (!raf && entries.length) raf = requestAnimationFrame(frame);
}

function boot(): void {
  if (booted) return;
  booted = true;
  addEventListener('scroll', nudge, { passive: true });
  addEventListener('resize', () => { measure(); nudge(); }, { passive: true });
  addEventListener('load', () => { measure(); nudge(); });
  void document.fonts?.ready.then(() => { measure(); nudge(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); nudge(); }).observe(document.body);
  onMotionPause(paused => {
    if (paused) { cancelAnimationFrame(raf); raf = 0; last = 0; speed = 0; for (const hook of speedHooks) hook(0); }
    // Held, every part draws its still at once; played, each eases on from there.
    for (const e of entries) e.seen = false;
    measure();
    if (paused) { aims(); for (const e of entries) { e.now = e.aim; e.seen = true; e.scrub.apply(e.now, true); } }
    else nudge();
  });
}

/** Registers a part that follows the scroll. Nothing is registered with reduced motion (the caller checks). */
export function scrub(s: Scrub): { measure(): void; progress(): number } {
  boot();
  const e: Entry = { scrub: s, from: 0, to: 1, now: 0, aim: 0, seen: false };
  entries.push(e);
  const [from, to] = s.range();
  e.from = from; e.to = Math.max(from + 1, to);
  e.now = e.aim = clamp((scrollY - e.from) / (e.to - e.from));
  requestAnimationFrame(() => { measure(); nudge(); });
  return { measure: () => { measure(); nudge(); }, progress: () => e.now };
}

/** Calls `hook` with the page's scroll speed (pixels per millisecond, eased) while it changes. */
export function onSpeed(hook: (v: number) => void): void {
  boot();
  speedHooks.add(hook);
}

/** Measures every part again (after the layout of the page changed in a way no resize shows). */
export function remeasure(): void { measure(); nudge(); }
