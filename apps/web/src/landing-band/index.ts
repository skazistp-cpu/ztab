import { h } from '../dom.ts';
import { LANDING_SAMPLE } from '../landing-sample.ts';
import { payScreen } from '../pay.ts';
import { BAND_PAYER, demoRequest, type DemoRequest } from './demo.ts';
import { device, s, sendSheet, SCREEN_W, type Device, type Field, type Sheet } from './phone.ts';
import { S1_LINES, S2_PIECES, type Key } from './text.ts';
import './band.css';

/*
 * The wallet band: the night after the street. On the left, two sentences; on the right, a phone with Ana's real pay
 * page (the app's own render of her share, inert). One story, scrubbed by the scroll (p from 0 to 1 through the
 * pinned span):
 *   0 – 0.2    the phone rises and straightens from a slight tilt; the first sentence comes up line by line;
 *   0.2 – 0.35 a tap lands on Open in my wallet and the button presses;
 *   0.35 – 0.5 the wallet's Send sheet slides up over the page;
 *   0.5 – 0.85 To, then Amount, then Note fill in from the request, each field's outline and the matching words of the
 *              sentence lighting gold as it does;
 *   0.85 – 1   the second sentence comes in and each wallet's name lights with a small check; Review glows, calm.
 * Nothing ever says a payment was sent. The words, the sheet and its fields follow p exactly; only the phone's tilt,
 * the glass, the floor's glow and the lamps behind are smoothed. No CSS transitions: paused, nothing changes.
 *
 * Use: `mountWalletBand(host)` builds the band inside `host`, the pinned box of the band's span (it fills it:
 * position the host as the viewport-sized stage). Feed it the span's progress with `setProgress`, hold it with
 * `setPaused` (the opening's Pause motion), and remove it with `dispose`. With the system's reduce-motion setting
 * `mountWalletBand` renders the still instead; `renderWalletBandStatic` renders that still on request, as a block
 * of its own height, every word and field in its final state.
 */

export interface BandHandle {
  setProgress(p: number): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

// ── Numbers ─────────────────────────────────────────────────────────────────────────────────────────────────────

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Where p is between a and b, 0 to 1. */
const span = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const fx = (v: number, d = 3): string => v.toFixed(d);

/** A mix of two colours, as channels. */
const mixRgb = (a: number[], b: number[], t: number): number[] => a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(t)));
/** A mix of two hex colours. */
function mixHex(a: string, b: string, t: number): string {
  const c = (hex: string): number[] => [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
  return `rgb(${mixRgb(c(a), c(b), t).join(', ')})`;
}

/** The story's timing, in p. */
const AT = {
  line: { first: 0.02, step: 0.028, length: 0.095 },
  press: { down: [0.2, 0.25], up: [0.27, 0.34] },
  tap: [0.21, 0.31],
  sheet: [0.35, 0.5],
  to: [0.5, 0.6],
  amount: [0.62, 0.72],
  note: [0.74, 0.85],
  s2: [0.85, 0.885],
  review: [0.85, 0.89],
  halo: [0.88, 1],
  wallet: { first: 0.88, step: 0.03 },
} as const;

/**
 * The lamps of the night behind the band: out-of-focus discs of gold, each at its own depth (how far it moves with the
 * scroll) and softness (0 a crisp near disc, 1 a far haze); position in % of the band. Kept to the phone's side, and
 * masked under the words (band.css).
 */
interface Lamp { x: number; y: number; size: number; a: number; depth: number; soft: number; phase: number }
const LAMPS: readonly Lamp[] = [
  { x: 90, y: 10, size: 270, a: 0.05, depth: 0.3, soft: 1, phase: 0.0 },
  { x: 97, y: 44, size: 150, a: 0.08, depth: 0.55, soft: 0.9, phase: 1.1 },
  { x: 71, y: 7, size: 84, a: 0.13, depth: 0.9, soft: 0.7, phase: 2.3 },
  { x: 60, y: 20, size: 46, a: 0.19, depth: 1.3, soft: 0.5, phase: 3.1 },
  { x: 98, y: 84, size: 120, a: 0.07, depth: 0.5, soft: 0.9, phase: 4.2 },
  { x: 66, y: 86, size: 180, a: 0.055, depth: 0.4, soft: 1, phase: 5.0 },
  { x: 50, y: 95, size: 60, a: 0.12, depth: 1.0, soft: 0.6, phase: 0.7 },
  { x: 56, y: 58, size: 30, a: 0.2, depth: 1.5, soft: 0.3, phase: 4.7 },
  { x: 80, y: 34, size: 54, a: 0.14, depth: 1.1, soft: 0.6, phase: 5.6 },
  { x: 93, y: 26, size: 36, a: 0.18, depth: 1.35, soft: 0.25, phase: 0.4 },
  { x: 102, y: 64, size: 96, a: 0.15, depth: 1.6, soft: 0.12, phase: 2.0 },
  { x: 44, y: 103, size: 120, a: 0.11, depth: 1.5, soft: 0.18, phase: 3.3 },
  { x: 8, y: 96, size: 90, a: 0.05, depth: 0.45, soft: 1, phase: 1.9 },
];

// ── The DOM ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Scene {
  root: HTMLElement;
  /** The inner span of each line of the first sentence, in order. */
  lines: HTMLElement[];
  keys: Record<Key, HTMLElement>;
  s2: HTMLElement;
  wallets: HTMLElement[];
  underlines: SVGElement[];
  checks: SVGElement[];
  dev: Device;
  sheet: Sheet;
  button: HTMLElement;
  ripple: HTMLElement;
  floor: HTMLElement;
  reflect: HTMLElement;
  lamps: HTMLElement[];
  req: DemoRequest;
}

function build(host: HTMLElement, still: boolean): Scene {
  const req = demoRequest();

  // The first sentence, line by line; the words that light are spans.
  const keys = {} as Record<Key, HTMLElement>;
  const lines: HTMLElement[] = [];
  const s1 = h('h2', { class: 'wb-s1', id: 'wb-s1' });
  S1_LINES.forEach((pieces, i) => {
    const inner = h('span', { class: 'wb-li' });
    for (const piece of pieces) {
      if (piece.key) {
        const key = h('span', { class: 'wb-key', 'data-key': piece.key }, piece.t);
        keys[piece.key] = key;
        inner.append(key);
      } else if (piece.quiet) inner.append(h('span', { class: 'wb-quiet' }, piece.t));
      else inner.append(piece.t);
    }
    // The space between the lines' words, so the heading reads as the sentence it is.
    if (i < S1_LINES.length - 1) inner.append(' ');
    lines.push(inner);
    s1.append(h('span', { class: 'wb-ln' }, inner));
  });
  // The second sentence; each wallet's name a span with its check drawn beside it.
  const wallets: HTMLElement[] = [];
  const underlines: SVGElement[] = [];
  const checks: SVGElement[] = [];
  const s2 = h('p', { class: 'wb-s2' });
  for (const piece of S2_PIECES) {
    if (typeof piece === 'string') { s2.append(piece); continue; }
    // A hand-drawn line under the word (stretched to its width, its stroke kept at one width) and a small check.
    const underline = s('svg', { class: 'wb-ul', viewBox: '0 0 100 8', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      s('path', { d: 'M1 5.6C16 3.4 30 6.2 46 4.4S78 2.4 99 4.6', pathLength: '1', 'vector-effect': 'non-scaling-stroke' }));
    const check = s('svg', { class: 'wb-ck', viewBox: '0 0 12 12', 'aria-hidden': 'true' }, s('path', { d: 'M2.2 6.5l2.6 2.6 5-5.8', pathLength: '1' }));
    const wallet = h('span', { class: 'wb-wallet' }, piece.wallet, underline, check);
    wallets.push(wallet);
    underlines.push(underline);
    checks.push(check);
    // The name, its check and the punctuation after it stay on one line together.
    s2.append(h('span', { class: 'wb-wn' }, wallet, piece.after));
  }
  const words = h('div', { class: 'wb-words' }, s1, s2);

  // The phone: Ana's pay page as the app renders it, and the wallet's sheet over it.
  const page = payScreen(req.share);
  const sheet = sendSheet(req.zec);
  const label = `${BAND_PAYER}’s pay page in Ztab on a phone, on Zcash’s test network: her share of ${LANDING_SAMPLE.label} is $${req.share.fiatShare}, ${req.zec} ZEC, paying ${req.share.from}. Open in my wallet is pressed, and a wallet’s Send sheet fills in the address, the amount and the note from the request.`;
  const dev = device(label, page, sheet.el);
  const button = page.querySelector('.button.primary') as HTMLElement;
  const ripple = h('i', { class: 'wb-ripple' });
  button.append(ripple);
  const floor = h('i', { class: 'wb-floor' });
  const reflect = h('i', { class: 'wb-reflect' });
  const theatre = h('div', { class: 'wb-theatre' }, floor, reflect, dev.tilt);

  const lamps = LAMPS.map(lamp => {
    const el = h('i', { class: 'wb-lamp' });
    el.style.left = `${lamp.x}%`;
    el.style.top = `${lamp.y}%`;
    el.style.setProperty('--s', `${lamp.size}px`);
    el.style.setProperty('--a', fx(lamp.a));
    el.style.setProperty('--soft', fx(lamp.soft, 2));
    return el;
  });
  const sky = h('div', { class: 'wb-sky', 'aria-hidden': 'true' }, ...lamps);
  const stage = h('div', { class: 'wb-stage' }, words, h('div', { class: 'wb-theatre-wrap' }, theatre));
  const root = h('section', { class: `wb${still ? ' wb-static' : ''}`, 'aria-labelledby': 'wb-s1' }, sky, stage);
  host.append(root);
  return { root, lines, keys, s2, wallets, underlines, checks, dev, sheet, button, ripple, floor, reflect, lamps, req };
}

/** The page's scale: the 390-point screen made to fit the drawn screen's width (measured; set again on resize). */
function fit(sc: Scene): void {
  const w = sc.dev.screen.clientWidth;
  const hgt = sc.dev.screen.clientHeight;
  if (!w) return;
  const scale = w / SCREEN_W;
  sc.dev.fit.style.setProperty('--wb-ss', fx(scale, 5));
  sc.dev.fit.style.height = `${(hgt / scale).toFixed(2)}px`;
}

// ── The story (follows p exactly) ───────────────────────────────────────────────────────────────────────────────

interface Memo { typed: number[]; digits: string[]; unit: string }

/** Types `text` into a field as far as t says (0 to 1), with a caret while it is being typed. */
function typeInto(field: Field, text: string, t: number, memo: Memo, slot: number): void {
  const n = Math.round(t * text.length);
  if (n !== memo.typed[slot]) {
    memo.typed[slot] = n;
    field.value.textContent = text.slice(0, n);
  }
  field.caret.style.opacity = t > 0 && t < 1 ? '1' : '0';
}

/** The amount's digits roll like a counter and settle one by one, left to right, as t goes 0 to 1. */
function rollDigits(sheet: Sheet, zec: string, t: number, memo: Memo): void {
  const n = sheet.digits.length;
  sheet.digits.forEach((el, i) => {
    const want = zec[i];
    if (want === '.') {
      const ch = t > 0 ? '.' : '';
      if (ch !== memo.digits[i]) { memo.digits[i] = ch; el.textContent = ch; }
      return;
    }
    const settle = (i + 1) / n;
    let ch = '';
    let rolling = false;
    if (t > 0 && t >= settle) ch = want;
    else if (t > 0) {
      rolling = true;
      const k = Math.floor((settle - t) * 80);
      ch = String((Number(want) + 3 + k * 7 + i * 3) % 10);
    }
    if (ch !== memo.digits[i]) { memo.digits[i] = ch; el.textContent = ch; }
    el.style.opacity = rolling ? '0.42' : '1';
    el.style.transform = rolling ? `translate3d(0, ${fx((((settle - t) * 80) % 1) * 36 - 18, 1)}%, 0)` : 'none';
  });
  const unit = t > 0 ? ' ZEC' : '';
  if (unit !== memo.unit) { memo.unit = unit; sheet.unit.textContent = unit; }
  sheet.unit.style.opacity = fx(span(t, 0, 0.12));
}

/** A field filling in over [a, b]: its outline glows while it does and stays lit after; its words in the sentence light. */
function fillField(sc: Scene, field: Field, key: Key, a: number, b: number, p: number): number {
  const glow = Math.min(easeOut(span(p, a - 0.006, a + 0.018)), 1 - easeInOut(span(p, b, b + 0.05)));
  const done = easeOut(span(p, b - 0.015, b + 0.02));
  field.el.style.setProperty('--g', fx(glow));
  field.el.style.setProperty('--f', fx(done));
  const lit = easeOut(span(p, a, a + 0.045));
  sc.keys[key].style.setProperty('--k', fx(lit));
  sc.keys[key].classList.toggle('lit', lit >= 0.999);
  return span(p, a, b);
}

function story(sc: Scene, p: number, memo: Memo): void {
  // The first sentence: each line comes up through its mask.
  sc.lines.forEach((line, i) => {
    const start = AT.line.first + i * AT.line.step;
    const t = easeOut(span(p, start, start + AT.line.length));
    line.style.transform = `translate3d(0, ${fx((1 - t) * 110, 2)}%, 0)`;
    line.style.opacity = fx(Math.min(1, t * 1.6));
  });

  // The tap: the button presses as a soft bloom spreads in it.
  const down = easeOut(span(p, AT.press.down[0], AT.press.down[1]));
  const up = easeOut(span(p, AT.press.up[0], AT.press.up[1]));
  sc.button.style.setProperty('--press', fx(1 - 0.045 * (down - up), 4));
  sc.button.style.backgroundColor = mixHex('#f4b728', '#d99f1a', down - up);
  const tap = span(p, AT.tap[0], AT.tap[1]);
  sc.ripple.style.setProperty('--rs', fx(0.25 + 6.5 * easeOut(tap)));
  sc.ripple.style.setProperty('--ro', fx(tap > 0 && tap < 1 ? (1 - tap) * 0.75 : 0));

  // The sheet comes up; the page behind recedes, as a sheet is presented.
  const sheet = easeOutExpo(span(p, AT.sheet[0], AT.sheet[1]));
  sc.sheet.el.style.transform = `translate3d(0, ${fx((1 - sheet) * 100, 2)}%, 0)`;
  sc.dev.back.style.transform = `translate3d(0, ${fx(sheet * 8, 1)}px, 0) scale(${fx(1 - 0.05 * sheet, 4)})`;
  sc.dev.back.style.borderRadius = `${fx(26 * sheet, 1)}px`;
  sc.dev.dim.style.opacity = fx(0.5 * sheet);
  const halo = easeInOut(span(p, AT.halo[0], AT.halo[1]));
  sc.reflect.style.setProperty('--wb-rc', `rgba(${mixRgb([250, 244, 232], [226, 230, 236], sheet).join(', ')}, ${fx(0.3 - 0.12 * sheet + 0.1 * halo, 3)})`);
  sc.reflect.style.setProperty('--wb-rg', fx(0.35 * halo));

  // The fields, one by one: To, Amount, Note.
  typeInto(sc.sheet.to, sc.req.addressShort, fillField(sc, sc.sheet.to, 'address', AT.to[0], AT.to[1], p), memo, 0);
  rollDigits(sc.sheet, sc.req.zec, fillField(sc, sc.sheet.amount, 'amount', AT.amount[0], AT.amount[1], p), memo);
  typeInto(sc.sheet.note, sc.req.note, fillField(sc, sc.sheet.note, 'note', AT.note[0], AT.note[1], p), memo, 1);

  // Review is ready, and glows, calm.
  sc.sheet.review.style.setProperty('--r', fx(easeOut(span(p, AT.review[0], AT.review[1]))));
  sc.sheet.review.style.setProperty('--h', fx(halo));

  // The second sentence, and each wallet's name in turn.
  const s2 = easeOut(span(p, AT.s2[0], AT.s2[1]));
  sc.s2.style.opacity = fx(s2);
  sc.s2.style.transform = `translate3d(0, ${fx((1 - s2) * 14, 1)}px, 0)`;
  sc.wallets.forEach((wallet, i) => {
    const start = AT.wallet.first + i * AT.wallet.step;
    const t = span(p, start, start + AT.wallet.step);
    const lit = easeOut(clamp01(t * 1.6));
    wallet.style.setProperty('--k', fx(lit));
    wallet.classList.toggle('lit', t >= 1);
    sc.underlines[i].style.setProperty('--d', fx(1 - easeOut(span(t, 0, 0.75))));
    sc.checks[i].style.setProperty('--d', fx(1 - easeOut(span(t, 0.55, 1))));
  });
}

// ── What is smoothed: the phone's tilt, the glass, the floor's glow and the lamps ────────────────────────────────

function decor(sc: Scene, e: number, clock: number): void {
  const t = easeOut(span(e, 0, 0.22));
  // Standing, the phone breathes: a hair up and down (held with the clock when paused).
  const breath = Math.sin(clock * 0.0011) * 2.5 * t;
  sc.dev.tilt.style.transform =
    `perspective(1400px) translate3d(0, ${fx(84 * (1 - t) + breath, 1)}px, 0) rotateX(${fx(13 * (1 - t), 2)}deg) rotateY(${fx(-15 * (1 - t), 2)}deg) scale(${fx(0.94 + 0.06 * t, 4)})`;
  sc.dev.glass.style.transform = `translate3d(${fx(-24 * (1 - t), 2)}%, 0, 0)`;
  sc.floor.style.opacity = fx(0.15 + 0.85 * t);
  sc.reflect.style.opacity = fx(t);
  LAMPS.forEach((lamp, i) => {
    const ph = clock * 0.00011 * (0.6 + lamp.depth * 0.5) + lamp.phase;
    const dx = Math.sin(ph) * 16 * lamp.depth;
    const dy = Math.cos(ph * 0.83 + 1) * 11 * lamp.depth - (e - 0.5) * 120 * lamp.depth;
    sc.lamps[i].style.transform = `translate3d(${fx(dx, 1)}px, ${fx(dy, 1)}px, 0)`;
  });
}

const newMemo = (): Memo => ({ typed: [-1, -1], digits: [], unit: '' });

// ── The API ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The band's still: every line, field and name in its final state, nothing moving, as a block of its own height. */
export function renderWalletBandStatic(host: HTMLElement): void {
  const sc = build(host, true);
  fit(sc);
  story(sc, 1, newMemo());
  decor(sc, 1, 0);
  if ('ResizeObserver' in window) new ResizeObserver(() => fit(sc)).observe(sc.dev.screen);
  else requestAnimationFrame(() => fit(sc));
}

/** The band, scrubbed: builds it inside `host` and returns its controls. With reduced motion it is the still. */
export function mountWalletBand(host: HTMLElement): BandHandle {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderWalletBandStatic(host);
    return { setProgress() {}, setPaused() {}, dispose() { host.querySelector('.wb')?.remove(); } };
  }
  const sc = build(host, false);
  const memo = newMemo();
  let target = 0;
  let eased = 0;
  let primed = false;
  let clock = 0;
  let last = 0;
  let raf = 0;
  let paused = false;
  let seen = true;
  let gone = false;

  const running = (): boolean => !paused && seen && !gone && !document.hidden;
  const frame = (now: number): void => {
    raf = 0;
    const dt = last ? Math.min(50, now - last) : 16.7;
    last = now;
    clock += dt;
    // A critically damped follow, frame-rate independent: 16% of the way each 60 fps frame.
    const step = 1 - Math.pow(0.84, dt / 16.7);
    eased += (target - eased) * step;
    if (Math.abs(target - eased) < 0.0004) eased = target;
    decor(sc, eased, clock);
    if (running()) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const nudge = (): void => {
    if (!raf && running()) raf = requestAnimationFrame(frame);
  };
  const halt = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  fit(sc);
  story(sc, 0, memo);
  decor(sc, 0, 0);

  const resize = 'ResizeObserver' in window ? new ResizeObserver(() => fit(sc)) : undefined;
  resize?.observe(sc.dev.screen);
  if (!resize) requestAnimationFrame(() => fit(sc));
  // Off the screen, or with the page hidden, the lamps rest and nothing eases; only its own host is watched.
  const watch = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => { seen = entries[entries.length - 1].isIntersecting; if (seen) nudge(); else halt(); }, { threshold: 0 })
    : undefined;
  watch?.observe(host);
  const visibility = (): void => { if (document.hidden) halt(); else nudge(); };
  document.addEventListener('visibilitychange', visibility);

  return {
    setProgress(p: number): void {
      if (gone) return;
      target = clamp01(Number.isFinite(p) ? p : 0);
      if (!primed) { primed = true; eased = target; }
      story(sc, target, memo);
      if (paused || !seen) {
        // Held, or unseen: the decoration stands exactly where the scroll is, nothing catching up later.
        eased = target;
        decor(sc, eased, clock);
      } else nudge();
    },
    setPaused(hold: boolean): void {
      if (gone || hold === paused) return;
      paused = hold;
      if (hold) {
        halt();
        eased = target;
        decor(sc, eased, clock);
      } else nudge();
    },
    dispose(): void {
      gone = true;
      halt();
      resize?.disconnect();
      watch?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      sc.root.remove();
    },
  };
}
