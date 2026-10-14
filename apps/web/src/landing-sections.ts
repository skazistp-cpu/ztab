import { h } from './dom.ts';
import { formatFiat } from './money.ts';
import { LANDING_SAMPLE } from './landing-sample.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';
import { makeTab } from './tab.ts';
import type { BandHandle } from './wallet-band.ts';
import { FIAT_CURRENCIES } from '../../../packages/engine/src/index.ts';
import { calm, instant, maskReveal, orbitLayers, rise } from './landing-kit.ts';
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
  tried: 'Tested with Zodl, Zingo, YWallet and Zkool.',
} as const;

// ── The band of night: the wallet ───────────────────────────────────────────────────────────────────────────────

/** The wallets of the approved sentence, as words: no logos. */
const WALLETS = ['Zodl', 'Zingo', 'YWallet', 'Zkool'] as const;

const NS = 'http://www.w3.org/2000/svg';

/**
 * The band of night after the street: the wallet band (landing-band/): Ana's real pay page on a phone, the tap, a
 * wallet's Send sheet filling To, Amount and Note from the request while the approved sentence lights those words, then
 * the wallets' names. It holds the screen over its span and is given the scroll's own progress (it eases its own
 * decoration). It is built only as it comes near: its pay page uses the app's monospace face, which a visit that never
 * gets this far should not fetch; until then its two sentences are there for a screen reader. Pause motion holds it;
 * with reduced motion it is the module's still, a block of its own height, with no hold.
 */
export function walletBand(): HTMLElement {
  const words = h('div', { class: 'lw-words-sr' }, h('h2', {}, SECTION_SENTENCES.fills), h('p', {}, SECTION_SENTENCES.tried));
  const host = h('div', { class: 'lw-host' });
  const stage = h('div', { class: 'lw-stage' }, host);
  const track = h('div', { class: 'lw-track' }, stage);
  // (The band itself is the landmark, a section named by its first sentence: this is only its span and its light.)
  const section = h('div', { class: 'lw-band', 'data-night': '' }, words, track);
  const still = calm();
  section.classList.toggle('lw-still', still);
  let band: BandHandle | undefined;
  let asked = false;
  let last = 0;
  // Its code (and its style) is a chunk of its own, asked for when it comes near.
  const mount = (): void => {
    if (asked) return;
    asked = true;
    // Built in the browser's idle time (the page is likely still moving down the street then).
    const idle = (window as Window & { requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    void import('./wallet-band.ts').then(mod => {
      const build = (): void => {
        band = mod.mountWalletBand(host);
        words.remove();
        band.setPaused(motionPaused());
        band.setProgress(last);
      };
      if (idle) idle(build, { timeout: 600 }); else build();
    });
  };
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      near.disconnect();
      mount();
    }, { rootMargin: '100% 0px 100% 0px' });
    near.observe(section);
  } else mount();
  if (!still) {
    scrub({
      range: () => {
        const top = track.getBoundingClientRect().top + scrollY;
        return [top, top + Math.max(1, track.offsetHeight - innerHeight)];
      },
      // The scroll's own progress (not smoothed), its story done a little before the span ends, so the last of it is
      // a short rest with every name lit.
      apply: p => { last = Math.min(1, p / 0.96); band?.setProgress(last); },
      follow: 1,
    });
    onMotionPause(paused => band?.setPaused(paused));
  }
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
    const face = (blurred: boolean): HTMLElement => h(
      'div',
      { class: blurred ? 'ls-ring-face ls-ring-blurred' : 'ls-ring-face' },
      h('i', { class: 'ls-rail' }),
      h('p', { class: 'ls-ring-tab' }, friend.tab),
      h('p', { class: 'ls-ring-name' }, friend.name),
      h('p', { class: 'ls-ring-amount' }, friend.amount),
      h('p', { class: 'ls-ring-chip', translate: 'no' }, h('span', {}, friend.chip[0]), h('span', {}, friend.chip[1])),
    );
    // Its depth of field: a sharp face and the same face out of focus (blurred once, still), the one giving way to the
    // other as the card turns away; opacity only, so the turning ring runs on the compositor.
    const el = h('div', { class: 'ls-ring-card' }, face(true), face(false));
    el.style.setProperty('--i', String(i));
    // Where the card is in the turn: the card at the front first, then each one 1/12 of a turn on.
    el.style.setProperty('--ls-phase', `${(-((count - i) % count) * 48) / count}s`);
    // The still arc's fading and its depth of field, by how far round each card is.
    const angle = ((i * 360) / count + 180) % 360 - 180;
    el.style.setProperty('--ls-still-o', Math.max(0, Math.cos((angle * Math.PI) / 180)).toFixed(3));
    el.style.setProperty('--ls-still-b', Math.min(1, Math.abs(angle) / 90).toFixed(3));
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
    // The ring's axis stands back by its radius (still); in it the ring turns (a pure rotation, on the compositor).
    h('div', { class: 'ls-ring-scene', 'aria-hidden': 'true' }, h('div', { class: 'ls-ring-axis' }, spin)),
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
      // The turn and the cards' depth and focus (not the glint along a lifted card's edge).
      const turning = [...spin.getAnimations(), ...cards.flatMap(card => card.getAnimations({ subtree: true }))].filter(a => a.effect?.getTiming().iterations === Infinity);
      for (const a of turning) a.playbackRate = rate * (slow ? 0.22 : 1);
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
const COUNTS: [number, string][] = [[67, 'ZIP 321 conformance tests passed'], [6, 'currencies'], [4, 'wallets tested'], [0, 'accounts']];

/** The six currencies' signs, from the app's own currency codes, written the way English writes them ($, €, £, Kč, zł, CHF). */
const SIGNS = FIAT_CURRENCIES.map(code => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(part => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
});

/**
 * Each figure's own small picture, drawn round it (hidden from a screen reader; the words are drawn by CSS from
 * data-t, so the figure's text is only its number and its label): 67 ticks that fill in as the figure counts; the six
 * currencies' signs going round the 6, in front of it and behind; the four wallets' names lighting in turn; and the
 * ghost of an account card that falls to dust.
 */
function figurePicture(value: number): { el: HTMLElement; front?: HTMLElement; light(count: number): void; drawn?(): void } {
  if (value === 67) {
    const cols = 12, cell = 14, rows = Math.ceil(value / cols);
    const viewBox = `0 0 ${cols * cell} ${rows * cell}`;
    const d = (i: number): string => `M${(i % cols) * cell + 3.6} ${Math.floor(i / cols) * cell + 7.4}l2.6 2.6 4.6-5`;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ls-ticks');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const ticks = Array.from({ length: value }, (_, i) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'ls-tick');
      path.setAttribute('d', d(i));
      path.setAttribute('pathLength', '1');
      svg.append(path);
      return path;
    });
    // Once all are in, now and then a light runs through them: one band, seen only through the ticks' own shape.
    const shape = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${Array.from({ length: value }, (_, i) => d(i)).join('')}" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const glint = h('span', { class: 'ls-glint' }, h('i', { class: 'ls-glint-band' }));
    // The ticks' shape as the glint's mask, set once they are all in (a visit that never gets here never makes it).
    let masked = false;
    const mask = (): void => {
      if (masked) return;
      masked = true;
      const url = `url("data:image/svg+xml,${encodeURIComponent(shape)}")`;
      glint.style.setProperty('-webkit-mask-image', url);
      glint.style.setProperty('mask-image', url);
    };
    const el = h('span', { class: 'ls-viz ls-viz-ticks', 'aria-hidden': 'true' }, h('span', { class: 'ls-ticks-in' }, svg, glint));
    let lit = 0;
    return {
      drawn: () => svg.classList.add('ls-drawn'),
      el,
      light(count) {
        const n = Math.min(value, Math.floor(count + 0.0001));
        if (n === lit) return;
        ticks.forEach((tick, i) => tick.classList.toggle('on', i < n));
        lit = n;
        el.classList.toggle('ls-done', n === value);
        if (n === value && !calm()) mask();
      },
    };
  }
  if (value === SIGNS.length) {
    // The far half behind the figure, under a veil the colour of the card; the near half in front of it.
    const [back, front] = orbitLayers(k => h('span', { class: 'ls-sign', 'data-t': SIGNS[k] }), SIGNS.length, 'ls-orbit');
    return {
      el: h('span', { class: 'ls-viz ls-viz-orbit', 'aria-hidden': 'true' }, back, h('i', { class: 'ls-veil' })),
      front: h('span', { class: 'ls-viz ls-viz-orbit ls-viz-front', 'aria-hidden': 'true' }, front),
      light() {},
    };
  }
  if (value === WALLETS.length) {
    return {
      el: h('span', { class: 'ls-viz ls-viz-marks', 'aria-hidden': 'true' }, ...WALLETS.map((name, i) => {
        const el = h('span', { class: `ls-mark ls-mark-${i}`, 'data-t': name }, h('span', { class: 'ls-mark-lit', 'data-t': name }));
        el.style.setProperty('--i', String(i));
        return el;
      })),
      light() {},
    };
  }
  // The account there is not: a sign-up card's ghost (a face, two fields, a button, no words) that falls to dust.
  const card = document.createElementNS(NS, 'svg');
  card.setAttribute('class', 'ls-ghost-card');
  card.setAttribute('viewBox', '0 0 120 84');
  card.innerHTML = '<rect x="1.5" y="1.5" width="117" height="81" rx="12"/><circle cx="24" cy="24" r="9"/><path d="M40 20h52M40 29h34"/><rect x="16" y="44" width="88" height="11" rx="5.5"/><rect x="16" y="61" width="52" height="11" rx="5.5" class="ls-ghost-button"/>';
  // Its dust: three drifts of specks (each drift one animation), over the card's place.
  let seed = 7;
  const rand = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const drifts = [0, 1, 2].map(k => {
    const drift = document.createElementNS(NS, 'svg');
    drift.setAttribute('class', `ls-drift ls-drift-${k}`);
    drift.setAttribute('viewBox', '0 0 100 100');
    drift.setAttribute('preserveAspectRatio', 'none');
    for (let j = 0; j < 9; j++) {
      const dot = document.createElementNS(NS, 'rect');
      for (const [a, v] of Object.entries({ x: (8 + rand() * 84).toFixed(1), y: (12 + rand() * 76).toFixed(1), width: '2.2', height: '2.2', rx: '0.6' })) dot.setAttribute(a, v);
      drift.append(dot);
    }
    return drift;
  });
  return { el: h('span', { class: 'ls-viz ls-viz-ghost', 'aria-hidden': 'true' }, h('span', { class: 'ls-ghost' }, card), ...drifts), light() {} };
}

export function counts(): HTMLElement {
  const items = COUNTS.map(([value, label]) => {
    // The figure as text (what is read, and the size of the dial); the odometer drawn over it with motion.
    const figure = h('span', { class: 'ls-count-num', 'aria-hidden': 'true' }, String(value));
    figure.style.minWidth = `${String(value).length}ch`;
    const picture = figurePicture(value);
    // The odometer: a wheel of digits for each place, rolling to the figure (the digits are drawn by CSS, not text).
    const strips = String(value).split('').map(() => h('span', { class: 'ls-odo-strip' }));
    const odo = h('span', { class: 'ls-odo', 'aria-hidden': 'true' }, ...strips.map(strip => h('span', { class: 'ls-odo-col' }, strip)));
    const dial = h('span', { class: `ls-dial ls-dial-${value}` }, picture.el, figure, odo, picture.front);
    // The card (its own 3D space: the picture and the figure at their depths, leaning to the pointer) in a holder that
    // rises in with the others (an opacity on the holder leaves the card's depth alone).
    const cardEl = h('span', { class: 'ls-card' }, dial, h('span', { class: 'ls-vh' }, `${value} `), h('span', { class: 'ls-count-label' }, label));
    return { value, figure, picture, strips, card: cardEl, el: h('p', { class: 'ls-count' }, cardEl) };
  });
  /** Each figure at the count c (0 to its value, not rounded): the text, its picture, and each wheel of its odometer. */
  const show = (shares: number[]): void => items.forEach((item, i) => {
    const c = item.value * shares[i];
    item.figure.textContent = String(Math.round(c));
    item.picture.light(c);
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
  // The pictures live only while the figures are on the screen (and hold with Pause motion, landing.css).
  new IntersectionObserver(entries => { section.classList.toggle('ls-counts-live', entries[entries.length - 1].isIntersecting); }).observe(section);
  // Under a mouse each card leans toward the pointer a little, its picture and figure standing out from it.
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  for (const item of items) {
    const card = item.card;
    card.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !fine.matches || motionPaused()) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--lean-y', `${(x * 9).toFixed(2)}deg`);
      card.style.setProperty('--lean-x', `${(-y * 7).toFixed(2)}deg`);
      card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
      card.classList.add('ls-lean');
    });
    card.addEventListener('pointerleave', () => { card.classList.remove('ls-lean'); for (const v of ['--lean-x', '--lean-y']) card.style.removeProperty(v); });
  }
  const seen = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    seen.disconnect();
    // Paused, the figures are there at once (and their ticks drawn, not drawn in when motion plays).
    if (motionPaused()) { finish(); items.forEach(item => item.picture.drawn?.()); return; }
    // 1600 ms, easing out: the wheels roll fast at first and settle on the figure; the arcs fill with them.
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / 1600);
      const eased = 1 - Math.pow(1 - t, 3);
      show(items.map(() => eased));
      frame = t < 1 ? requestAnimationFrame(step) : 0;
      // Once the last tick has drawn in, the ticks keep no animation of their own (fewer for the page to run).
      if (t >= 1) window.setTimeout(() => items.forEach(item => item.picture.drawn?.()), 520);
    };
    frame = requestAnimationFrame(step);
  }, { threshold: 0.4 });
  seen.observe(section);
  // A pause in the middle of the count brings the figures to where they end, so none is left half counted.
  onMotionPause(paused => { if (paused && frame) { cancelAnimationFrame(frame); frame = 0; finish(); items.forEach(item => item.picture.drawn?.()); } });
  return section;
}
