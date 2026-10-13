/// <reference types="vite/client" />
import './landing-street.css';
import { h } from './dom.ts';
import { formatFiat } from './money.ts';
import { LANDING_SAMPLE } from './landing-sample.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';
import { scrub } from './landing-scroll.ts';

/*
 * The Ztab street: one camera move from the café table of the first screen down a street of five stations, each the
 * next part of a tab (Jarvis's isometric art, made for this page). On a wide screen the street is held on the screen
 * while the page scrolls (a sticky stage); the scroll moves the camera: into the table, then station by station, and
 * at each station a small scene plays over the art, scrubbed by the scroll: the receipt's strips fly off, six link
 * cards leave along gold ribbons, a beam sweeps the table code and names come up, coins drop into the vault, ticks
 * land on the board and its ring fills. A caption for each station (an approved sentence) comes up through a mask,
 * and a gold rail with five stops shows how far along the street the camera is.
 *
 * On a phone the stations stand one under another, each held on the screen for a moment while its scene plays. With
 * reduced motion they are still pictures with their captions. Paused, the camera and the scenes hold still: the
 * scroll takes the page from one station's still to the next, with no movement in between.
 */

type Point = readonly [number, number];
const usd = (amount: string): string => formatFiat(amount, LANDING_SAMPLE.fiat);
const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}
const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t: number): number => 1 - Math.pow(1 - t, 3);
/** The part of a run [a, b] of u that has gone by, 0 to 1. */
const span = (u: number, a: number, b: number): number => clamp((u - a) / (b - a));

/** The captions, word for word as approved, one for each station. */
export const STREET_SAY = [
  'Split it equally or by item, with a tip.',
  'Each link opens one standard ZIP 321 payment request for one person.',
  'At the table, show one QR: each friend scans it and chooses their name.',
  'They pay from their own Zcash wallet.',
  'Ztab cannot see payments on its own, so tick people off on your own page as payments arrive in your wallet.',
] as const;

// ── The stations: Jarvis's pictures, where each stands on the street, and the points its scene is drawn from ──────

type Key = 'bill' | 'links' | 'table' | 'wallet' | 'ledger';
interface Station {
  readonly key: Key;
  /** The picture: its file name under /landing/ (street-<key>-<width>.avif/.webp), its square canvas, its widths. */
  readonly canvas: number;
  readonly widths: readonly number[];
  /** The platform's left corner in the picture: where it stands on the street. */
  readonly corner: Point;
  /** The platform's width in the picture: every station is drawn at the same platform width on the street. */
  readonly platform: number;
  /** What the camera frames: the picture's drawn part [x0, y0, x1, y1]. */
  readonly box: readonly [number, number, number, number];
  /** Points of the picture its scene is drawn from. */
  readonly points: Readonly<Record<string, Point>>;
}

/** The width every platform is drawn at on the street, and the step from one station to the next, in the café picture's pixels. */
const PLATFORM = 1250;
const STEP: Point = [1650, 90];
const FIRST: Point = [2420, 1010];

const STATIONS: readonly Station[] = [
  {
    key: 'bill', canvas: 1600, widths: [960, 1600], corner: [96, 964], platform: 1407, box: [95, 362, 1504, 1416],
    // The six strips hang from the gold cutter, left to right; each flies off toward the next station.
    points: { s0: [590, 660], s1: [627, 672], s2: [664, 684], s3: [700, 696], s4: [737, 708], s5: [773, 720], out: [1720, 520], printer: [800, 470] },
  },
  {
    key: 'links', canvas: 1600, widths: [960, 1600], corner: [190, 1095], platform: 1219, box: [190, 153, 1410, 1501],
    // The six gold cards on their wires, top row then lower row; and the way out toward the next station.
    points: { c0: [540, 236], c1: [803, 259], c2: [1075, 236], c3: [540, 450], c4: [803, 479], c5: [1075, 450], out: [1760, 700] },
  },
  {
    key: 'table', canvas: 1600, widths: [960, 1600], corner: [100, 1023], platform: 1401, box: [100, 111, 1501, 1509],
    // The table code's face, and the three blank name tags over the phones.
    points: { qrTop: [935, 709], qrBottom: [935, 837], qrHalf: [54, 0], t0: [762, 628], t1: [1027, 519], t2: [1174, 684] },
  },
  {
    key: 'wallet', canvas: 1600, widths: [960, 1600], corner: [140, 1020], platform: 1319, box: [140, 314, 1459, 1446],
    // The vault's door (a phone with a wallet on it), and where the coins fall from.
    points: { door: [725, 817], drop: [725, 383], doorSize: [163, 396] },
  },
  {
    key: 'ledger', canvas: 1600, widths: [960, 1600], corner: [105, 1046], platform: 1391, box: [105, 255, 1496, 1478],
    // The board's six ticks, top to bottom, and the ring.
    points: { k0: [493, 588], k1: [493, 653], k2: [493, 716], k3: [493, 781], k4: [493, 844], k5: [493, 905], ring: [897, 735], ringR: [59, 66] },
  },
];

/** How large a station's picture is drawn on the street (CSS px of the street per pixel of the picture, before the café's own scale). */
const scaleOf = (s: Station): number => PLATFORM / s.platform;
/** Where a station's picture stands on the street (its top left, in the café picture's pixels). */
const placeOf = (s: Station, k: number): Point => {
  const sc = scaleOf(s);
  return [FIRST[0] + k * STEP[0] - s.corner[0] * sc, FIRST[1] + k * STEP[1] - s.corner[1] * sc];
};

const friends = LANDING_SAMPLE.shares.filter(s => !s.own);

/** A small drawing beside each station's caption, in gold strokes that draw themselves: receipt, link, code, wallet, tick. */
const ICONS = [
  ['M6 3h12v17.5l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5z', 'M9 8h6', 'M9 11.5h6', 'M9 15h3.5'],
  ['M10.6 13.4a4 4 0 0 0 5.66 0l2.82-2.83a4 4 0 0 0-5.65-5.65l-1.2 1.2', 'M13.4 10.6a4 4 0 0 0-5.66 0l-2.82 2.83a4 4 0 0 0 5.65 5.65l1.2-1.2'],
  ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h2.5v2.5H14z', 'M18.5 18.5H20V20', 'M14 20h2.5'],
  ['M4 8.5A1.5 1.5 0 0 1 5.5 7H19a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 20H5.5A1.5 1.5 0 0 1 4 18.5z', 'M4.5 7.5 15.5 4v3', 'M16.5 13.5h2'],
  ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M7.8 12.4l2.9 2.9 5.6-6'],
] as const;
function icon(k: number): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('class', 'zs-icon');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[k]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('pathLength', '1');
    el.append(path);
  }
  return el;
}

/** A share's card, as the first screen's cards: the name and the share (a friend's also shows it is a link). */
function chip(name: string, amount: string | undefined, link: boolean): HTMLElement {
  return h('span', { class: 'zs-chip' }, h('i', { class: 'zs-chip-rail' }), h('b', {}, name), amount ? h('span', {}, amount) : undefined,
    link ? h('i', { class: 'zs-chip-link', 'aria-hidden': 'true' }) : undefined);
}

interface Built { el: HTMLElement; tile: HTMLElement; play(u: number): void; caption: HTMLElement }

/** A point along a curve from a to b that rises by `lift`, at t (0 to 1). */
function arc(a: Point, b: Point, lift: number, t: number): Point {
  const c: Point = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - lift];
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

function station(s: Station, k: number): Built {
  const N = s.canvas;
  const set = (type: string): string => s.widths.map(w => `/landing/street-${s.key}-${w}.${type} ${w}w`).join(', ');
  // The picture is asked for only when its station is near (see street()); until then it has no source.
  const img = h('img', { alt: '', width: String(N), height: String(N), decoding: 'async', draggable: 'false' });
  img.dataset.srcset = set('webp');
  const source = h('source', { type: 'image/avif' });
  source.dataset.srcset = set('avif');
  const art = h('div', { class: 'zs-art' }, h('picture', {}, source, img));
  const lines = svg('svg', { class: 'zs-lines', viewBox: `0 0 ${N} ${N}`, 'aria-hidden': 'true', focusable: 'false' });
  const layer = h('div', { class: 'zs-over', 'aria-hidden': 'true' });
  const p = s.points;
  const pt = (name: string): Point => p[name];
  /** Places an element of the scene at a point of the picture (in %, so it follows the picture's size). */
  const place = (el: HTMLElement, [x, y]: Point): void => { el.style.left = `${(x / N) * 100}%`; el.style.top = `${(y / N) * 100}%`; };
  let play: (u: number) => void = () => undefined;

  if (s.key === 'bill') {
    // The six strips leave the receipt one after another and fly off toward the next station, turning as they go.
    const strips = [0, 1, 2, 3, 4, 5].map(() => svg('path', { class: 'zs-strip', d: 'M-15 -62q-4 30 2 62q4 34 -2 62h30q6 -28 2 -62q-5 -32 -2 -62z' }));
    lines.append(...strips);
    play = u => {
      strips.forEach((strip, i) => {
        const t = ease(span(u, 0.3 + i * 0.07, 0.68 + i * 0.05));
        const from = pt(`s${i}`);
        const to: Point = [p.out[0] + i * 26, p.out[1] - 120 + i * 60];
        const [x, y] = arc(from, to, 220 - i * 18, t);
        strip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(-8 + 70 * t + i * 5).toFixed(1)}deg) scale(${(1 - 0.25 * t).toFixed(3)})`;
        strip.style.opacity = String(t <= 0 || t >= 1 ? 0 : Math.min(1, t * 8, (1 - t) * 4));
      });
    };
  } else if (s.key === 'links') {
    // The six cards on the wires get their names and shares (the engine's split of the sample dinner), then leave
    // along gold ribbons toward the next station.
    const people = LANDING_SAMPLE.shares;
    const paths = people.map((_, i) => {
      const a = pt(`c${i}`);
      const to: Point = [p.out[0], p.out[1] - 300 + i * 120];
      const c1: Point = [a[0] + 300, a[1] - 140];
      const c2: Point = [to[0] - 360, to[1] - 60];
      return { a, to, c1, c2, d: `M${a[0]} ${a[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${to[0]} ${to[1]}` };
    });
    const ribbons = paths.map(path => svg('path', { class: 'zs-ribbon', d: path.d, pathLength: '1' }));
    lines.append(...ribbons);
    const cards = people.map(share => chip(share.name, usd(share.fiatShare), !share.own));
    layer.append(...cards);
    const at = (path: typeof paths[number], t: number): Point => {
      const v = 1 - t;
      return [
        v * v * v * path.a[0] + 3 * v * v * t * path.c1[0] + 3 * v * t * t * path.c2[0] + t * t * t * path.to[0],
        v * v * v * path.a[1] + 3 * v * v * t * path.c1[1] + 3 * v * t * t * path.c2[1] + t * t * t * path.to[1],
      ];
    };
    play = u => {
      // Named while the camera comes and stays (the still in the middle of the stay shows them on their wires); then,
      // as the camera leaves, the ribbons draw and the cards go along them toward the next station.
      ribbons.forEach((ribbon, i) => {
        ribbon.style.strokeDashoffset = String(1 - out(span(u, 0.76 + i * 0.015, 0.9 + i * 0.012)));
        // Once its card has gone along it, the ribbon goes too.
        ribbon.style.opacity = String(1 - span(u, 0.96, 1));
      });
      cards.forEach((card, i) => {
        const named = out(span(u, 0.12 + i * 0.05, 0.3 + i * 0.05));
        const t = ease(span(u, 0.8 + i * 0.02, 0.97 + i * 0.006));
        place(card, at(paths[i], t));
        card.style.opacity = String(named * (t >= 1 ? 0 : 1));
        card.style.transform = `translate(-50%, -50%) scale(${(0.82 + 0.18 * named - 0.2 * t).toFixed(3)})`;
      });
    };
  } else if (s.key === 'table') {
    // A gold beam sweeps the table code, then the friends' names come up in the three tags over their phones.
    const [qx, qTop] = p.qrTop, [, qBottom] = p.qrBottom, [half] = p.qrHalf;
    const beam = svg('rect', { class: 'zs-beam', x: String(qx - half - 10), y: '0', width: String(half * 2 + 20), height: '9', rx: '4.5' });
    lines.append(beam);
    const names = friends.slice(0, 3).map(f => h('span', { class: 'zs-tagname' }, f.name));
    names.forEach((n, i) => { place(n, pt(`t${i}`)); layer.append(n); });
    play = u => {
      const t = span(u, 0.12, 0.38);
      const y = qTop + (qBottom - qTop) * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t));
      beam.style.transform = `translateY(${y.toFixed(1)}px)`;
      beam.style.opacity = String(t > 0 && t < 1 ? 1 : 0);
      names.forEach((n, i) => {
        const v = out(span(u, 0.38 + i * 0.08, 0.52 + i * 0.08));
        n.style.opacity = String(v);
        n.style.transform = `translate(-50%, ${(-50 + 30 * (1 - v)).toFixed(1)}%) scale(${(0.86 + 0.14 * v).toFixed(3)})`;
      });
    };
  } else if (s.key === 'wallet') {
    // Gold coins fall into the vault's door, one after another, and the door glows as each goes in.
    const [dx, dy] = p.door, [, top] = p.drop, [dw, dh] = p.doorSize;
    const glow = svg('rect', { class: 'zs-glow', x: String(dx - dw / 2), y: String(dy - dh / 2), width: String(dw), height: String(dh), rx: '18' });
    const coins = [0, 1, 2, 3, 4].map(() => svg('g', { class: 'zs-coin' }, svg('ellipse', { rx: '38', ry: '15', cy: '9', class: 'zs-coin-edge' }), svg('ellipse', { rx: '38', ry: '15' })));
    lines.append(glow, ...coins);
    play = u => {
      let lit = 0;
      coins.forEach((coin, i) => {
        const t = span(u, 0.22 + i * 0.1, 0.46 + i * 0.1);
        const x = dx + (i - 2) * 18 * (1 - t);
        const y = top + (dy - top) * t * t;
        coin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 - 0.35 * t * t).toFixed(3)})`;
        coin.style.opacity = String(t <= 0 || t >= 1 ? 0 : Math.min(1, t * 6, (1 - t) * 10));
        if (t >= 1) lit = Math.max(lit, 1 - span(u, 0.46 + i * 0.1, 0.62 + i * 0.1));
      });
      glow.style.opacity = String(0.55 * lit);
    };
  } else {
    // The board's ticks light up row by row, and the ring's gold runs round.
    const glows = [0, 1, 2, 3, 4, 5].map(i => {
      const [x, y] = pt(`k${i}`);
      return svg('circle', { class: 'zs-tickglow', cx: String(x), cy: String(y), r: '38' });
    });
    const [rx, ry] = p.ring, [rr, rv] = p.ringR;
    const ring = svg('ellipse', { class: 'zs-ring', cx: String(rx), cy: String(ry), rx: String(rr), ry: String(rv), pathLength: '1', transform: `rotate(-90 ${rx} ${ry})` });
    lines.append(...glows, ring);
    play = u => {
      glows.forEach((g, i) => {
        const v = span(u, 0.18 + i * 0.09, 0.36 + i * 0.09);
        g.style.opacity = String(Math.sin(Math.PI * v) * 0.95);
        g.style.transform = `scale(${(0.6 + 0.6 * v).toFixed(3)})`;
      });
      ring.style.strokeDashoffset = String(1 - out(span(u, 0.2, 0.9)));
      ring.style.opacity = String(span(u, 0.15, 0.25) * (1 - span(u, 0.92, 1)) * 0.95);
    };
  }
  const tile = h('div', { class: 'zs-tile' }, art, h('div', { class: 'zs-lines-wrap' }, lines), layer);
  const caption = h('p', { class: 'zs-say' }, h('span', { class: 'zs-say-in' }, icon(k), STREET_SAY[k]));
  const el = h('div', { class: `zs-station zs-${s.key}`, 'data-k': String(k) }, h('div', { class: 'zs-station-in' }, tile, caption));
  return { el, tile, play, caption };
}

/** Gives a station's picture its files: the first time it comes near the screen. */
function loadArt(b: Built): void {
  const img = b.el.querySelector<HTMLImageElement>('.zs-art img');
  const source = b.el.querySelector<HTMLSourceElement>('.zs-art source');
  if (!img || img.srcset || !img.dataset.srcset) return;
  const sizes = '(max-width: 759px) 100vw, 62vw';
  if (source?.dataset.srcset) { source.sizes = sizes; source.srcset = source.dataset.srcset; }
  img.sizes = sizes;
  img.srcset = img.dataset.srcset;
}

// ── The camera ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A camera: the point of the street (CSS px of the street) shown at the point (fx, fy) of the screen, at zoom z. */
interface Camera { x: number; y: number; z: number; fx: number; fy: number }
const mix = (a: Camera, b: Camera, t: number): Camera => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z * Math.pow(b.z / a.z, t),
  fx: a.fx + (b.fx - a.fx) * t,
  fy: a.fy + (b.fy - a.fy) * t,
});
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * The beats of the move, each a stretch of the scroll (in screen heights) and the camera at its start and end:
 * first the words of the first screen lift away while the picture of the dinner rises, whole, to the middle of the
 * screen, and rests there; then the dive: the picture comes a little nearer (never blown up) while a drawn copy of the
 * bill folder grows from the folder until its charcoal covers the screen; the cut: the street opens from that charcoal
 * (the 3D street's own close-up of the printer, or the drawn street's first station, the charcoal closing onto the
 * printer); then for each other station the way there and the stay; at the end the whole street, and night falls.
 */
type BeatKind = 'lift' | 'rest' | 'dive' | 'open' | 'travel' | 'stay' | 'wide';
interface Beat { kind: BeatKind; len: number; from: Camera; to: Camera; k: number }
const LEN: Record<BeatKind, number> = { lift: 0.7, rest: 0.15, dive: 0.8, open: 0.55, travel: 0.48, stay: 0.62, wide: 0.9 };
/** The nearest the picture of the dinner is brought: past this it would be seen blown up. */
const ZOOM_MAX = 1.5;
/** The bill folder's top face in the wide and the tall picture of the dinner (their own pixels), measured. */
const FOLDER = {
  wide: [[1182.5, 608], [1287.5, 668], [1221, 715], [1123, 656]],
  tall: [[540.8, 727], [614.7, 775], [560, 806], [495, 765]],
} as const;
/** The first station's printer: the charcoal face the cut closes onto (station 1's own pixels), measured. */
const PRINTER = [[851, 462], [962, 505], [962, 680], [851, 640]] as const;
/** Where in the last beat night starts to fall (the drawn street; the 3D street says its own span). */
const DUSK_FROM = 0.5;
/** A scene's still: where it stands in the middle of its station's stay (what a pause and reduced motion show). */
const STILL = 0.72;
/** The night the street ends in: the page's ink (--lz-night). */
const NIGHT = [11, 12, 15] as const;

/** The Ztab street in 3D (Three.js, another module): loaded only if it is part of the build, and only after the page has moved. */
interface Street3D {
  setProgress(p: number): void;
  setPaused(paused: boolean): void;
  resize(): void;
  dispose(): void;
  readonly stations: readonly number[];
  anchors(): { id: string; x: number; y: number; visible: boolean }[];
  /** Nightfall's span of its progress: the page darkens its own ground over it (the canvas is clear). */
  readonly dusk?: readonly [number, number];
  /** The six people's state at the present moment, for the legend on a phone. */
  items?(): { id: string; active: boolean; done: boolean }[];
}
type Mount3D = (host: HTMLElement, options: { onReady?: () => void }) => Promise<Street3D>;
const LOAD3D = import.meta.glob<{ mountStreet: Mount3D }>('./street3d/index.ts')['./street3d/index.ts'];
/** Whether the 3D street can be tried here: it is in the build and the browser has WebGL 2 (no context is made to ask). */
const can3d = (): boolean => Boolean(LOAD3D) && typeof WebGL2RenderingContext !== 'undefined';
/** A person's id in the 3D street: the name in plain lower-case letters (Tomás is tomas). */
const idOf = (name: string): string => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface Street { section: HTMLElement; goTo(k: number): void }

/**
 * The street, with the first screen's words and the café's picture of the first screen at its start.
 * `words` are the first screen's ticker, headline, lead and ways in; `cafe` is the picture of the dinner (landing-hero.ts).
 * `onNight` hears when the street's ground turns dark at nightfall, and light again (for the header).
 */
export function street(words: HTMLElement, cafe: HTMLElement, onNight: (dark: boolean) => void = () => undefined): Street {
  const built = STATIONS.map((s, k) => station(s, k));
  const cafeTile = h('div', { class: 'zs-cafe' }, cafe);
  const props = h('div', { class: 'zs-props', 'aria-hidden': 'true' });
  const world = h('div', { class: 'zs-world' }, props, cafeTile, ...built.map(b => b.el));
  // The cut: a drawn copy of the bill folder's top (charcoal with its gold edge), laid exactly over the picture's folder
  // and grown from it until it covers the screen; on the drawn street it then closes onto the printer of station 1.
  // The folder opens like a book: its inside, its cover (turning on its near edge), the cover's gold edge and a glint
  // running along the spine; then the inside grows over the screen.
  const part = <K extends 'polygon' | 'polyline'>(tag: K, cls: string): SVGElementTagNameMap[K] => {
    const el = document.createElementNS(NS, tag);
    el.setAttribute('class', cls);
    return el;
  };
  const cutFace = part('polygon', 'zs-cut-face');
  const cutEdge = part('polyline', 'zs-cut-edge');
  const cutInside = part('polygon', 'zs-cut-inside');
  const cutCover = part('polygon', 'zs-cut-cover');
  const cutStitch = part('polygon', 'zs-cut-stitch');
  const cutGild = part('polyline', 'zs-cut-gild');
  const cutGlint = part('polyline', 'zs-cut-glint');
  cutGlint.setAttribute('pathLength', '1');
  const cutter = document.createElementNS(NS, 'svg');
  cutter.setAttribute('class', 'zs-cutter');
  cutter.setAttribute('aria-hidden', 'true');
  cutter.append(cutFace, cutEdge, cutInside, cutCover, cutStitch, cutGild, cutGlint);
  const host3d = h('div', { class: 'zs-3d', 'aria-hidden': 'true' });
  const labels3d = LANDING_SAMPLE.shares.map(share => chip(share.name, usd(share.fiatShare), !share.own));
  const labelLayer = h('div', { class: 'zs-3d-labels', 'aria-hidden': 'true' }, ...labels3d);
  const captions = built.map((b, k) => h('p', { class: 'zs-hud-say' }, h('span', { class: 'zs-say-in' }, icon(k), b.caption.textContent ?? '')));
  // On a phone the 3D street names no one at the stations (the names would collide): a legend of the six under the
  // caption does, each lit while that person's part is playing and gold once it is done.
  const legendRows = LANDING_SAMPLE.shares.map(share => h('span', { class: 'zs-legend-row', 'data-id': idOf(share.name) }, h('i', { class: 'zs-legend-dot' }), h('b', {}, share.name), h('span', {}, usd(share.fiatShare))));
  const legend = h('div', { class: 'zs-legend' }, ...legendRows);
  const fill = h('i', { class: 'zs-rail-fill' });
  const stops = STATIONS.map(() => h('i', { class: 'zs-stop' }));
  const rail = h('div', { class: 'zs-rail', 'aria-hidden': 'true' }, h('i', { class: 'zs-rail-line' }, fill), ...stops);
  const hud = h('div', { class: 'zs-hud', 'aria-hidden': 'true' }, h('div', { class: 'zs-hud-says' }, ...captions, legend), rail);
  // The night sky over the street: sparse stars that come out at nightfall and twinkle, and one shooting star.
  let seed = 0x5eed;
  const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const stars = h('div', { class: 'zs-stars', 'aria-hidden': 'true' }, ...Array.from({ length: 42 }, () => {
    const star = h('i', { class: 'zs-star' });
    const size = 1.3 + rand() * 1.9;
    star.style.cssText = `left:${(rand() * 100).toFixed(2)}%;top:${(rand() * 100).toFixed(2)}%;width:${size.toFixed(2)}px;height:${size.toFixed(2)}px;--tw:${(2.6 + rand() * 4.2).toFixed(2)}s;--td:${(-rand() * 6).toFixed(2)}s;--to:${(0.5 + rand() * 0.5).toFixed(2)}`;
    return star;
  }));
  const shooter = h('i', { class: 'zs-shooter', 'aria-hidden': 'true' });
  let shot = false;
  const stage = h('div', { class: 'zs-stage' }, stars, shooter, words, world, host3d, labelLayer, cutter, hud);
  // With no held stage (reduced motion, or a phone without the 3D street), night falls on the page as it scrolls on.
  const nightfall = h('div', { class: 'zs-nightfall', 'data-night': '', 'aria-hidden': 'true' });
  const section = h('section', { class: 'zs', 'aria-labelledby': 'landing-title' }, stage, nightfall);
  const wide = matchMedia('(min-width: 760px)');
  let mode: 'pinned' | 'stack' = 'stack';
  let narrow = false;
  let portrait = false;
  let f = 0.5; // CSS px per pixel of the café's picture
  let W = 1440, H = 900;
  let beats: Beat[] = [];
  let ends: number[] = []; // progress at each beat's end
  let lit = -1;
  let held = false;
  let lastP = 0;
  let dark = false;
  /** Where each station's scene was last drawn, so a scene that has not moved is not drawn again. */
  const played: number[] = STATIONS.map(() => -1);
  let three: Street3D | undefined;
  let threeOn = false;
  /** The bill folder's top and the printer's face, in the street's px (laid out by layout()). */
  let folderQuad: [number, number][] = [];
  let printerQuad: [number, number][] = [];
  /** The stretch of the page the stage is held for, and where the scroll is in it (not eased). */
  let track: [number, number] = [0, 1];
  const rawProgress = (): number => clamp((scrollY - track[0]) / Math.max(1, track[1] - track[0]));

  // The props between the stations (Jarvis's lamp, bench and plant), each lamp with a glow that comes up as the camera passes.
  const PROPS: { name: string; between: number; dx: number; dy: number; size: number }[] = [];
  for (let k = 0; k < STATIONS.length - 1; k++) {
    PROPS.push({ name: 'lamp', between: k, dx: 0.42, dy: -40, size: 760 });
    PROPS.push({ name: k % 2 ? 'bench' : 'plant', between: k, dx: 0.62, dy: 120, size: k % 2 ? 560 : 420 });
  }
  const propEls = PROPS.map(prop => {
    const img = h('img', { alt: '', width: '640', height: '640', decoding: 'async', draggable: 'false' });
    img.dataset.srcset = `/landing/street-${prop.name}-640.webp 640w`;
    const source = h('source', { type: 'image/avif' });
    source.dataset.srcset = `/landing/street-${prop.name}-640.avif 640w`;
    const glow = prop.name === 'lamp' ? h('i', { class: 'zs-lamp-glow' }) : undefined;
    const el = h('div', { class: `zs-prop zs-prop-${prop.name}` }, h('picture', {}, source, img), glow);
    props.append(el);
    return { prop, el, img, source, glow };
  });
  const loadProps = (): void => {
    for (const { img, source } of propEls) {
      if (img.srcset || !img.dataset.srcset) continue;
      source.srcset = source.dataset.srcset ?? '';
      img.srcset = img.dataset.srcset;
    }
  };

  /**
   * Lays the street out for the screen: held on a wide screen with motion, and on a phone with motion when the 3D
   * street can be tried there (its drawn street, framed for the phone, stands in until it is in); otherwise one station
   * under another. Then the stations' places, the cameras and the beats.
   */
  const layout = (): void => {
    // A phone's width takes the tall picture of the dinner; a screen taller than wide (a phone, or a tablet held
    // upright, as the 3D street sees it: under 0.8 wide for its height) frames each station in its upper part with
    // the caption under it.
    narrow = !wide.matches;
    portrait = innerWidth / Math.max(1, innerHeight) < 0.8;
    mode = !calm() && (!narrow || can3d()) ? 'pinned' : 'stack';
    section.classList.toggle('zs-pinned', mode === 'pinned');
    section.classList.toggle('zs-stacked', mode === 'stack');
    section.classList.toggle('zs-portrait', portrait);
    if (mode === 'stack') {
      section.style.removeProperty('--zs-len');
      for (const prop of ['opacity', 'transform', 'visibility']) words.style.removeProperty(prop);
      world.style.removeProperty('transform');
      world.style.removeProperty('filter');
      stage.style.removeProperty('background-color');
      cafeTile.style.removeProperty('width');
      built.forEach(b => { for (const prop of ['left', 'top', 'width']) b.el.style.removeProperty(prop); });
      cutter.style.opacity = '0';
      return;
    }
    W = stage.clientWidth || innerWidth;
    H = stage.clientHeight || innerHeight;
    const bar = (document.querySelector('.lz-nav') as HTMLElement | null)?.offsetHeight || 72;
    // The first screen: the whole picture of the dinner under the words, at zoom 1, with at least 24 px under it; then
    // the same picture risen, whole, to the middle of the screen below the header; and its bill folder.
    let first: Camera, centred: Camera, near: Camera, fs: number, quad: readonly (readonly [number, number])[];
    const top = words.offsetTop + words.offsetHeight + (narrow ? 6 : Math.max(8, H * 0.012));
    if (narrow) {
      // The tall picture, a little wider than the screen as on the first screen of a phone.
      const cw = W * 1.12;
      fs = cw / 1080;
      f = W / 700;
      cafeTile.style.width = `${cw}px`;
      const ch = cw * 1.25;
      first = { x: W / 2 - (W - cw) / 2, y: H / 2 - top, z: 1, fx: W / 2, fy: H / 2 };
      const zc = Math.min(1, (H - bar - 24) / ch);
      centred = { x: cw / 2, y: ch / 2, z: zc, fx: W / 2, fy: bar + (H - bar) / 2 };
      quad = FOLDER.tall;
    } else {
      const fit = Math.max(320, (H - top - 24) / 0.5625);
      const cafeW = Math.min(1600, W - 48, fit);
      fs = f = cafeW / 2400;
      cafeTile.style.width = `${cafeW}px`;
      const ch = cafeW * 0.5625;
      first = { x: W / 2 - (W - cafeW) / 2, y: H / 2 - top, z: 1, fx: W / 2, fy: H / 2 };
      const zc = Math.min(1.12, (H - bar - 48) / ch, (W - 48) / cafeW);
      centred = { x: cafeW / 2, y: ch / 2, z: zc, fx: W / 2, fy: bar + (H - bar) / 2 };
      quad = FOLDER.wide;
    }
    // The dive brings the picture no nearer than ZOOM_MAX, the folder in the middle of the screen.
    const fc = quad.reduce((acc, [x, y]) => [acc[0] + x / 4, acc[1] + y / 4], [0, 0]);
    near = { x: fc[0] * fs, y: fc[1] * fs, z: Math.min(ZOOM_MAX, centred.z * 1.4), fx: W / 2, fy: bar + (H - bar) / 2 };
    folderQuad = quad.map(([x, y]) => [x * fs, y * fs] as [number, number]);
    built.forEach((b, k) => {
      const s = STATIONS[k];
      const [x, y] = placeOf(s, k);
      b.el.style.left = `${x * f}px`;
      b.el.style.top = `${y * f}px`;
      b.el.style.width = `${s.canvas * scaleOf(s) * f}px`;
    });
    // The props stand on the white between two stations' platforms.
    for (const { prop, el } of propEls) {
      const x = FIRST[0] + prop.between * STEP[0] + PLATFORM + (STEP[0] - PLATFORM) * prop.dx - prop.size / 2;
      const y = FIRST[1] + prop.between * STEP[1] + prop.dy - prop.size * 0.86;
      el.style.left = `${x * f}px`;
      el.style.top = `${y * f}px`;
      el.style.width = `${prop.size * f}px`;
    }
    // A station: on a wide screen its drawn part framed right of the middle, the captions' side left clear; on a phone
    // in the upper part of the screen, the caption under it.
    const at = (k: number): Camera => {
      const s = STATIONS[k];
      const [x, y] = placeOf(s, k);
      const sc = scaleOf(s);
      const [x0, y0, x1, y1] = s.box;
      const bw = (x1 - x0) * sc * f, bh = (y1 - y0) * sc * f;
      const point = { x: (x + ((x0 + x1) / 2) * sc) * f, y: (y + ((y0 + y1) / 2) * sc) * f };
      return portrait
        ? { ...point, z: Math.min((0.94 * W) / bw, (0.5 * H) / bh), fx: W / 2, fy: H * 0.37 }
        : { ...point, z: Math.min((0.7 * H) / bh, (0.54 * W) / bw), fx: W * 0.64, fy: H * 0.55 };
    };
    // The printer's charcoal face at station 1, where the drawn street's cut closes (in the street's px).
    const s0 = STATIONS[0];
    const [px, py] = placeOf(s0, 0);
    printerQuad = PRINTER.map(([x, y]) => [(px + x * scaleOf(s0)) * f, (py + y * scaleOf(s0)) * f] as [number, number]);
    // At the end: the whole street on a wide screen; on a phone the last station, a little further off.
    const last = STATIONS.length - 1;
    const [ax] = placeOf(STATIONS[0], 0);
    const [bx] = placeOf(STATIONS[last], last);
    const span = (bx + STATIONS[last].canvas * scaleOf(STATIONS[last]) - ax) * f;
    const all: Camera = portrait
      ? { ...at(last), z: at(last).z * 0.7, fy: H * 0.42 }
      : { x: ax * f + span / 2, y: (FIRST[1] + last * STEP[1] * 0.5 - 180) * f, z: Math.min((0.9 * W) / span, 1), fx: W / 2, fy: H * 0.52 };
    beats = [
      { kind: 'lift', len: LEN.lift, from: first, to: centred, k: -1 },
      { kind: 'rest', len: LEN.rest, from: centred, to: centred, k: -1 },
      { kind: 'dive', len: LEN.dive, from: centred, to: near, k: -1 },
      { kind: 'open', len: LEN.open, from: at(0), to: at(0), k: 0 },
      { kind: 'stay', len: LEN.stay, from: at(0), to: at(0), k: 0 },
    ];
    for (let k = 1; k <= last; k++) {
      beats.push({ kind: 'travel', len: LEN.travel, from: at(k - 1), to: at(k), k });
      beats.push({ kind: 'stay', len: LEN.stay, from: at(k), to: at(k), k });
    }
    // The last beat: to the whole street in its first part (the camera then stands still while night falls).
    beats.push({ kind: 'wide', len: LEN.wide, from: at(last), to: all, k: last });
    played.fill(-1);
    const total = beats.reduce((sum, b) => sum + b.len, 0);
    let run = 0;
    ends = beats.map(b => (run += b.len) / total);
    section.style.setProperty('--zs-len', String(total + 1));
  };

  const startOf = (i: number): number => (i === 0 ? 0 : ends[i - 1]);
  /** Where station k is centred (the middle of its stay), in the progress of the whole move. */
  const centre = (k: number): number => {
    const i = beats.findIndex(b => b.kind === 'stay' && b.k === k);
    return (startOf(i) + ends[i]) / 2;
  };
  /** Where the 3D street takes over: the moment of the cut (the end of the dive). */
  const cutAt = (): number => ends[2];
  /** The 3D street's progress at the stage's progress p. */
  const q3 = (p: number): number => clamp((p - cutAt()) / (1 - cutAt()));
  /** How far night has fallen at progress p (0 day, 1 night): the 3D street's own span, or the last beat's end. */
  const duskAt = (p: number): number => {
    if (three && threeOn) {
      const [d0, d1] = three.dusk ?? [0.94, 1];
      return smooth(clamp((q3(p) - d0) / Math.max(1e-6, d1 - d0)));
    }
    const i = beats.length - 1;
    const from = startOf(i) + (ends[i] - startOf(i)) * DUSK_FROM;
    return smooth(clamp((p - from) / Math.max(1e-6, ends[i] - from)));
  };

  /** The camera and the scenes at progress p of the whole move. */
  const draw = (p: number, hold: boolean): void => {
    if (mode !== 'pinned' || !beats.length) return;
    held = hold;
    lastP = p;
    // Where the stage has got to (eased): for tests to wait on, as nothing else says it.
    section.dataset.p = p.toFixed(4);
    // Paused, the camera stands at the nearest still: the first screen, a station, or the street at night.
    if (hold) {
      const stills = [0, ...STATIONS.map((_, k) => centre(k)), 1];
      p = stills.reduce((best, s) => (Math.abs(s - p) < Math.abs(best - p) ? s : best), 0);
    }
    let i = ends.findIndex(m => p <= m);
    if (i < 0) i = ends.length - 1;
    const beat = beats[i];
    const local = clamp((p - startOf(i)) / Math.max(1e-6, ends[i] - startOf(i)));
    const t = beat.kind === 'wide' ? ease(clamp(local / DUSK_FROM)) : ease(local);
    const cam = mix(beat.from, beat.to, t);
    world.style.transform = `translate3d(${(cam.fx - cam.x * cam.z).toFixed(2)}px, ${(cam.fy - cam.y * cam.z).toFixed(2)}px, 0) scale(${cam.z.toFixed(4)})`;
    // Phase one, the lift: the first screen's words rise and fade while the picture rises, whole, to the middle. Its
    // cards drift outward and go as the dive begins.
    const lift = clamp(p / ends[0]);
    const into = clamp((p - startOf(2)) / (ends[2] - startOf(2)));
    words.style.opacity = String(clamp(1 - lift * 1.5));
    words.style.transform = `translate3d(0, ${(-lift * 110).toFixed(1)}px, 0)`;
    words.style.visibility = lift >= 0.7 ? 'hidden' : '';
    cafeTile.style.setProperty('--zs-drift', clamp(into * 1.4).toFixed(4));
    cafeTile.style.setProperty('--zs-fade', clamp(1 - into * 1.8).toFixed(4));
    // The cut, drawn (crisp at any size): in the dive, a copy of the bill folder's top laid exactly over the picture's
    // folder grows from the folder's middle until its charcoal covers the screen. After it: over the 3D street the
    // charcoal gives way to the 3D street's own charcoal close-up; on the drawn street it closes onto station 1's printer.
    const toScreen = (q: readonly [number, number], c: Camera): [number, number] => [c.fx + (q[0] - c.x) * c.z, c.fy + (q[1] - c.y) * c.z];
    const grow = (pts: [number, number][], g: number): [number, number][] => {
      const cx = pts.reduce((a, q) => a + q[0] / 4, 0), cy = pts.reduce((a, q) => a + q[1] / 4, 0);
      return pts.map(([x, y]) => [cx + (x - cx) * g, cy + (y - cy) * g]);
    };
    /** How much a quad must grow about its middle to cover the whole screen. */
    const cover = (pts: [number, number][]): number => {
      const cx = pts.reduce((a, q) => a + q[0] / 4, 0), cy = pts.reduce((a, q) => a + q[1] / 4, 0);
      let inner = Infinity;
      for (let e = 0; e < 4; e++) {
        const [ax, ay] = pts[e], [bx, by] = pts[(e + 1) % 4];
        inner = Math.min(inner, Math.abs((bx - ax) * (ay - cy) - (ax - cx) * (by - ay)) / Math.hypot(bx - ax, by - ay));
      }
      const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
      return (far / Math.max(1, inner)) * 1.04;
    };
    let cut: [number, number][] | undefined;
    let cutOpacity = 1;
    let covered = false;
    const pts = (q: [number, number][]): string => q.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    let book = false;
    let inkTop = false;
    if (beat.kind === 'dive' && folderQuad.length) {
      // The folder: [far top, far right, near bottom, near left] on the screen.
      const base = folderQuad.map(q => toScreen(q, cam));
      const xs = base.map(q => q[0]);
      const width = Math.max(...xs) - Math.min(...xs);
      // It comes up toward the eye (till about a third of a wide screen across, half of a phone's), its cover turns open
      // on its near edge, then its dark inside grows over the screen.
      const gA = Math.max(1, ((W < 760 ? 0.5 : 0.3) * W) / Math.max(1, width));
      const gC = Math.max(gA * 1.01, cover(base));
      const rise = smooth(clamp((local - 0.18) / 0.27));
      const open = ease(clamp((local - 0.45) / 0.27));
      const fill = clamp((local - 0.72) / 0.21);
      const g = Math.pow(gA, rise) * Math.pow(gC / gA, Math.pow(fill, 2.2));
      const [T, R, B, L] = grow(base, g);
      const theta = open * Math.PI * 0.97;
      const turn = (from: [number, number], to: [number, number]): [number, number] => {
        const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy);
        return [from[0] + Math.cos(theta) * dx, from[1] + Math.cos(theta) * dy - Math.sin(theta) * len];
      };
      const coverPts: [number, number][] = [L, B, turn(B, R), turn(L, T)];
      cutInside.setAttribute('points', pts([T, R, B, L]));
      cutCover.setAttribute('points', pts(coverPts));
      cutCover.classList.toggle('zs-cover-inner', theta > Math.PI / 2);
      // Lit from above: the cover darkens as it stands up, and its inside lightens a little as it lies down again.
      const lit = Math.abs(Math.cos(theta));
      cutCover.style.fill = theta > Math.PI / 2 ? `rgb(${Math.round(30 + 10 * lit)}, ${Math.round(29 + 10 * lit)}, ${Math.round(33 + 10 * lit)})` : `rgb(${Math.round(40 + 16 * lit)}, ${Math.round(39 + 16 * lit)}, ${Math.round(42 + 16 * lit)})`;
      inkTop = fill > 0.55;
      cutGild.setAttribute('points', pts([coverPts[2], coverPts[3]]));
      // The cover's gold stitching, a little in from its edges, on its outside.
      const at = (u: number, v: number): [number, number] => {
        const [c0, c1, c2, c3] = coverPts;
        const w = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
        return [w[0] * c0[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * c3[0], w[0] * c0[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * c3[1]];
      };
      cutStitch.setAttribute('points', pts([at(0.09, 0.07), at(0.91, 0.07), at(0.91, 0.93), at(0.09, 0.93)]));
      cutStitch.style.opacity = theta < Math.PI / 2 ? (0.85 * (1 - theta / (Math.PI / 2))).toFixed(3) : '0';
      cutGlint.setAttribute('points', pts([L, B]));
      cutGlint.style.strokeDashoffset = (0.32 - 1.4 * open).toFixed(3);
      cutGlint.style.opacity = Math.sin(Math.PI * open).toFixed(3);
      cut = [T, R, B, L];
      covered = local >= 0.93;
      book = true;
    } else if (beat.kind === 'open') {
      if (threeOn) {
        // Charcoal on charcoal: the 3D street opens on its own close-up of the printer under it.
        cut = [[-2, -2], [W + 2, -2], [W + 2, H + 2], [-2, H + 2]];
        cutOpacity = 1 - clamp(local / 0.12);
      } else if (printerQuad.length) {
        const base = printerQuad.map(q => toScreen(q, cam));
        const g = Math.pow(cover(base), Math.pow(1 - clamp(local / 0.7), 2.2));
        cut = grow(base, g);
        cutOpacity = 1 - clamp((local - 0.7) / 0.12);
      }
      covered = local === 0;
      if (cut) {
        cutFace.setAttribute('points', pts(cut));
        const [, r, bb] = cut;
        cutEdge.setAttribute('points', pts([r, bb]));
      }
    }
    cutter.classList.toggle('zs-book', book);
    if (cut && cutOpacity > 0) {
      cutter.setAttribute('viewBox', `0 0 ${W} ${H}`);
      cutter.style.opacity = cutOpacity.toFixed(3);
      cutter.style.visibility = 'visible';
    } else {
      cutter.style.visibility = 'hidden';
    }
    stage.dataset.cut = covered ? 'cover' : cut ? 'open' : '';
    // Before the cut there is only the café: the street's stations and props are not shown beside it.
    stage.classList.toggle('zs-before-cut', p < cutAt());
    // The 3D street, once it is there, takes over at the cut. It eases on its own, so it is given the scroll's own
    // progress (or, paused, the still's), not this one, which has already been eased.
    const in3d = threeOn && p >= cutAt();
    // It is laid in under the folder's charcoal a moment before the cut, while the charcoal covers the screen, so that
    // it has faded in and drawn its first picture by the time the charcoal lifts (a quick scroll shows no grey).
    stage.classList.toggle('zs-3d-on', in3d || (threeOn && covered));
    if (in3d && !watched) watch();
    if (three && threeOn) three.setProgress(q3(hold ? p : rawProgress()));
    // Nightfall: the stage's ground goes from white to the page's ink (the 3D canvas is clear over it); the drawn street
    // darkens a little and its lamps glow.
    const dusk = duskAt(p);
    stage.style.backgroundColor = dusk > 0 ? `rgb(${NIGHT.map(c => Math.round(255 + (c - 255) * dusk)).join(', ')})` : '';
    // At night the street's foot fades into the ink, so the band that follows takes it on with no edge.
    stage.style.setProperty('--zs-dusk', dusk.toFixed(3));
    world.style.filter = dusk > 0 && !in3d ? `brightness(${(1 - 0.45 * dusk).toFixed(3)})` : '';
    stage.classList.toggle('zs-dusk', dusk > 0.5);
    stage.classList.toggle('zs-night', dusk > 0.02);
    // The moment night has fallen, once: a shooting star.
    if (dusk >= 0.985 && !shot && !hold && !motionPaused()) {
      shot = true;
      // On a phone the sky is a corner above the roofs: a shorter, flatter flight that stays in it.
      const tall = H > W;
      const [x1, x2, y1, y2, tilt] = tall ? [-0.1, -0.34, 0.012, 0.04, -9] : [-0.12, -0.42, 0.04, 0.14, -18];
      shooter.animate([
        { opacity: 0, transform: `translate3d(0, 0, 0) rotate(${tilt}deg) scaleX(0.3)` },
        { opacity: 1, transform: `translate3d(${(W * x1).toFixed(0)}px, ${(H * y1).toFixed(0)}px, 0) rotate(${tilt}deg) scaleX(1)`, offset: 0.25 },
        { opacity: 0, transform: `translate3d(${(W * x2).toFixed(0)}px, ${(H * y2).toFixed(0)}px, 0) rotate(${tilt}deg) scaleX(0.6)` },
      ], { duration: tall ? 950 : 1150, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' });
    }
    // The header turns to night glass at nightfall, and while the cut's charcoal lies under it.
    const under = (x: number, y: number): boolean => {
      if (!cut || cutOpacity < 0.5) return false;
      let sum = 0;
      for (let e = 0; e < 4; e++) { const [ax, ay] = cut[e], [bx, by] = cut[(e + 1) % 4]; sum += Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); }
      return Math.abs(sum) === 4;
    };
    const night = dusk > 0.5 || inkTop || (under(0, 0) && under(W, 0) && under(W / 2, 72));
    if (night !== dark) { dark = night; onNight(dark); }
    // Each station's picture is asked for as the camera nears it; the props with the first one.
    if (p > 0.004) { loadArt(built[0]); loadProps(); }
    built.forEach((b, k) => { if (k > 0 && p > centre(k - 1) - 0.02) loadArt(b); });
    // Each station's scene: from the start of the way there to the end of its stay (drawn only when it changes).
    let now = -1;
    built.forEach((b, k) => {
      const arrive = beats.findIndex(x => (x.kind === 'open' || x.kind === 'travel') && x.k === k);
      const stay = beats.findIndex(x => x.kind === 'stay' && x.k === k);
      const a = startOf(arrive), z = ends[stay];
      const u = clamp((p - a) / (z - a));
      if (played[k] !== u) { played[k] = u; b.play(u); }
      const from = (a + ends[arrive]) / 2;
      const to = k === STATIONS.length - 1 ? startOf(beats.length - 1) + (ends[beats.length - 1] - startOf(beats.length - 1)) * 0.3 : ends[stay];
      if (p >= from && p < to) now = k;
    });
    // Lamps between the stations glow as the camera passes them, and all of them at night.
    for (const { prop, glow } of propEls) {
      if (!glow) continue;
      const near = 1 - clamp(Math.abs(p - (centre(prop.between) + centre(prop.between + 1)) / 2) / 0.07);
      glow.style.opacity = Math.max(0.15 + 0.85 * near, dusk).toFixed(3);
      glow.style.transform = `translate(-50%, -50%) scale(${(1 + 1.4 * dusk).toFixed(3)})`;
    }
    if (in3d && three) {
      // Captions and the rail follow the 3D street's own stations; its people's names follow its anchors (a wide
      // screen) or light up in the legend (a phone).
      const q = q3(p);
      const st = three.stations;
      const [d0] = three.dusk ?? [0.94, 1];
      now = st.reduce((best, c, k) => (Math.abs(c - q) < Math.abs(st[best] - q) ? k : best), 0);
      if (q < st[0] - 0.06 || q > d0 - 0.02) now = -1;
      fill.style.transform = `scaleX(${clamp((q - st[0]) / (st[st.length - 1] - st[0])).toFixed(4)})`;
      stops.forEach((stop, k) => stop.classList.toggle('on', q >= st[k] - 0.002));
      if (portrait) {
        const states = three.items?.() ?? [];
        legendRows.forEach(row => {
          const item = states.find(x => x.id === row.dataset.id);
          row.classList.toggle('on', Boolean(item?.active));
          row.classList.toggle('done', Boolean(item?.done) && !item?.active);
        });
      } else {
        const points = three.anchors();
        labels3d.forEach((label, k) => {
          const id = idOf(LANDING_SAMPLE.shares[k].name);
          const a = points.find(x => x.id === id) ?? points[k];
          label.style.opacity = a?.visible ? '1' : '0';
          if (a) label.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -100%)`;
        });
      }
    } else {
      // The rail: from the first station's stay to the last's.
      const r0 = centre(0), r1 = centre(STATIONS.length - 1);
      fill.style.transform = `scaleX(${clamp((p - r0) / (r1 - r0)).toFixed(4)})`;
      stops.forEach((stop, k) => stop.classList.toggle('on', p >= centre(k) - 0.02));
    }
    hud.classList.toggle('zs-legend-on', in3d && portrait);
    show(now);
    hud.classList.toggle('zs-hud-on', now >= 0);
  };

  /** The caption of station k comes up through its mask; the one before goes. */
  const show = (k: number): void => {
    if (k === lit) return;
    const was = lit;
    lit = k;
    captions.forEach((c, i) => c.classList.toggle('on', i === k));
    if (held || calm()) return;
    const inner = captions[k]?.firstElementChild;
    if (inner) inner.animate([{ transform: 'translate3d(0, 105%, 0)' }, { transform: 'none' }], { duration: 640, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
    // Its drawing draws itself in, stroke by stroke.
    captions[k]?.querySelectorAll('.zs-icon path').forEach((path, i) => {
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 820, delay: 260 + i * 130, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'backwards' });
    });
    const gone = captions[was]?.firstElementChild;
    if (gone) gone.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate3d(0, -60%, 0)', opacity: 0 }], { duration: 360, easing: 'cubic-bezier(0.4, 0, 1, 1)' });
  };

  /**
   * The 3D street: asked for only after the page has been scrolled with motion while the street's stage is on the
   * screen (a first visit that does not scroll, and Lighthouse, never load it; nor does a scroll in the steps of a tab,
   * when the opening is hidden), only if the build has it, and only if WebGL 2 is there. If it fails, or its frames are
   * slow (a median over 24 ms, in its first second and in its first moments on the screen), the drawn street stays.
   */
  let asked = false;
  /** The median of the frame times in a run of frames of `ms` milliseconds, from now. */
  const medianFrame = (ms: number): Promise<number> => new Promise(resolve => {
    const times: number[] = [];
    let last = 0;
    const t0 = performance.now();
    const step = (now: number): void => {
      if (last) times.push(now - last);
      last = now;
      if (now - t0 < ms) { requestAnimationFrame(step); return; }
      times.sort((x, y) => x - y);
      resolve(times.length ? times[Math.floor(times.length / 2)] : Infinity);
    };
    requestAnimationFrame(step);
  });
  const dropThree = (): void => {
    three?.dispose();
    three = undefined;
    threeOn = false;
    host3d.replaceChildren();
    section.classList.remove('zs-3d-ready');
    played.fill(-1);
    draw(lastP, held);
  };
  /** Once the 3D street first shows (after the cut), its first moments on the screen are timed too. */
  let watched = false;
  const watch = (): void => {
    if (watched || !threeOn || !stage.classList.contains('zs-3d-on') || motionPaused()) return;
    watched = true;
    // The first half second may hold a shader being made; then a second and a half is timed.
    window.setTimeout(() => { void medianFrame(1500).then(ms => { if (ms > 24 && three) dropThree(); }); }, 500);
  };
  const ask3d = (): void => {
    if (asked || mode !== 'pinned' || calm() || scrollY < 40 || !LOAD3D) return;
    // Only while the street's stage is shown and near the screen (the steps of a tab hide the opening).
    const box = section.getBoundingClientRect();
    if (!section.getClientRects().length || box.bottom < -innerHeight || box.top > 2 * innerHeight) return;
    asked = true;
    if (!can3d()) return;
    void LOAD3D().then(mod => mod.mountStreet(host3d, {})).then(async handle => {
      three = handle;
      handle.setPaused(motionPaused());
      // A first second of frames: if they are slow, the drawn street stays.
      if (await medianFrame(1000) > 24) { dropThree(); return; }
      threeOn = true;
      section.classList.add('zs-3d-ready');
      played.fill(-1);
      draw(lastP, held);
      watch();
    }).catch(() => { three = undefined; host3d.replaceChildren(); });
  };

  const boot = (): void => {
    if (!section.isConnected) { requestAnimationFrame(boot); return; }
    layout();
    // One under another (phones, reduced motion), each picture is asked for when its station comes near the screen.
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting || mode !== 'stack') continue;
          const b = built.find(x => x.el === e.target);
          if (b) { loadArt(b); near.unobserve(e.target); }
        }
      }, { rootMargin: '0px 0px 100px 0px' });
      built.forEach(b => near.observe(b.el));
    } else built.forEach(loadArt);
    // With reduced motion each scene is the still it shows in the middle of its stay.
    if (calm()) { built.forEach(b => b.play(STILL)); return; }
    const camera = scrub({
      range: () => {
        const top = section.getBoundingClientRect().top + scrollY;
        track = [top, top + section.offsetHeight - nightfall.offsetHeight - innerHeight];
        return track;
      },
      apply: (p, hold) => draw(p, hold),
      follow: 0.12,
    });
    for (const b of built) {
      scrub({
        range: () => {
          if (mode !== 'stack') return [0, 1];
          const r = b.el.getBoundingClientRect();
          const top = r.top + scrollY;
          return [top - innerHeight * 0.6, top + r.height - innerHeight];
        },
        apply: (u, hold) => { if (mode === 'stack') b.play(hold ? STILL : u); },
        follow: 0.16,
      });
    }
    // One under another on a phone, the first screen goes as the page leaves it: the dinner comes nearer, the words go.
    // As the pinned street leaves the screen, its sky lags a little behind it.
    scrub({
      range: () => (mode === 'pinned' ? [track[1], track[1] + innerHeight] : [0, 1]),
      apply: (p, hold) => {
        const q = mode === 'pinned' && !hold ? p : 0;
        stars.style.translate = q ? `0 ${(0.32 * innerHeight * q).toFixed(1)}px` : '';
        shooter.style.translate = stars.style.translate;
      },
      follow: 0.2,
    });
    scrub({
      range: () => [0, Math.max(1, words.offsetHeight + cafe.offsetHeight * 0.8)],
      apply: (p, hold) => {
        if (mode !== 'stack') { if (cafe.style.transform) cafe.style.removeProperty('transform'); return; }
        const q = hold ? 0 : p;
        cafe.style.transform = q ? `scale(${(1 + 0.22 * q).toFixed(4)})` : '';
        words.style.opacity = q ? String(clamp(1 - q * 1.5)) : '';
        words.style.transform = q ? `translate3d(0, ${(-q * 50).toFixed(1)}px, 0)` : '';
      },
      follow: 0.16,
    });
    const relayout = (): void => { layout(); camera.measure(); three?.resize(); };
    wide.addEventListener?.('change', relayout);
    addEventListener('resize', relayout, { passive: true });
    addEventListener('scroll', ask3d, { passive: true });
    onMotionPause(paused => three?.setPaused(paused));
  };
  boot();

  return {
    section,
    /** Scrolls to station k's stay (or to the street on a phone). */
    goTo(k: number): void {
      const smooth = !calm() && !motionPaused();
      if (mode === 'pinned' && beats.length) {
        let p = centre(k);
        if (three && threeOn) p = cutAt() + three.stations[k] * (1 - cutAt());
        scrollTo({ top: track[0] + p * (track[1] - track[0]), behavior: smooth ? 'smooth' : 'auto' });
      } else {
        built[k].el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      }
    },
  };
}
