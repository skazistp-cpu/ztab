import { h } from './dom.ts';
import { formatFiat } from './money.ts';
import { LANDING_SAMPLE } from './landing-sample.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';
import { makeTab } from './tab.ts';
import { calm, instant, maskReveal, rise } from './landing-kit.ts';
import { onSpeed, scrub } from './landing-scroll.ts';
import './landing-sections.css';

/*
 * The opening's sections after settling up:
 *  - a band of night where a phone plays a recording of Ana's pay page, and two lines light in turn as the band is
 *    scrolled through (the screen is held while they do);
 *  - the ring: twelve friends' link cards from three tabs, turning;
 *  - the counts: four figures that count up once.
 * Motion is transform and opacity only. With reduced motion the band does not hold the screen, every line is lit,
 * the recording is its still, the ring is a still arc and the figures are there at once.
 */

/** The sentences of these sections, word for word as approved. */
export const SECTION_SENTENCES = {
  fills: 'A wallet that reads the request fills in the address and the amount, and the note if it supports one.',
  tried: 'We have tried the requests in Zodl, Zingo, YWallet and Zkool.',
} as const;

// ── The band of night: a product theatre ─────────────────────────────────────────────────────────────────────────

/**
 * Ana's pay page, recorded on the app at 390 × 844 from a tab made there (Zcash's test network, a typed rate): the
 * request, then "Which wallet?", then the code, and back to the top, a 7 s loop. In the recording the page's QR code is
 * swapped for a drawn pattern that holds nothing. Fetched only when the band is near; played only while it is on screen.
 */
const RECORDING = { webm: '/landing/sections-pay.webm', mp4: '/landing/sections-pay.mp4', poster: '/landing/sections-pay-poster.webp' };

/** The wallets of the approved sentence, as words: no logos. */
const WALLETS = ['Zodl', 'Zingo', 'YWallet', 'Zkool'] as const;

const NS = 'http://www.w3.org/2000/svg';
const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const span = (u: number, a: number, b: number): number => clamp((u - a) / (b - a));
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The band of night, a product theatre: the phone with the recording of the pay page stands on a faint gold grid in a
 * soft gold light, tilted back as the band comes up the screen and straightening as it arrives; the band then holds
 * the screen while its two lines light in turn, and a piece of gold leaves the phone's request for each wallet named
 * in the second line, lighting its name as it gets there (all scrubbed by the scroll). With reduced motion it is a
 * still: the phone straight, both lines and every name lit.
 */
export function band(): HTMLElement {
  const video = h('video', { class: 'ls-video', muted: '', playsinline: '', loop: '', preload: 'none', disablepictureinpicture: '', disableremoteplayback: '', 'aria-hidden': 'true' }) as HTMLVideoElement;
  video.muted = true;
  // A scan line sweeps the screen as each piece of gold leaves the phone (scrubbed with the story).
  const scan = h('i', { class: 'ls-scan' });
  const screen = h('div', { class: 'ls-screen' }, video, scan, h('i', { class: 'ls-island' }), h('i', { class: 'ls-glare' }));
  const phone = h(
    'div',
    {
      class: 'ls-phone',
      role: 'img',
      'aria-label': `A recording of ${LANDING_SAMPLE.shares[1].name}’s pay page in Ztab on a phone, on Zcash’s test network: her share of ${LANDING_SAMPLE.label} is $${LANDING_SAMPLE.shares[1].fiatShare}, for ${LANDING_SAMPLE.organiser}. The page moves on to the wallets we have tried and to the code to scan, which in this recording holds nothing.`,
    },
    h('div', { class: 'ls-bezel', 'aria-hidden': 'true' }, screen),
  );
  // The two approved lines: the first is the band's heading.
  const lines = [h('h2', { class: 'ls-line', id: 'ls-band-title' }, SECTION_SENTENCES.fills), h('p', { class: 'ls-line' }, SECTION_SENTENCES.tried)];
  lines.forEach(maskReveal);
  // The wallets' names on an arc beside the phone (they repeat the second line's words: hidden from a screen reader).
  const check = (): SVGSVGElement => {
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('class', 'ls-chip-check');
    el.setAttribute('viewBox', '0 0 12 12');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M2.4 6.3l2.4 2.4 4.8-5.2');
    path.setAttribute('pathLength', '1');
    el.append(path);
    return el;
  };
  const chips = WALLETS.map((name, i) => h('span', { class: `ls-wallet-chip ls-w${i}` }, h('span', { class: 'ls-chip-mark' }, h('i', { class: 'ls-chip-dot' }), check()), name));
  const paths = WALLETS.map(() => document.createElementNS(NS, 'path'));
  paths.forEach(path => { path.setAttribute('class', 'ls-wire'); path.setAttribute('pathLength', '1'); });
  const packet = document.createElementNS(NS, 'polygon');
  packet.setAttribute('class', 'ls-packet');
  packet.setAttribute('points', '-9,-4 4,-4 9,4 -4,4');
  const wires = document.createElementNS(NS, 'svg');
  wires.setAttribute('class', 'ls-wires');
  wires.setAttribute('aria-hidden', 'true');
  wires.append(...paths, packet);
  const tilt = h('div', { class: 'ls-tilt' }, phone);
  const theatre = h(
    'div',
    { class: 'ls-theatre' },
    h('i', { class: 'ls-floor', 'aria-hidden': 'true' }),
    h('i', { class: 'ls-underglow', 'aria-hidden': 'true' }),
    h('i', { class: 'ls-reflect', 'aria-hidden': 'true' }),
    h('div', { class: 'ls-band-phone' }, tilt),
    h('div', { class: 'ls-wallets', 'aria-hidden': 'true' }, ...chips),
    wires,
  );
  const stage = h('div', { class: 'ls-band-stage' }, h('div', { class: 'ls-band-words' }, ...lines), theatre);
  const track = h('div', { class: 'ls-track' }, stage);
  const section = h('section', { class: 'ls-band', 'data-night': '', 'aria-labelledby': 'ls-band-title' }, track);
  rise(section, [stage.querySelector('.ls-band-words') as HTMLElement]);

  // The recording: fetched once the phone has been in view for a moment (a quick scroll past fetches nothing), played
  // only with motion and while it is seen.
  let seen = false;
  let dwelt = false;
  let dwell = 0;
  const load = (): void => {
    if (video.getAttribute('poster')) return;
    video.setAttribute('poster', RECORDING.poster);
    if (calm()) return;
    video.append(h('source', { src: RECORDING.webm, type: 'video/webm' }), h('source', { src: RECORDING.mp4, type: 'video/mp4' }));
    video.load();
  };
  const sync = (): void => {
    clearTimeout(dwell);
    if (seen && !dwelt) dwell = window.setTimeout(() => { dwelt = true; sync(); }, 350);
    if (!dwelt) return;
    load();
    if (seen && !document.hidden && !calm() && !motionPaused()) void video.play().catch(() => undefined);
    else if (!video.paused) video.pause();
  };

  // ── The wires from the phone's request to each name: laid out from where the phone and the names stand ──
  type Wire = { a: [number, number]; c: [number, number]; b: [number, number] };
  let wireAt: Wire[] = [];
  const measure = (): void => {
    const box = theatre.getBoundingClientRect();
    const ph = phone.getBoundingClientRect();
    if (!box.width || !ph.width) return;
    wires.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    // The gold leaves the phone by its edge nearest the names (never across the page in it): its left side, level with
    // the request in the top third of the screen, or its top when the names stand above it (phones).
    const first = chips[0].getBoundingClientRect();
    const above = first.bottom <= ph.top + 2;
    const a: [number, number] = above
      ? [ph.left - box.left + ph.width * 0.5, ph.top - box.top + 4]
      : [ph.left - box.left + 6, ph.top - box.top + ph.height * 0.36];
    wireAt = chips.map((chip, i) => {
      const r = chip.getBoundingClientRect();
      const b: [number, number] = above
        ? [r.left - box.left + r.width / 2, r.bottom - box.top - 2]
        : [r.right - box.left - 6, r.top - box.top + r.height / 2];
      const c: [number, number] = above
        ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 14]
        : [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 40 - 18 * i];
      paths[i].setAttribute('d', `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
      return { a, c, b };
    });
  };
  const along = (w: Wire, t: number): [number, number, number] => {
    const u = 1 - t;
    const x = u * u * w.a[0] + 2 * u * t * w.c[0] + t * t * w.b[0];
    const y = u * u * w.a[1] + 2 * u * t * w.c[1] + t * t * w.b[1];
    const dx = 2 * u * (w.c[0] - w.a[0]) + 2 * t * (w.b[0] - w.c[0]);
    const dy = 2 * u * (w.c[1] - w.a[1]) + 2 * t * (w.b[1] - w.c[1]);
    return [x, y, (Math.atan2(dy, dx) * 180) / Math.PI];
  };

  // ── What the scroll shows: the phone straightening as the band comes in; then the lines and the names in turn ──
  let lit = -1;
  const light = (k: number): void => {
    if (k === lit) return;
    lit = k;
    section.dataset.state = String(k);
    lines.forEach((el, i) => el.classList.toggle('now', i === k));
  };
  /** The phone's angle as the band comes up the screen: tilted back and turned a little, then straight. */
  const straighten = (u: number): void => {
    const t = easeInOut(clamp(u));
    tilt.style.setProperty('--rx', `${(16 * (1 - t)).toFixed(2)}deg`);
    tilt.style.setProperty('--ry', `${(-14 + 10 * t).toFixed(2)}deg`);
    tilt.style.setProperty('--ty', `${(70 * (1 - t)).toFixed(1)}px`);
    tilt.style.setProperty('--sc', (0.92 + 0.08 * t).toFixed(4));
  };
  /** The story while the band holds the screen, u from 0 to 1: the first line, then the second and the wallets in turn. */
  const story = (u: number, held: boolean): void => {
    light(u < 0.4 ? 0 : 1);
    const legs = WALLETS.length;
    let packetOn = false;
    // The four legs share 0.42 to 0.82 of the hold; the rest of it rests with every name lit.
    chips.forEach((chip, i) => {
      const a = 0.42 + (i * 0.4) / legs, b = a + 0.4 / legs;
      const t = span(u, a, b - 0.015);
      chip.classList.toggle('on', u >= b - 0.02);
      paths[i].style.strokeDashoffset = String(1 - (held ? (u >= b - 0.02 ? 1 : 0) : t));
      if (!held && t > 0 && t < 1 && wireAt[i]) {
        const [x, y, angle] = along(wireAt[i], easeInOut(t));
        packet.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
        packetOn = true;
      }
    });
    packet.style.opacity = packetOn ? '1' : '0';
    // The scan line: down the screen in the first part of each leg.
    let sweep = -1;
    for (let i = 0; i < legs; i++) {
      const a = 0.42 + (i * 0.4) / legs;
      const t = span(u, a - 0.01, a + 0.06);
      if (t > 0 && t < 1) sweep = t;
    }
    scan.style.setProperty('--sy', sweep < 0 ? '0' : (8 + 84 * easeInOut(sweep)).toFixed(2));
    scan.style.opacity = !held && sweep >= 0 ? Math.sin(Math.PI * sweep).toFixed(3) : '0';
  };
  const still = (): void => {
    section.classList.add('ls-still');
    instant(section, () => { light(-1); straighten(1); chips.forEach(chip => chip.classList.add('on')); paths.forEach(p => { p.style.strokeDashoffset = '0'; }); packet.style.opacity = '0'; });
    video.pause();
  };

  const boot = (): void => {
    if (!section.isConnected) { requestAnimationFrame(boot); return; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { seen = entries[entries.length - 1].isIntersecting; sync(); }, { threshold: 0.25 }).observe(phone);
    } else { seen = true; dwelt = true; sync(); }
    document.addEventListener('visibilitychange', sync);
    // Pause motion holds the recording where it is, and it does not start again when the phone is seen; playing carries on.
    onMotionPause(sync);
    if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(theatre);
    requestAnimationFrame(measure);
    if (calm()) { still(); return; }
    instant(section, () => { light(0); straighten(0); story(0, false); });
    // The phone straightens from when the band's top comes up the screen until the band holds it.
    scrub({
      range: () => { const top = section.getBoundingClientRect().top + scrollY; return [top - innerHeight, top + parseFloat(getComputedStyle(section).paddingTop)]; },
      apply: (u, held) => straighten(held ? 1 : u),
      follow: 0.12,
    });
    // The story, while the band holds the screen.
    scrub({
      range: () => { const r = track.getBoundingClientRect(); const top = r.top + scrollY; return [top, top + Math.max(1, r.height - innerHeight)]; },
      apply: (u, held) => { if (!wireAt.length) measure(); story(u, held); },
      follow: 0.14,
    });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', event => { if (event.matches) still(); });
  };
  boot();
  return section;
}

// ── The ring: twelve friends' link cards from three tabs, turning ─────────────────────────────────────────────────

/** Only the engine sees this address (Zcash's test network): it makes the example links. Nothing is requested or sent. */
const TEST_PAYEE = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';

interface Friend { tab: string; name: string; amount: string; chip: [string, string] }

/** The friends of three example tabs, their shares split by the app's own makeTab (Dinner, Friday is the sample's). */
function friendsOfTabs(): Friend[] {
  const at = '2026-10-12T00:00:00.000Z';
  const dinner = LANDING_SAMPLE.shares.filter(share => !share.own).map(share => {
    const [start, end] = share.link.split('…');
    return { tab: LANDING_SAMPLE.label, name: share.name, amount: formatFiat(share.fiatShare, 'USD'), chip: [`${start}…`, end] as [string, string] };
  });
  const other = (label: string, fiat: string, total: string, rate: string, names: string[]): Friend[] => {
    const tab = makeTab({ createdAt: at, from: 'Lena', label, payee: TEST_PAYEE, fiat, total, ownShare: '', people: names.map(name => ({ name, amount: '' })), rate: { fiatPerZec: rate, source: 'Manual entry', observedAt: at } });
    if (tab.kind !== 'tab') return [];
    return tab.rows.map(row => ({ tab: label, name: row.name, amount: formatFiat(row.fiatShare, fiat), chip: [`ztab.sebrona.com/#${row.fragment.slice(0, 7)}…`, row.fragment.slice(-4)] as [string, string] }));
  };
  return [
    ...dinner,
    ...other('Pizza night', 'USD', '92.00', '1229.06', ['Mia', 'Noah', 'Sara', 'Leo']),
    ...other('Brunch', 'EUR', '109.20', '1052.40', ['Eva', 'Marek', 'Zoe']),
  ].slice(0, 12);
}

/**
 * The ring: a card for each friend on a cylinder (30° apart), turning once in 48 s, the cards further round fading.
 * Transform and opacity only; it stops under the pointer, with the focus, and off screen; with reduced motion it is
 * a still arc.
 */
export function ring(): HTMLElement {
  const friends = friendsOfTabs();
  const count = friends.length;
  const cards = friends.map((friend, i) => {
    const el = h(
      'div',
      { class: 'ls-ring-card' },
      h('i', { class: 'ls-rail' }),
      h('p', { class: 'ls-ring-tab' }, friend.tab),
      h('p', { class: 'ls-ring-name' }, friend.name),
      h('p', { class: 'ls-ring-amount' }, friend.amount),
      h('p', { class: 'ls-ring-chip', translate: 'no' }, h('span', {}, friend.chip[0]), h('span', {}, friend.chip[1])),
    );
    el.style.setProperty('--i', String(i));
    // Where the card is in the turn: the card at the front first, then each one 1/12 of a turn on.
    el.style.setProperty('--ls-phase', `${(-((count - i) % count) * 48) / count}s`);
    // The still arc's fading and its depth of field, by how far round each card is.
    const angle = ((i * 360) / count + 180) % 360 - 180;
    el.style.setProperty('--ls-still-o', Math.max(0, Math.cos((angle * Math.PI) / 180)).toFixed(3));
    el.style.setProperty('--ls-still-b', `${Math.min(4, (Math.abs(angle) / 90) * 4).toFixed(2)}px`);
    return el;
  });
  const spin = h('div', { class: 'ls-ring-spin' }, ...cards);
  const stage = h(
    'div',
    {
      class: 'ls-ring-stage',
      role: 'img',
      tabindex: '0',
      'aria-label': `Link cards of twelve friends from three tabs, each with a share and a link: ${friends.map(f => `${f.name} ${f.amount}`).join(', ')}. The cards turn; they stop while the pointer or the focus is on them.`,
    },
    // The floor lies flat under the turning cards, outside their 3D space (in it, the nearest cards would cut into it).
    h('i', { class: 'ls-ring-floor', 'aria-hidden': 'true' }),
    h('div', { class: 'ls-ring-scene', 'aria-hidden': 'true' }, spin),
  );
  const section = h('section', { class: 'ls-ring', 'aria-label': 'Link cards' }, h('i', { class: 'ls-ring-light', 'aria-hidden': 'true' }), stage);
  rise(section, [stage]);
  // The page's scroll speed spins the ring on (or back), and it eases back to its own pace; under a mouse pointer it
  // turns slowly, and the card at the front comes forward with a glint along its gold edge.
  if (!calm()) {
    let rate = 1;
    let slow = false;
    let front = -1;
    const apply = (): void => {
      if (!section.classList.contains('ls-ring-on')) return;
      for (const a of [...spin.getAnimations(), ...cards.flatMap(card => card.getAnimations())]) a.playbackRate = rate * (slow ? 0.22 : 1);
    };
    onSpeed(v => {
      const next = 1 + Math.max(-4, Math.min(12, v * 6));
      if (Math.abs(next - rate) < 0.01 && next !== 1) return;
      rate = next;
      apply();
    });
    const lift = (): void => {
      const turn = spin.getAnimations()[0];
      if (!slow || !turn || motionPaused()) return;
      const t = ((Number(turn.currentTime) || 0) % 48000) / 48000;
      let best = 0, bestAngle = 360;
      cards.forEach((_, i) => {
        const angle = Math.abs(((((i * 30 - 360 * t) % 360) + 540) % 360) - 180);
        if (angle < bestAngle) { bestAngle = angle; best = i; }
      });
      if (best === front) return;
      cards[front]?.classList.remove('ls-lift');
      front = best;
      cards[front].classList.add('ls-lift');
    };
    let timer = 0;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    stage.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      slow = true;
      apply();
      lift();
      timer = window.setInterval(lift, 250);
    });
    stage.addEventListener('pointerleave', () => {
      slow = false;
      apply();
      clearInterval(timer);
      cards[front]?.classList.remove('ls-lift');
      front = -1;
    });
  }
  if (!calm() && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { section.classList.toggle('ls-ring-on', entries[entries.length - 1].isIntersecting); }, { rootMargin: '100px 0px' }).observe(stage);
  } else if (!calm()) section.classList.add('ls-ring-on');
  return section;
}

// ── The counts: four figures that count up once, as the strip comes into view ────────────────────────────────────

/**
 * The figures, each a fact of the app: the ZecDev ZIP 321 conformance tests the engine passes (67: 51 valid and invalid
 * vectors and 16 canonical URIs; the engine's other tests are not counted), the currencies it offers (USD, EUR, GBP, CZK,
 * PLN, CHF), the wallets the requests were tried in (Zodl, Zingo, YWallet, Zkool), and the accounts it keeps.
 */
const COUNTS: [number, string][] = [[67, 'ZIP 321 conformance tests passed'], [6, 'currencies'], [4, 'wallets tried'], [0, 'accounts']];

export function counts(): HTMLElement {
  const items = COUNTS.map(([value, label]) => {
    // The figure as text (what is read, and the size of the dial); the odometer drawn over it with motion.
    const figure = h('span', { class: 'ls-count-num', 'aria-hidden': 'true' }, String(value));
    figure.style.minWidth = `${String(value).length}ch`;
    // A thin gold arc (three quarters of a circle, open at the foot) that fills as the figure counts up to its value;
    // the 0 of the accounts leaves it empty.
    const gauge = document.createElementNS(NS, 'svg');
    gauge.setAttribute('class', 'ls-gauge');
    gauge.setAttribute('viewBox', '0 0 120 120');
    gauge.setAttribute('aria-hidden', 'true');
    const ring = (cls: string): SVGCircleElement => {
      const c = document.createElementNS(NS, 'circle');
      for (const [k, v] of Object.entries({ class: cls, cx: '60', cy: '60', r: '54', pathLength: '1', transform: 'rotate(135 60 60)' })) c.setAttribute(k, v);
      return c;
    };
    const fill = ring('ls-gauge-fill');
    const glint = ring('ls-gauge-glint');
    gauge.append(ring('ls-gauge-track'), fill, glint);
    // The odometer: a wheel of digits for each place, rolling to the figure (the digits are drawn by CSS, not text).
    const strips = String(value).split('').map(() => h('span', { class: 'ls-odo-strip' }));
    const odo = h('span', { class: 'ls-odo', 'aria-hidden': 'true' }, ...strips.map(strip => h('span', { class: 'ls-odo-col' }, strip)));
    const dial = h('span', { class: 'ls-dial' }, gauge, figure, odo);
    return { value, figure, fill, glint, strips, el: h('p', { class: 'ls-count' }, dial, h('span', { class: 'ls-vh' }, `${value} `), h('span', { class: 'ls-count-label' }, label)) };
  });
  /** Each figure at the count c (0 to its value, not rounded): the text, the arc, and each wheel where an odometer has it. */
  const show = (shares: number[]): void => items.forEach((item, i) => {
    const c = item.value * shares[i];
    item.figure.textContent = String(Math.round(c));
    item.fill.style.strokeDashoffset = (0.75 * (1 - (item.value ? c / item.value : 0))).toFixed(4);
    // An empty arc draws nothing (not the dot of its round cap).
    item.fill.style.opacity = c > 0.001 ? '' : '0';
    const places = item.strips.length;
    item.strips.forEach((strip, j) => {
      const k = places - 1 - j, unit = Math.pow(10, k);
      const below = c % unit;
      const pos = k === 0 ? c % 10 : (Math.floor(c / unit) % 10) + Math.max(0, below - (unit - 1));
      strip.style.transform = `translate3d(0, ${(-pos).toFixed(4)}em, 0)`;
    });
  });
  const section = h('section', { class: 'ls-counts', 'aria-label': 'Ztab in figures' }, h('div', { class: 'ls-counts-in' }, ...items.map(item => item.el)));
  rise(section, items.map(item => item.el));
  const finish = (): void => show(items.map(() => 1));
  if (calm() || !('IntersectionObserver' in window)) { finish(); return section; }
  section.classList.add('ls-odo-on');
  show(items.map(() => 0));
  let frame = 0;
  /** A light runs once along each full arc. */
  const glints = (): void => items.forEach((item, i) => {
    if (!item.value || motionPaused()) return;
    item.glint.animate([{ strokeDashoffset: 0, opacity: 0 }, { opacity: 1, offset: 0.2 }, { strokeDashoffset: -0.69, opacity: 0 }], { duration: 1100, delay: 120 * i, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' });
  });
  const seen = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    seen.disconnect();
    // Paused, the figures are there at once.
    if (motionPaused()) { finish(); return; }
    // 1600 ms, easing out: the wheels roll fast at first and settle on the figure; the arcs fill with them.
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / 1600);
      const eased = 1 - Math.pow(1 - t, 3);
      show(items.map(() => eased));
      frame = t < 1 ? requestAnimationFrame(step) : 0;
      if (t >= 1) glints();
    };
    frame = requestAnimationFrame(step);
  }, { threshold: 0.4 });
  seen.observe(section);
  // A pause in the middle of the count brings the figures to where they end, so none is left half counted.
  onMotionPause(paused => { if (paused && frame) { cancelAnimationFrame(frame); frame = 0; finish(); } });
  return section;
}
