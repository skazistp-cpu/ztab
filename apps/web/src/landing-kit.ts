import './landing-kit.css';
import { h } from './dom.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';

/*
 * What the opening's sections share: a runner for the short loops of the app's pieces (each runs only while its
 * picture is on screen and the page is visible, holds on a pause, and is a still picture with reduced motion), the
 * rise of a part into view, figures that roll, a press, and the app's own small pieces (a card with the gold rail, a
 * line with a label and a figure, the tick, a drawn code that holds nothing).
 * Motion is transform and opacity only.
 */

export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
export const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Wait = (ms: number) => Promise<void>;
export interface Loop {
  /** The first frame of the loop, set at once. */
  reset(): void;
  /** The end of the story, set at once: what reduced motion shows. */
  still(): void;
  /** One turn of the loop. `wait` never resolves once the loop is stopped, so a stopped turn simply ends there. */
  run(wait: Wait): Promise<void>;
  /** Once each time the picture comes into view, before the first turn. */
  enter?(wait: Wait): Promise<void>;
  /** While the picture is out of view: how it waits for `enter`. */
  away?(): void;
}

/** Sets a state with no transitions: the class turns them off for one frame. */
export function instant(root: HTMLElement, set: () => void): void {
  root.classList.add('ls-instant');
  set();
  void root.offsetWidth;
  root.classList.remove('ls-instant');
}

/** A wait that a pause can hold and let go on: what it had left is kept. */
interface Timer { id: number; left: number; at: number; done(): void }

/**
 * Runs `loop` while `root` is on screen and the page is visible; with reduced motion it shows the still. A pause holds
 * a turn where it is (its waits stop, and what they had left is kept); a picture that comes into view while the motion
 * is paused shows its still, and playing starts it from the beginning.
 */
export function animate(root: HTMLElement, loop: Loop, threshold = 0.2): void {
  if (calm()) { instant(root, () => loop.still()); return; }
  instant(root, () => { loop.reset(); loop.away?.(); });
  let token = 0;
  let on = false;
  let seen = false;
  let shelved = false;
  const timers = new Set<Timer>();
  const arm = (timer: Timer): void => {
    timer.at = performance.now();
    timer.id = window.setTimeout(() => { timers.delete(timer); timer.done(); }, timer.left);
  };
  const start = (): void => {
    if (on || calm()) return;
    on = true;
    const mine = ++token;
    const wait: Wait = ms => new Promise(resolve => {
      const timer: Timer = { id: 0, left: ms, at: 0, done: () => { if (mine === token) resolve(); } };
      timers.add(timer);
      if (!motionPaused()) arm(timer);
    });
    void (async () => {
      let first = true;
      while (mine === token) {
        if (!first) instant(root, () => loop.reset());
        await wait(80);
        if (first) await loop.enter?.(wait);
        first = false;
        await loop.run(wait);
      }
    })();
  };
  const stop = (): void => {
    if (!on) return;
    on = false;
    token++;
    for (const timer of timers) clearTimeout(timer.id);
    timers.clear();
    for (const a of root.getAnimations({ subtree: true })) a.cancel();
    instant(root, () => { loop.reset(); loop.away?.(); });
  };
  /** The picture is in view: its turns run, or, while the motion is paused, it shows its still. */
  const show = (): void => {
    if (!motionPaused()) { start(); return; }
    if (!on && !shelved) { shelved = true; instant(root, () => loop.still()); }
  };
  onMotionPause(paused => {
    if (paused) {
      for (const timer of timers) { clearTimeout(timer.id); timer.left = Math.max(0, timer.left - (performance.now() - timer.at)); }
    } else if (on) {
      for (const timer of timers) arm(timer);
    } else {
      if (shelved) { shelved = false; instant(root, () => { loop.reset(); loop.away?.(); }); }
      if (seen && !document.hidden) start();
    }
  });
  if (!('IntersectionObserver' in window)) { seen = true; show(); return; }
  const watch = new IntersectionObserver(entries => {
    seen = entries[entries.length - 1].isIntersecting;
    if (seen && !document.hidden) show(); else stop();
  }, { threshold });
  watch.observe(root);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (seen) show(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', event => {
    if (event.matches) { stop(); instant(root, () => { root.querySelectorAll('.ls-away').forEach(el => el.classList.remove('ls-away')); loop.still(); }); } else if (seen) show();
  });
}

/** One WAAPI run, forgotten once done. */
export const play = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions): Animation =>
  el.animate(frames, { easing: EASE, ...options });

/** A figure that rolls: the old text goes up and away, the new one comes up from under it. */
export function figure(text: string): HTMLElement {
  return h('b', { class: 'ls-fig' }, h('span', {}, text));
}
export function roll(fig: HTMLElement, text: string, moving = true): void {
  const spans = [...fig.children] as HTMLElement[];
  const current = spans[spans.length - 1];
  if (current?.textContent === text) return;
  spans.slice(0, -1).forEach(s => s.remove());
  const next = h('span', {}, text);
  fig.append(next);
  if (!moving || !current) { current?.remove(); return; }
  const out = play(current, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-60%)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  const gone = (): void => current.remove();
  out.onfinish = gone;
  out.oncancel = gone;
  play(next, [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 340 });
}

/** A press on something that looks like a button: down, and back with a little spring. */
export function press(el: Element): Animation {
  return el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.95)', offset: 0.3 }, { transform: 'scale(1.015)', offset: 0.7 }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'ease-out' },
  );
}

/**
 * Parts that rise into place as they come into view: 32 px and a fade, 500 ms, those that arrive together 70 ms apart.
 * Nothing is hidden with reduced motion or without IntersectionObserver.
 */
export function rise(root: HTMLElement, parts: HTMLElement[]): void {
  if (calm() || !('IntersectionObserver' in window)) return;
  root.classList.add('ls-armed');
  parts.forEach(part => part.classList.add('ls-rise'));
  const seen = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach((entry, k) => {
      const el = entry.target as HTMLElement;
      el.style.setProperty('--ls-d', `${k * 70}ms`);
      el.classList.add('ls-in');
      seen.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  parts.forEach(part => seen.observe(part));
}

// ── Pieces of the app, as it looks ────────────────────────────────────────────────────────────────────────────────

/** A paper card with the brand's gold rail on its top edge, as every card of the app has. */
export const card = (cls: string, ...children: (Node | string | false | undefined)[]): HTMLElement =>
  h('div', { class: `ls-app ${cls}` }, h('i', { class: 'ls-rail' }), ...children);

/** A label, a gap and a figure, as on the app's cards. */
export const line = (label: string, value: Node | string, cls = ''): HTMLElement =>
  h('p', { class: `ls-row ${cls}`.trim() }, h('span', {}, label), h('i'), typeof value === 'string' ? h('b', {}, value) : value);

/** The tick in a checked box: the app's own mark. */
export function tick(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 8.6l3.1 3.1L13 4.8');
  svg.append(path);
  return svg;
}

/**
 * A code drawn to look like a QR code that holds nothing: its corners are right, everything between them is a fixed
 * random pattern with no format, timing or data a scanner could read. Nothing on this page can be scanned to pay.
 */
export function decoyCode(seed: number, size = 29): SVGSVGElement {
  let s = seed >>> 0;
  const random = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const finder = (x: number, y: number): boolean => x < 8 && y < 8;
  const corner = (x: number, y: number): boolean => finder(x, y) || finder(size - 1 - x, y) || finder(x, size - 1 - y);
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (corner(x, y)) continue;
      if (random() < 0.47) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  const eye = (x: number, y: number): string => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  d += eye(0, 0) + eye(size - 7, 0) + eye(0, size - 7);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `-3 -3 ${size + 6} ${size + 6}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  return svg;
}

/**
 * A spot picture (Jarvis's art for this page): AVIF with a WebP fallback, its file fetched only when its card is near
 * the screen (so a first visit fetches only what it shows), never with a broken image while it waits.
 */
export function spot(name: string, cls: string): HTMLElement {
  const holder = h('span', { class: `ls-spot ${cls}`, 'aria-hidden': 'true' });
  const load = (): void => {
    if (holder.firstChild) return;
    const img = h('img', { alt: '', src: `/landing/${name}-560.webp`, width: '560', height: '560', decoding: 'async', draggable: 'false' });
    // With motion it fades in once it is there; paused, or with reduced motion, it is simply there.
    if (!calm() && !motionPaused()) {
      img.style.opacity = '0';
      const show = (): void => {
        img.style.opacity = '';
        if (!motionPaused()) play(img, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 520 });
      };
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', show, { once: true });
    }
    holder.append(h('picture', {}, h('source', { type: 'image/avif', srcset: `/landing/${name}-560.avif` }), img));
  };
  if (!('IntersectionObserver' in window)) { load(); return holder; }
  const near = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { near.disconnect(); load(); } }, { rootMargin: '480px 0px' });
  near.observe(holder);
  return holder;
}

/**
 * A heading that comes up line by line through a mask when it comes into view: each word rides up from under its own
 * edge, the words of a line together, a line every 60 ms. Until then its words are clipped away (the text untouched, in
 * one inner span: the heading itself is never clipped, so it can be seen coming); for the reveal the words are wrapped
 * in spans, and once they are up the plain text is put back. Nothing with reduced motion; paused, it is simply there.
 */
export function maskReveal(el: HTMLElement): void {
  if (calm() || !('IntersectionObserver' in window)) return;
  const text = el.textContent ?? '';
  const inner = h('span', { class: 'lz-mask-in' }, text);
  el.replaceChildren(inner);
  el.classList.add('lz-masked');
  const seen = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    seen.disconnect();
    if (motionPaused()) { el.classList.remove('lz-masked'); return; }
    const words: HTMLElement[] = [];
    inner.textContent = '';
    for (const part of text.split(/(\s+)/).filter(Boolean)) {
      if (/^\s+$/.test(part)) { inner.append(part); continue; }
      const word = h('span', { class: 'lz-mw-in' }, part);
      words.push(word);
      inner.append(h('span', { class: 'lz-mw' }, word));
    }
    const tops = words.map(word => Math.round((word.parentElement as HTMLElement).offsetTop));
    const lines = [...new Set(tops)].sort((a, b) => a - b);
    el.classList.remove('lz-masked');
    const runs = words.map((word, i) => word.animate([{ transform: 'translate3d(0, 110%, 0)' }, { transform: 'none' }], { duration: 760, delay: lines.indexOf(tops[i]) * 60, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
    // Once every word is up (or a pause brings them up at once), the heading is its plain text again.
    void Promise.allSettled(runs.map(run => run.finished)).then(() => { if (inner.querySelector('.lz-mw')) inner.textContent = text; });
  }, { threshold: 0.25 });
  seen.observe(el);
  onMotionPause(paused => { if (paused) el.classList.remove('lz-masked'); });
}
