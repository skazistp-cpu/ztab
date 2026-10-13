import { h } from './dom.ts';
import { formatFiat } from './money.ts';
import { LANDING_SAMPLE } from './landing-sample.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';
import { TICKER, tickerLine } from './landing-ticker.ts';
import { ribbon, TALL, WIDE, type Ribbon, type Scene } from './landing-scene.ts';

/*
 * The opening's first screen and its last band.
 *
 * The first screen: a ticker of example splits, the headline, the way in, and the dinner: a table seen from above
 * with the bill in the middle and six phones round it. Gold ribbons draw from the bill to each phone, a small piece of
 * gold runs along each one, and as it arrives the phone's screen lights and a small card shows that person's share of
 * the bill (the engine's own split of the sample dinner, LANDING_SAMPLE). Then a calm loop: now and then a piece runs
 * along one ribbon again. The picture drifts a little with the pointer and the scroll.
 *
 * Motion is transform, opacity and the ribbons' stroke only; with reduced motion it is one composed still, the
 * ribbons drawn and every card shown. A pause (landing-motion.ts) holds all of it where it is.
 */

const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPRING = 'cubic-bezier(0.3, 1.36, 0.55, 1)';
const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

/** The ticker: example splits, the strip twice so it can run on without a seam. */
export function ticker(): HTMLElement {
  const items = (): HTMLElement[] => TICKER.map(item => h('span', { class: 'lz-tick' }, tickerLine(item)));
  const track = h('div', { class: 'lz-track' }, h('div', { class: 'lz-run' }, ...items()), h('div', { class: 'lz-run', 'aria-hidden': 'true' }, ...items()));
  return h('div', { class: 'lz-ticker' }, track);
}

// ── The dinner ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The intro's beats (ms from the start). */
const ART_IN = 700;
const RIB_START = 620;
const RIB_GAP = 150;
const RIB_DRAW = 1050;
const POP = 560;
/** The calm loop: one piece of gold along one ribbon every BEAT ms, the six in turn. */
const BEAT = 2300;
const TRAVEL = 1250;

const arrival = (k: number): number => RIB_START + k * RIB_GAP + RIB_DRAW;
const INTRO_END = arrival(5) + POP + 300;

/** A small link mark: two rounded links, drawn in gold beside a friend's share. */
function linkMark(): SVGSVGElement {
  return svg('svg', { class: 'lz-tag-link', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.9.9' }),
    svg('path', { d: 'M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l.9-.9' }));
}

/** A person's card over their phone: their name and their share of the bill (a friend's also shows it is a link). */
function tag(i: number): HTMLElement {
  const share = LANDING_SAMPLE.shares[i];
  return h(
    'div',
    { class: share.own ? 'lz-tag lz-own' : 'lz-tag' },
    h(
      'div',
      { class: 'lz-tag-in' },
      h('i', { class: 'lz-tag-rail' }),
      h('span', { class: 'lz-tag-name' }, share.name),
      h('span', { class: 'lz-tag-amt' }, formatFiat(share.fiatShare, LANDING_SAMPLE.fiat)),
      share.own ? undefined : linkMark(),
    ),
  );
}

interface Built {
  scene: Scene;
  art: HTMLElement;
  lines: SVGSVGElement;
  cardLayer: HTMLElement;
  seats: { rib: Ribbon; glow: SVGPathElement; line: SVGPathElement; pulse: SVGPathElement; pack: SVGPolygonElement; lit: SVGPolygonElement; halo: SVGEllipseElement; card: HTMLElement }[];
  bill: SVGEllipseElement;
  /** The length of the light that runs along a ribbon in the loop. */
  dash: number;
}

/** The sizes the picture is shown at, for the browser to choose a file (index.html preloads with the same words). */
// The tall picture is chosen for a phone's width only, so a window made wider later (with the steps open, say) asks
// for no other file of it.
export const PICTURE_SIZES = { wide: '(min-width: 1600px) 1600px, 100vw', tall: '(max-width: 759px) 112vw, 437px' } as const;
export const pictureSet = (scene: Scene, type: 'avif' | 'webp'): string =>
  scene.files.widths.map(w => `/landing/${scene.files.name}-${w}.${type} ${w}w`).join(', ');

/** The picture of the dinner, and everything drawn over it, for one of the two compositions. */
function build(scene: Scene): Built {
  const sizes = scene === TALL ? PICTURE_SIZES.tall : PICTURE_SIZES.wide;
  const middle = scene.files.widths[Math.min(1, scene.files.widths.length - 1)];
  // The picture's sources are given only once the image sits in its <picture> after the AVIF source, so a browser
  // never starts on the WebP file before it has seen the AVIF one.
  const img = h('img', { alt: '', width: String(scene.w), height: String(scene.h), decoding: 'async', fetchpriority: 'high', draggable: 'false' });
  const art = h('div', { class: 'lz-art' }, h('picture', {}, h('source', { type: 'image/avif', srcset: pictureSet(scene, 'avif'), sizes }), img));
  img.sizes = sizes;
  img.srcset = pictureSet(scene, 'webp');
  img.src = `/landing/${scene.files.name}-${middle}.webp`;
  const defs = svg('defs', {},
    svg('linearGradient', { id: 'lz-gold', x1: '0', y1: '0', x2: '1', y2: '1' },
      svg('stop', { offset: '0', 'stop-color': '#F9D36A' }), svg('stop', { offset: '0.55', 'stop-color': '#F4B728' }), svg('stop', { offset: '1', 'stop-color': '#E09A0E' })),
    svg('linearGradient', { id: 'lz-lit', x1: '0', y1: '0', x2: '0', y2: '1' },
      svg('stop', { offset: '0', 'stop-color': '#FFFBEF' }), svg('stop', { offset: '1', 'stop-color': '#F9D774' })),
    svg('radialGradient', { id: 'lz-halo' },
      svg('stop', { offset: '0', 'stop-color': '#F4B728', 'stop-opacity': '0.6' }), svg('stop', { offset: '1', 'stop-color': '#F4B728', 'stop-opacity': '0' })),
    svg('radialGradient', { id: 'lz-warm' },
      svg('stop', { offset: '0', 'stop-color': '#FFD36B', 'stop-opacity': '0.5' }), svg('stop', { offset: '0.6', 'stop-color': '#FFC94A', 'stop-opacity': '0.16' }), svg('stop', { offset: '1', 'stop-color': '#F4B728', 'stop-opacity': '0' })),
    svg('radialGradient', { id: 'lz-lamp' },
      svg('stop', { offset: '0', 'stop-color': '#FFF7DA', 'stop-opacity': '0.95' }), svg('stop', { offset: '0.35', 'stop-color': '#FFD86B', 'stop-opacity': '0.55' }), svg('stop', { offset: '1', 'stop-color': '#F4B728', 'stop-opacity': '0' })));
  const lines = svg('svg', { class: 'lz-lines', viewBox: `0 0 ${scene.w} ${scene.h}`, 'aria-hidden': 'true', focusable: 'false' }, defs);
  lines.style.setProperty('--sw', String(scene.stroke));
  // The lamps of the string lights: each glow comes and goes on its own slow time (landing.css).
  const lamps = svg('g', { class: 'lz-lamps' }, ...scene.lamps.map(([x, y]) => svg('circle', { class: 'lz-lamp', cx: String(x), cy: String(y), r: String(scene.glow), fill: 'url(#lz-lamp)' })));
  const g = scene.glow;
  const bill = svg('ellipse', { class: 'lz-bill-glow', cx: String(scene.bill[0]), cy: String(scene.bill[1]), rx: String(g * 4.4), ry: String(g * 2.4), fill: 'url(#lz-halo)' });
  // The string lights' warm glow on the table, breathing slowly (landing.css).
  const [tx, ty, trx, try_] = scene.table;
  const warm = svg('ellipse', { class: 'lz-tableglow', cx: String(tx), cy: String(ty), rx: String(trx), ry: String(try_), fill: 'url(#lz-warm)' });
  // Steam from the kiosk's cups: two wisps over each stack, rising and fading in turn (landing.css).
  const k = scene.steamSize;
  const wisp = (x: number, y: number, n: number): SVGPathElement => svg('path', {
    class: `lz-wisp lz-wisp-${n}`,
    d: `M${x} ${y}c${(-0.18 * k).toFixed(1)} ${(-0.2 * k).toFixed(1)} ${(0.2 * k).toFixed(1)} ${(-0.36 * k).toFixed(1)} 0 ${(-0.56 * k).toFixed(1)}s${(0.22 * k).toFixed(1)} ${(-0.34 * k).toFixed(1)} ${(0.02 * k).toFixed(1)} ${(-0.5 * k).toFixed(1)}`,
    'stroke-width': (k * 0.075).toFixed(2),
  });
  const steam = svg('g', { class: 'lz-steam' }, ...scene.steam.flatMap(([x, y], i) => [wisp(x - k * 0.06, y, i * 2), wisp(x + k * 0.07, y - k * 0.04, i * 2 + 1)]));
  const under = svg('g', { class: 'lz-under' }, warm, bill);
  const over = svg('g', { class: 'lz-over' });
  lines.append(lamps, steam, under, over);
  const cardLayer = h('div', { class: 'lz-tags' });
  cardLayer.style.setProperty('--cs', String(scene.cardSize));
  const dash = scene.stroke * 11;
  const half = scene.stroke * 2.6;
  const seats = scene.seats.map((seat, i) => {
    const rib = ribbon(scene, seat);
    const halo = svg('ellipse', { class: 'lz-halo', cx: String(seat.phone[0]), cy: String(seat.phone[1]), rx: String(g * 2.5), ry: String(g * 1.35), fill: 'url(#lz-halo)' });
    const lit = svg('polygon', { class: 'lz-lit', points: seat.screen.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '), fill: 'url(#lz-lit)' });
    const glow = svg('path', { class: 'lz-glow', d: rib.d });
    const line = svg('path', { class: 'lz-line', d: rib.d });
    const pulse = svg('path', { class: 'lz-pulse', d: rib.d });
    // A piece of gold, cut at the Z's angle, that runs along the ribbon.
    const pack = svg('polygon', { class: 'lz-pack', points: `${-half},${-half * 0.45} ${half * 0.5},${-half * 0.45} ${half},${half * 0.45} ${-half * 0.5},${half * 0.45}` });
    for (const path of [glow, line]) path.style.strokeDasharray = `${rib.length.toFixed(1)}px ${rib.length.toFixed(1)}px`;
    pulse.style.strokeDasharray = `${dash}px ${(rib.length + dash).toFixed(1)}px`;
    pulse.style.strokeDashoffset = `${dash}px`;
    under.append(halo, lit);
    over.append(glow, line, pulse, pack);
    const card = tag(i);
    card.style.left = `${((seat.card[0] / scene.w) * 100).toFixed(3)}%`;
    card.style.top = `${((seat.card[1] / scene.h) * 100).toFixed(3)}%`;
    // Which way the card drifts when the camera goes into the table (landing-street.css): away from the bill.
    const ox = seat.card[0] - scene.bill[0], oy = seat.card[1] - scene.bill[1], len = Math.hypot(ox, oy) || 1;
    card.style.setProperty('--dx', ((ox / len) * 150).toFixed(1));
    card.style.setProperty('--dy', ((oy / len) * 110).toFixed(1));
    cardLayer.append(card);
    return { rib, glow, line, pulse, pack, lit, halo, card };
  });
  return { scene, art, lines, cardLayer, seats, bill, dash };
}

/** Keyframes for a piece of gold along a ribbon between two moments of a run of `total` ms (opacity in at the start, out at the end). */
function along(rib: Ribbon, from: number, to: number, total: number): Keyframe[] {
  const o = (ms: number): number => Math.min(1, Math.max(0, ms / total));
  const frames: Keyframe[] = [];
  const pos = (k: number, opacity: number): Keyframe => {
    const [x, y, a] = rib.at[k];
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${a.toFixed(1)}deg)`, opacity };
  };
  if (from > 0) frames.push({ ...pos(0, 0), offset: 0 });
  const n = rib.at.length - 1;
  // Ease in and out over the run: more frames are not needed, the points are close.
  rib.at.forEach((_, k) => {
    const t = k / n;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const ms = from + (to - from) * eased;
    const opacity = t < 0.06 ? t / 0.06 : t > 0.9 ? Math.max(0, (1 - t) / 0.1) : 1;
    frames.push({ ...pos(k, opacity), offset: o(ms) });
  });
  if (to < total) frames.push({ ...pos(n, 0), offset: 1 });
  // Offsets must not go back; equal neighbours are fine.
  for (let k = 1; k < frames.length; k++) frames[k].offset = Math.max(frames[k].offset as number, frames[k - 1].offset as number);
  return frames;
}

export function heroScene(): HTMLElement {
  const stage = h('div', { class: 'lz-scene', 'aria-hidden': 'true' });
  const frame = h('div', { class: 'lz-frame' });
  stage.append(frame);
  const tall = matchMedia('(max-width: 759px)');
  let built: Built | undefined;
  const intro: Animation[] = [];
  const loop: Animation[] = [];
  let seen = true;

  const layout = (): void => {
    for (const a of [...intro.splice(0), ...loop.splice(0)]) a.cancel();
    const scene = tall.matches ? TALL : WIDE;
    built = build(scene);
    frame.style.setProperty('--ar', `${scene.w} / ${scene.h}`);
    frame.replaceChildren(
      h('div', { class: 'lz-layer', 'data-depth': '0.22' }, built.art),
      h('div', { class: 'lz-layer', 'data-depth': '0.42' }, built.lines),
      h('div', { class: 'lz-layer', 'data-depth': '0.7' }, built.cardLayer),
    );
  };

  /** The calm loop: a piece runs along each ribbon in turn, its phone's light rises and its card nods. */
  /** Plays an animation on from where it is; one that has run to its end stays there (play would start it over). */
  const resume = (a: Animation): void => {
    const end = Number(a.effect?.getComputedTiming().endTime ?? Infinity);
    if (Number(a.currentTime ?? 0) < end) a.play();
  };
  const startLoop = (delay: number): void => {
    if (!built || calm()) return;
    const period = BEAT * built.seats.length;
    const dash = `${built.dash}px`;
    built.seats.forEach((s, k) => {
      const t0 = k * BEAT;
      const o = (ms: number): number => ms / period;
      const end = t0 + TRAVEL;
      const timing: KeyframeAnimationOptions = { duration: period, iterations: Infinity, delay };
      // Offsets inside the loop, never past its end and never going back.
      const mono = (frames: Keyframe[]): Keyframe[] => {
        let last = 0;
        return frames.map(f => { last = Math.max(last, Math.min(1, (f.offset as number) ?? last)); return { ...f, offset: last }; });
      };
      loop.push(s.pack.animate(along(s.rib, t0, end, period), { ...timing }));
      loop.push(s.pulse.animate([
        { offset: 0, strokeDashoffset: dash },
        { offset: o(t0), strokeDashoffset: dash, easing: 'cubic-bezier(0.45, 0.05, 0.3, 1)' },
        { offset: o(end), strokeDashoffset: `${(-s.rib.length).toFixed(1)}px` },
        { offset: 1, strokeDashoffset: `${(-s.rib.length).toFixed(1)}px` },
      ], timing));
      loop.push(s.halo.animate(mono([
        { offset: 0, opacity: 0.6 }, { offset: o(end - 60), opacity: 0.6, easing: 'ease-out' }, { offset: o(end + 220), opacity: 1, easing: 'ease-in-out' },
        { offset: o(end + 900), opacity: 0.6 }, { offset: 1, opacity: 0.6 },
      ]), timing));
      loop.push(s.lit.animate(mono([
        { offset: 0, opacity: 0.86 }, { offset: o(end - 60), opacity: 0.86, easing: 'ease-out' }, { offset: o(end + 160), opacity: 1, easing: 'ease-in-out' },
        { offset: o(end + 800), opacity: 0.86 }, { offset: 1, opacity: 0.86 },
      ]), timing));
      loop.push(s.card.firstElementChild!.animate(mono([
        { offset: 0, transform: 'scale(1)' }, { offset: o(end - 40), transform: 'scale(1)', easing: 'ease-out' }, { offset: o(end + 180), transform: 'scale(1.06)', easing: 'ease-in-out' },
        { offset: o(end + 520), transform: 'scale(1)' }, { offset: 1, transform: 'scale(1)' },
      ]), timing));
    });
    if (motionPaused() || !seen) for (const a of loop) a.pause();
  };

  /** The intro: the picture rises in, the ribbons draw from the bill, the pieces run, the phones light, the cards pop. */
  const playIntro = (): void => {
    if (!built || calm()) return;
    // The picture rises into place (no fade: it is the first screen's largest picture, and is seen from the first paint).
    intro.push(built.art.animate([{ transform: 'translate3d(0, 22px, 0) scale(0.985)' }, { transform: 'none' }], { duration: ART_IN, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }));
    intro.push(built.bill.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.25)', offset: 0.55 }, { opacity: 0.8, transform: 'scale(1)' }], { duration: 900, delay: RIB_START - 300, easing: 'ease-out', fill: 'backwards' }));
    built.seats.forEach((s, k) => {
      const start = RIB_START + k * RIB_GAP;
      const land = arrival(k);
      for (const path of [s.glow, s.line]) {
        intro.push(path.animate([{ strokeDashoffset: `${s.rib.length.toFixed(1)}px` }, { strokeDashoffset: '0px' }], { duration: RIB_DRAW, delay: start, easing: 'cubic-bezier(0.55, 0.05, 0.25, 1)', fill: 'backwards' }));
      }
      intro.push(s.pack.animate(along(s.rib, 0, RIB_DRAW, RIB_DRAW), { duration: RIB_DRAW, delay: start }));
      intro.push(s.lit.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0.86 }], { duration: 700, delay: land - 60, easing: 'ease-out', fill: 'backwards' }));
      intro.push(s.halo.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1.15)', offset: 0.4 }, { opacity: 0.6, transform: 'scale(1)' }], { duration: 1000, delay: land - 80, easing: 'ease-out', fill: 'backwards' }));
      intro.push(s.card.firstElementChild!.animate(
        [{ opacity: 0, transform: 'translate3d(0, 14px, 0) scale(0.6)' }, { opacity: 1, transform: 'none' }],
        { duration: POP, delay: land, easing: SPRING, fill: 'backwards' },
      ));
      // A friend's card: its little link turns once as the card lands.
      const glyph = s.card.querySelector('.lz-tag-link');
      if (glyph) intro.push(glyph.animate([{ transform: 'rotate(-180deg) scale(0.6)' }, { transform: 'rotate(15deg) scale(1.1)', offset: 0.7 }, { transform: 'none' }], { duration: 760, delay: land + 180, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'backwards' }));
    });
    if (motionPaused()) for (const a of intro) a.pause();
  };

  // Depth: the layers drift with the pointer (where there is a mouse) and with the scroll, the cards most; on a spring.
  let px = 0, py = 0, tx = 0, ty = 0, vx = 0, vy = 0, raf = 0, last = 0;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const tick = (now: number): void => {
    const dt = Math.min(0.032, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    vx += (110 * (tx - px) - 18 * vx) * dt; px += vx * dt;
    vy += (110 * (ty - py) - 18 * vy) * dt; py += vy * dt;
    // On the street's stage the camera moves the picture; the scroll adds no depth of its own there.
    const r = stage.getBoundingClientRect();
    const scroll = stage.closest('.zs-pinned') ? 0 : Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
    for (const layer of frame.children as HTMLCollectionOf<HTMLElement>) {
      const d = Number(layer.dataset.depth ?? 0.4);
      layer.style.setProperty('--px', `${(px * 18 * d).toFixed(2)}px`);
      layer.style.setProperty('--py', `${(py * 12 * d + scroll * 46 * d).toFixed(2)}px`);
    }
    // The spring asks for frames until it has come to rest; a scroll asks for one again.
    const moving = Math.abs(tx - px) + Math.abs(ty - py) + Math.abs(vx) + Math.abs(vy) > 0.002;
    raf = seen && !motionPaused() && moving ? requestAnimationFrame(tick) : 0;
  };
  const kick = (): void => { if (!raf && seen && !motionPaused() && !calm()) { last = 0; raf = requestAnimationFrame(tick); } };

  const begin = (): void => {
    if (!stage.isConnected) { requestAnimationFrame(begin); return; }
    layout();
    if (calm()) return;
    playIntro();
    startLoop(INTRO_END);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        seen = entries[entries.length - 1].isIntersecting;
        for (const a of [...intro, ...loop]) { if (seen && !motionPaused()) resume(a); else a.pause(); }
        // The cards' float is a loop of CSS: this class holds it while the picture is off screen (landing.css).
        stage.classList.toggle('lz-off', !seen);
        kick();
      }).observe(stage);
    }
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      kick();
    }, { passive: true });
    // A scroll asks for a frame: the depth reads where the picture is on the screen.
    addEventListener('scroll', kick, { passive: true });
    // Pause motion: the intro and the loop hold where they are and the depth stops following; playing carries on.
    onMotionPause(paused => {
      const all = [...intro, ...loop];
      if (paused) {
        cancelAnimationFrame(raf);
        raf = 0;
        for (const a of all) a.pause();
      } else {
        if (seen) for (const a of all) resume(a);
        kick();
      }
    });
    // A phone turned on its side, or a window made narrow: the other composition, already drawn.
    tall.addEventListener?.('change', () => { layout(); startLoop(0); });
  };
  begin();
  return stage;
}

/** The Cut-ribbon Z, drawn large for the last band, in a soft gold light; light runs slowly along its gold. */
export function bigMark(): HTMLElement {
  const holder = h('span', { class: 'lz-mark', 'aria-hidden': 'true' });
  // Fixed markup: the brand mark's own paths.
  holder.innerHTML = '<i class="lz-mark-glow"></i><svg viewBox="0 0 89 110" focusable="false"><defs><clipPath id="lz-bar"><path d="M8 24H81L64 40H8Z"/></clipPath><linearGradient id="lz-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path class="lz-m2" d="M62 40H81L29 86H8Z" fill="#FBF8F1"/><path class="lz-m3" d="M29 70H81V86H8Z" fill="#FBF8F1"/><g clip-path="url(#lz-bar)"><path class="lz-m1" d="M8 24H81L64 40H8Z" fill="#F4B728"/><rect class="lz-m-blade" x="-4" y="18" width="1.6" height="28" fill="#fff"/><rect class="lz-m-shine" x="-30" y="20" width="24" height="24" fill="url(#lz-shine)"/></g></svg>';
  // The light along the gold is a loop of CSS: this class holds it while the Z is off screen (landing.css).
  if (!calm() && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { holder.classList.toggle('lz-off', !entries[entries.length - 1].isIntersecting); }).observe(holder);
  }
  return holder;
}

export { ticker as tickerStrip };
