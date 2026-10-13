import { h } from './dom.ts';
import { LANDING_SAMPLE } from './landing-sample.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';
import { TICKER, tickerLine } from './landing-ticker.ts';
import { pieceLengths } from './cut/shares.ts';

/*
 * The opening's first screen and its last band.
 *
 * The first screen: a ticker of example splits, the headline, the way in, and a centrepiece: a phone showing the
 * app's own screens one after another, with the app's cards floating around it. Every few seconds the bill's
 * $300.00 is cut into the six shares and the pieces fly to the friends' cards, which then show their links.
 * Everything moves with transform and opacity; with reduced motion it is one composed still.
 */

const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const SPRING = 'cubic-bezier(0.3, 1.36, 0.55, 1)';
/** One loop of the centrepiece: five screens of 1.6 s, and one cut of the bill. */
const LOOP = 8000;
const SCREENS = ['bill', 'people', 'rate', 'links', 'pay'] as const;

const price = (amount: string): HTMLElement => h('span', { class: 'lz-price' }, h('span', { class: 'lz-cur' }, '$'), amount);
const shortLink = (link: string): string => link.replace(/….*$/, '…');

/** A friend's card, as the links page draws it (example values). Its amount and link arrive with the cut. */
function friendCard(i: number): HTMLElement {
  const share = LANDING_SAMPLE.shares[i];
  const fixed = share.name in LANDING_SAMPLE.fixed;
  return h(
    'div',
    { class: 'lz-card lz-friend' },
    h('i', { class: 'lz-rail' }),
    h('b', { class: 'lz-name' }, share.name),
    h('span', { class: 'lz-label' }, fixed ? 'Fixed amount' : 'Share of the rest'),
    h('span', { class: 'lz-amount' }, price(share.fiatShare)),
    h('span', { class: 'lz-chip' }, shortLink(share.link)),
  );
}

/** The bill: its total printed on a gold ribbon, which the cut divides. */
function billCard(): HTMLElement {
  return h(
    'div',
    { class: 'lz-card lz-bill' },
    h('b', { class: 'lz-name' }, LANDING_SAMPLE.label),
    h('span', { class: 'lz-label' }, 'Total'),
    h('span', { class: 'lz-ribbon' }, h('i', { class: 'lz-band' }), h('span', { class: 'lz-total' }, price(LANDING_SAMPLE.total))),
  );
}

/** A table code card with a drawing that looks like a QR code and is not one: it never decodes. */
function tableCard(): HTMLElement {
  const holder = h('span', { class: 'lz-qr' });
  // Fixed markup built here from a fixed seed; no text from anyone reaches it.
  holder.innerHTML = `<svg viewBox="-2 -2 25 25" aria-hidden="true" focusable="false"><rect x="-2" y="-2" width="25" height="25" rx="2" fill="#fff"/><path d="${decoyCode(0x5eed2a)}" fill="#101216"/></svg>`;
  return h('div', { class: 'lz-card lz-table' }, h('b', { class: 'lz-name' }, LANDING_SAMPLE.label), holder);
}

/** A pattern of 21 × 21 modules that looks like a QR code: a fixed seed fills the data area, so it never decodes. */
export function decoyCode(seed: number): string {
  const size = 21;
  let state = seed >>> 0 || 1;
  const next = (): number => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  const finder = (x: number, y: number): boolean | undefined => {
    for (const [fx, fy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      const dx = x - fx, dy = y - fy;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx === -1 || dy === -1 || dx === 7 || dy === 7) return false;
        return Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2;
      }
    }
    return undefined;
  };
  let path = '';
  for (let y = 0; y < size; y++) {
    let run = 0;
    for (let x = 0; x <= size; x++) {
      const dark = x < size && (finder(x, y) ?? (y === 6 || x === 6 ? (x + y) % 2 === 0 : next() < 0.48));
      if (dark) run++;
      else if (run > 0) { path += `M${x - run} ${y}h${run}v1h-${run}z`; run = 0; }
    }
  }
  return path;
}

/** The ticker: example splits, the strip twice so it can run on without a seam. */
export function ticker(): HTMLElement {
  const items = (): HTMLElement[] => TICKER.map(item => h('span', { class: 'lz-tick' }, tickerLine(item)));
  const track = h('div', { class: 'lz-track' }, h('div', { class: 'lz-run' }, ...items()), h('div', { class: 'lz-run', 'aria-hidden': 'true' }, ...items()));
  return h('div', { class: 'lz-ticker' }, track);
}

interface Place { x: number; y: number; d: number; phone?: boolean }
/** Where each card floats, from the phone's centre (px at desktop size), and how near it is (0 far … 1 near). */
const PLACES: Record<string, Place> = {
  bill: { x: -360, y: -150, d: 1 },
  table: { x: -470, y: 110, d: 0.45 },
  Ana: { x: 336, y: -200, d: 0.9 },
  Dragan: { x: 452, y: -40, d: 0.6 },
  Tomás: { x: 322, y: 118, d: 0.95 },
  Priya: { x: -300, y: 210, d: 0.75 },
  Jonas: { x: 476, y: 268, d: 0.55 },
};
const PHONE_PLACES: Record<string, Place> = {
  bill: { x: -84, y: -214, d: 1 },
  Ana: { x: 96, y: -36, d: 0.9 },
  Jonas: { x: -92, y: 150, d: 0.95 },
};

export function centrepiece(): HTMLElement {
  const stage = h('div', { class: 'lz-stage', 'aria-hidden': 'true' });
  const phone = h('div', { class: 'lz-phone' });
  const screen = h('div', { class: 'lz-screen' });
  // The first screen is the one index.html asks for before any script (the small file on a phone).
  const small = matchMedia('(max-width: 759px)').matches;
  const shots = SCREENS.map((name, i) => {
    const file = i === 0 && small ? 'screen-bill-sm' : `screen-${name}`;
    const img = h('img', { class: 'lz-shot', alt: '', width: '540', height: '1170', decoding: 'async', 'data-src': `/landing/${file}.webp`, draggable: 'false' }) as HTMLImageElement;
    if (i === 0) { img.classList.add('first'); img.setAttribute('fetchpriority', 'high'); img.decoding = 'sync'; img.src = `/landing/${file}.webp`; }
    return img;
  });
  screen.append(...shots);
  phone.append(h('i', { class: 'lz-island' }), screen);
  const phoneFloat = h('div', { class: 'lz-float lz-f0' }, phone);
  const phoneLayer = h('div', { class: 'lz-layer lz-phone-layer', 'data-depth': '0.35' }, phoneFloat);

  const cards: Record<string, HTMLElement> = { bill: billCard(), table: tableCard() };
  LANDING_SAMPLE.shares.forEach((share, i) => { if (!share.own) cards[share.name] = friendCard(i); });
  const layers = Object.entries(cards).map(([key, card], k) =>
    h('div', { class: `lz-layer lz-at-${key === 'Tomás' ? 'Tomas' : key}`, 'data-key': key }, h('div', { class: `lz-float lz-f${(k % 4) + 1}` }, card)));
  // The pieces that fly from the bill to the friends' cards, as long as their shares.
  const friends = LANDING_SAMPLE.shares.filter(s => !s.own);
  const lengths = pieceLengths(1);
  const flyers = friends.map(share => h('i', { class: 'lz-fly', 'data-to': share.name, style: `--w:${(lengths[LANDING_SAMPLE.shares.indexOf(share)] * 300).toFixed(1)}` }));
  const cuts = [1, 2, 3, 4].map(() => h('i', { class: 'lz-cutline' }));
  // The orbit: the six currencies Ztab splits in, on a thin gold ellipse that passes behind and in front of the phone.
  const orbit = h('div', { class: 'lz-orbit' });
  // Fixed markup: the ellipse.
  orbit.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><ellipse cx="50" cy="50" rx="49.6" ry="49.2" fill="none" stroke="#F4B728" stroke-opacity="0.55" stroke-width="1.1" vector-effect="non-scaling-stroke"/></svg>';
  const coins = ['$', '€', '£', 'Kč', 'zł', 'CHF'].map(sign => h('i', { class: `lz-coin${sign.length > 2 ? ' wide' : ''}` }, sign));
  stage.append(orbit, ...layers.filter((_, k) => k < 2), phoneLayer, ...layers.filter((_, k) => k >= 2), ...coins, ...flyers);
  cards.bill.querySelector('.lz-ribbon')?.append(...cuts);

  let narrow = false;
  let orx = 360, ory = 125;
  const TILT = (-8 * Math.PI) / 180;
  /** Puts every coin where it is at time t (seconds): a turn takes a minute; in front of the phone on the near half. */
  const orbitAt = (t: number): void => {
    coins.forEach((coin, k) => {
      const a = (t / 60) * Math.PI * 2 + (k * Math.PI * 2) / coins.length;
      const x0 = orx * Math.cos(a), y0 = ory * Math.sin(a);
      const x = x0 * Math.cos(TILT) - y0 * Math.sin(TILT), y = x0 * Math.sin(TILT) + y0 * Math.cos(TILT);
      const near = (Math.sin(a) + 1) / 2;
      coin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(0.78 + 0.3 * near).toFixed(3)})`;
      coin.style.opacity = (0.55 + 0.45 * near).toFixed(3);
      const z = Math.sin(a) > 0 ? '9' : '1';
      if (coin.style.zIndex !== z) coin.style.zIndex = z;
    });
  };
  // The orbit's clock stands still while the motion is paused, so playing carries on from where it stopped.
  let heldAt = 0, skew = 0;
  const clock = (): number => ((motionPaused() ? heldAt : performance.now()) - skew) / 1000;
  const placeAll = (): void => {
    narrow = stage.clientWidth < 700;
    orx = narrow ? 168 : 372; ory = narrow ? 62 : 128;
    orbit.style.setProperty('--orx', `${orx * 2}px`);
    orbit.style.setProperty('--ory', `${ory * 2}px`);
    orbitAt(calm() ? 7 : clock());
    const places = narrow ? PHONE_PLACES : PLACES;
    for (const layer of layers) {
      const key = layer.dataset.key ?? '';
      const p = places[key];
      layer.hidden = !p;
      if (!p) continue;
      layer.style.setProperty('--x', `${p.x}px`);
      layer.style.setProperty('--y', `${p.y}px`);
      layer.style.setProperty('--s', String((narrow ? 0.62 : 0.9) + (narrow ? 0.06 : 0.1) * p.d));
      layer.style.zIndex = String(Math.round(p.d * 10));
      layer.dataset.depth = String(p.d);
    }
  };

  // Screens load after the first paint, the first one at once, the others when the browser is idle.
  const load = (img: HTMLImageElement): void => { if (!img.src && img.dataset.src) img.src = img.dataset.src; };

  const running: Animation[] = [];
  const screens: Animation[] = [];
  const at = (ms: number): number => ms / LOOP;
  // The phone: each screen slides in from the right, holds, and gives way to the next (once all of them are in).
  const cycle = (): void => {
    for (const a of screens.splice(0)) a.cancel();
    if (calm()) return;
    shots.forEach((img, i) => {
      const t0 = i * 1600, enter = 420;
      const before = (o: number, easing?: string): Keyframe => ({ offset: o, transform: 'translateX(100%)', opacity: 1, ...(easing ? { easing } : {}) });
      const shown = (o: number, easing?: string): Keyframe => ({ offset: o, transform: 'translateX(0)', opacity: 1, ...(easing ? { easing } : {}) });
      const gone = (o: number): Keyframe => ({ offset: o, transform: 'translateX(-32%)', opacity: 0 });
      const frames: Keyframe[] = i === SCREENS.length - 1
        // The last screen leaves at the start of the next loop, as the first comes in.
        ? [shown(0, EASE), gone(at(enter)), gone(at(t0 - 1)), before(at(t0), EASE), shown(at(t0 + enter)), shown(1)]
        : [before(0, i === 0 ? EASE : undefined), ...(i ? [before(at(t0), EASE)] : []), shown(at(t0 + enter)), shown(at(t0 + 1600), EASE), gone(at(t0 + 1600 + enter)), gone(1)];
      screens.push(img.animate(frames, { duration: LOOP, iterations: Infinity }));
    });
    for (const a of screens) a.currentTime = 600;
    if (motionPaused()) for (const a of screens) a.pause();
  };
  const play = (): void => {
    for (const a of running.splice(0)) a.cancel();
    if (calm()) return;
    // The cut: the bill's ribbon is cut four times, five pieces fly to the friends, each card shows its share, then its link.
    const ribbon = cards.bill.querySelector<HTMLElement>('.lz-ribbon');
    const band = cards.bill.querySelector<HTMLElement>('.lz-band');
    if (!ribbon || !band) return;
    const sr = stage.getBoundingClientRect();
    const rr = ribbon.getBoundingClientRect();
    const CUT = 700, FLY = 720, HOLD = 7000;
    cuts.forEach((cut, k) => {
      running.push(cut.animate(
        [{ offset: 0, opacity: 0 }, { offset: at(CUT + 30 * k), opacity: 0 }, { offset: at(CUT + 30 * k + 60), opacity: 1 }, { offset: at(CUT + 30 * k + 220), opacity: 0 }, { offset: 1, opacity: 0 }],
        { duration: LOOP, iterations: Infinity },
      ));
    });
    running.push(band.animate(
      [{ offset: 0, opacity: 1 }, { offset: at(CUT + 200), opacity: 1 }, { offset: at(CUT + 420), opacity: 0.62 }, { offset: at(HOLD - 600), opacity: 0.62 }, { offset: at(HOLD - 200), opacity: 1 }, { offset: 1, opacity: 1 }],
      { duration: LOOP, iterations: Infinity },
    ));
    let run = 0;
    const total = friends.reduce((a, s) => a + Number(s.fiatShare), 0);
    flyers.forEach((fly, k) => {
      const share = friends[k];
      const card = cards[share.name];
      const layer = card?.closest<HTMLElement>('.lz-layer');
      if (!card || !layer || layer.hidden) { fly.hidden = true; return; }
      fly.hidden = false;
      const amount = card.querySelector<HTMLElement>('.lz-amount')!;
      const chip = card.querySelector<HTMLElement>('.lz-chip')!;
      const ar = amount.getBoundingClientRect();
      const frac = Number(share.fiatShare) / total;
      const sx = rr.left - sr.left + rr.width * (run + frac / 2);
      run += frac;
      const sy = rr.top - sr.top + rr.height / 2;
      const tx = ar.left - sr.left + 34, ty = ar.top - sr.top + ar.height / 2;
      const mx = (sx + tx) / 2, my = Math.min(sy, ty) - 70 - 30 * (k % 2);
      const start = CUT + 260 + 70 * k, land = start + FLY;
      fly.style.left = `${sx}px`;
      fly.style.top = `${sy}px`;
      const p = (x: number, y: number, s: number): string => `translate(${(x - sx).toFixed(1)}px, ${(y - sy).toFixed(1)}px) scale(${s})`;
      running.push(fly.animate(
        [
          { offset: 0, opacity: 0, transform: p(sx, sy, 1) },
          { offset: at(start), opacity: 0, transform: p(sx, sy, 1) },
          { offset: at(start + 40), opacity: 1, transform: p(sx, sy, 1), easing: 'cubic-bezier(0.45, 0, 0.3, 1)' },
          { offset: at(start + FLY * 0.5), opacity: 1, transform: p(mx, my, 0.92), easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
          { offset: at(land), opacity: 1, transform: p(tx, ty, 0.7) },
          { offset: at(land + 160), opacity: 0, transform: p(tx, ty, 0.6) },
          { offset: 1, opacity: 0, transform: p(tx, ty, 0.6) },
        ],
        { duration: LOOP, iterations: Infinity },
      ));
      running.push(amount.animate(
        [
          { offset: 0, opacity: 0, transform: 'scale(0.9)' },
          { offset: at(land - 40), opacity: 0, transform: 'scale(0.9)', easing: SPRING },
          { offset: at(land + 260), opacity: 1, transform: 'scale(1)' },
          { offset: at(HOLD + 40 * k), opacity: 1, transform: 'scale(1)', easing: 'ease-in' },
          { offset: at(HOLD + 300 + 40 * k), opacity: 0, transform: 'scale(0.96)' },
          { offset: 1, opacity: 0, transform: 'scale(0.9)' },
        ],
        { duration: LOOP, iterations: Infinity },
      ));
      running.push(chip.animate(
        [
          { offset: 0, opacity: 0, transform: 'translateY(6px)' },
          { offset: at(land + 220), opacity: 0, transform: 'translateY(6px)', easing: EASE },
          { offset: at(land + 560), opacity: 1, transform: 'translateY(0)' },
          { offset: at(HOLD - 40 + 40 * k), opacity: 1, transform: 'translateY(0)', easing: 'ease-in' },
          { offset: at(HOLD + 260 + 40 * k), opacity: 0, transform: 'translateY(4px)' },
          { offset: 1, opacity: 0, transform: 'translateY(6px)' },
        ],
        { duration: LOOP, iterations: Infinity },
      ));
    });
    if (motionPaused()) for (const a of running) a.pause();
  };

  const startAt = (ms: number): void => { for (const a of running) a.currentTime = ms; };

  // Depth: layers drift with the pointer (desktop) and with the scroll, nearer cards more; on a spring.
  let px = 0, py = 0, tx = 0, ty = 0, vx = 0, vy = 0, raf = 0, last = 0, seen = false;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const all = [phoneLayer, ...layers];
  const tick = (now: number): void => {
    const dt = Math.min(0.032, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    vx += (120 * (tx - px) - 16 * vx) * dt; px += vx * dt;
    vy += (120 * (ty - py) - 16 * vy) * dt; py += vy * dt;
    // (the loop keeps running while the stage is in view: the orbit never stops)
    const r = stage.getBoundingClientRect();
    const scroll = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    for (const layer of all) {
      const d = Number(layer.dataset.depth ?? 0.5);
      layer.style.setProperty('--px', `${(px * 16 * d).toFixed(2)}px`);
      layer.style.setProperty('--py', `${(py * 12 * d - scroll * 28 * d).toFixed(2)}px`);
    }
    if (!calm()) orbitAt((now - skew) / 1000);
    raf = seen && !motionPaused() ? requestAnimationFrame(tick) : 0;
  };
  const kick = (): void => { if (!raf && seen && !motionPaused()) { last = 0; raf = requestAnimationFrame(tick); } };

  const begin = (): void => {
    if (!stage.isConnected) { requestAnimationFrame(begin); return; }
    placeAll();
    // The first screen loads now; the rest wait for an idle moment after the first paint.
    // With reduced motion the phone keeps its first screen and the cards are already filled.
    if (calm()) return;
    // The other screens come after the page has loaded and settled; the phone starts turning once they are all in.
    const rest = (): void => {
      shots.forEach(load);
      void Promise.all(shots.map(img => img.decode().catch(() => undefined))).then(() => { if (stage.isConnected) cycle(); });
    };
    if (document.readyState === 'complete') setTimeout(rest, 1400);
    else addEventListener('load', () => setTimeout(rest, 1400), { once: true });
    // On arrival the cards come out from behind the phone to their places, one after another.
    const places = narrow ? PHONE_PLACES : PLACES;
    layers.filter(l => !l.hidden).forEach((layer, k) => {
      const p = places[layer.dataset.key ?? ''];
      const card = layer.querySelector<HTMLElement>('.lz-card');
      if (!p || !card) return;
      card.animate(
        [{ opacity: 0, transform: `translate(${(-p.x * 0.55).toFixed(1)}px, ${(-p.y * 0.55).toFixed(1)}px) scale(0.86)` }, { opacity: 1, transform: 'none' }],
        { duration: 760, delay: 120 + 70 * k, easing: SPRING, fill: 'backwards' },
      );
    });
    requestAnimationFrame(() => requestAnimationFrame(() => { play(); startAt(500); }));
    new IntersectionObserver(entries => {
      seen = entries.some(e => e.isIntersecting);
      for (const a of [...running, ...screens]) { if (seen && !motionPaused()) a.play(); else a.pause(); }
      // The floating cards are a loop of CSS: this class holds them while the stage is off screen (landing.css).
      stage.classList.toggle('lz-off', !seen);
      kick();
    }).observe(stage);
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      kick();
    }, { passive: true });
    addEventListener('scroll', kick, { passive: true });
    // Pause motion: the loops hold where they are and the depth stops following the pointer and the scroll; playing
    // carries on from the same place.
    onMotionPause(paused => {
      const loops = [...running, ...screens];
      if (paused) {
        cancelAnimationFrame(raf);
        raf = 0;
        heldAt = performance.now();
        for (const a of loops) a.pause();
      } else {
        skew += performance.now() - heldAt;
        if (seen) for (const a of loops) a.play();
        kick();
      }
    });
    let width = stage.clientWidth;
    new ResizeObserver(() => requestAnimationFrame(() => {
      if (stage.clientWidth === width) return;
      width = stage.clientWidth;
      placeAll();
      play();
      startAt(500);
      if (screens.length) cycle();
    })).observe(stage);
  };
  begin();
  return stage;
}

/** The Cut-ribbon Z, drawn large for the last band: its parts come together once, then light runs along the gold. */
export function bigMark(): HTMLElement {
  const holder = h('span', { class: 'lz-mark', 'aria-hidden': 'true' });
  // Fixed markup: the brand mark's own paths.
  holder.innerHTML = '<svg viewBox="0 0 89 110" focusable="false"><defs><clipPath id="lz-bar"><path d="M8 24H81L64 40H8Z"/></clipPath><linearGradient id="lz-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path class="lz-m1" d="M8 24H81L64 40H8Z" fill="#F4B728"/><path class="lz-m2" d="M62 40H81L29 86H8Z" fill="#FBF8F1"/><path class="lz-m3" d="M29 70H81V86H8Z" fill="#FBF8F1"/><g clip-path="url(#lz-bar)"><rect class="lz-m-shine" x="-30" y="20" width="24" height="24" fill="url(#lz-shine)"/></g></svg>';
  // The light along the gold is a loop of CSS: this class holds it while the Z is off screen (landing.css).
  if (!calm() && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { holder.classList.toggle('lz-off', !entries[entries.length - 1].isIntersecting); }).observe(holder);
  }
  return holder;
}

export { SCREENS, ticker as tickerStrip };
