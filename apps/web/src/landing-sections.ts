import './landing-sections.css';
import { h, zecFigure } from './dom.ts';
import { formatFiat } from './money.ts';
import { splitItems } from './items.ts';
import { DEMO_ITEMS } from './demo.ts';
import { LANDING_SAMPLE } from './landing-sample.ts';
import { motionPaused, onMotionPause } from './landing-motion.ts';
import { makeTab } from './tab.ts';

/*
 * Two sections of the opening, after its first screen:
 *  - a grid of five tiles on paper, each with a piece of the app as it looks, moving in a short loop;
 *  - a band of ink where a phone shows Ana's pay page, and the page moves on as the band is scrolled through.
 * Every figure comes from the app's own code: the items from the sample dinner through splitItems, the shares from
 * LANDING_SAMPLE (checked against makeTab by its own test). The codes are drawn patterns that hold no data.
 * Motion is transform and opacity only. A loop runs only while its tile is on screen and the page is visible;
 * with reduced motion every tile is a still picture of its end state and the band does not hold the screen.
 */

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const usd = (amount: string): string => formatFiat(amount, 'USD');

/** The sentences of these sections, word for word as approved. */
export const SECTION_SENTENCES = {
  title: 'Split the bill. Get paid back in Zcash.',
  items: 'Split it equally or by item, with a tip.',
  links: 'Each link opens one standard ZIP 321 payment request for one person.',
  table: 'At the table, show one QR: each friend scans it and chooses their name.',
  pay: 'They pay from their own Zcash wallet.',
  sampleLink: 'Try a sample dinner',
  sampleRest: ' on Zcash’s test network, with test coins only.',
  tried: 'We have tried the requests in Zodl, Zingo, YWallet and Zkool.',
  fills: 'A wallet that reads the request fills in the address and the amount, and the note if it supports one.',
  cannot: 'Ztab cannot see payments on its own.',
} as const;

// ── Loops ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Wait = (ms: number) => Promise<void>;
interface Loop {
  /** The first frame of the loop, set at once. */
  reset(): void;
  /** The end of the story, set at once: what reduced motion shows. */
  still(): void;
  /** One turn of the loop. `wait` never resolves once the loop is stopped, so a stopped turn simply ends there. */
  run(wait: Wait): Promise<void>;
  /** Once each time the tile comes into view, before the first turn. */
  enter?(wait: Wait): Promise<void>;
  /** While the tile is out of view: how it waits for `enter`. */
  away?(): void;
}

/** Sets a state with no transitions: the class turns them off for one frame. */
function instant(root: HTMLElement, set: () => void): void {
  root.classList.add('ls-instant');
  set();
  void root.offsetWidth;
  root.classList.remove('ls-instant');
}

/** A wait that a pause can hold and let go on: what it had left is kept. */
interface Timer { id: number; left: number; at: number; done(): void }

/**
 * Runs `loop` while `root` is on screen and the page is visible; with reduced motion it shows the still. A pause holds
 * a turn where it is (its waits stop, and what they had left is kept); a tile that comes into view while the motion is
 * paused shows its still, and playing starts it from the beginning.
 */
function animate(root: HTMLElement, loop: Loop): void {
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
  /** The tile is in view: its turns run, or, while the motion is paused, it shows its still. */
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
  }, { threshold: 0.2 });
  watch.observe(root);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (seen) show(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', event => {
    if (event.matches) { stop(); instant(root, () => { root.querySelectorAll('.ls-away').forEach(el => el.classList.remove('ls-away')); loop.still(); }); } else if (seen) show();
  });
}

/** One WAAPI run, forgotten once done. */
const play = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions): Animation =>
  el.animate(frames, { easing: EASE, ...options });

/** A figure that rolls: the old text goes up and away, the new one comes up from under it. */
function figure(text: string): HTMLElement {
  return h('b', { class: 'ls-fig' }, h('span', {}, text));
}
function roll(fig: HTMLElement, text: string, moving = true): void {
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
function press(el: Element): Animation {
  return el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.95)', offset: 0.3 }, { transform: 'scale(1.015)', offset: 0.7 }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'ease-out' },
  );
}

/**
 * Parts that rise into place as they come into view: 28 px and a fade, 450 ms, those that arrive together 55 ms apart.
 * Nothing is hidden with reduced motion or without IntersectionObserver.
 */
function rise(root: HTMLElement, parts: HTMLElement[]): void {
  if (calm() || !('IntersectionObserver' in window)) return;
  root.classList.add('ls-armed');
  parts.forEach(part => part.classList.add('ls-rise'));
  const seen = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach((entry, k) => {
      const el = entry.target as HTMLElement;
      el.style.setProperty('--ls-d', `${k * 55}ms`);
      el.classList.add('ls-in');
      seen.unobserve(el);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  parts.forEach(part => seen.observe(part));
}

/**
 * Depth while the page scrolls: each stage tells its cards how far it is from the middle of the screen (--ls-p, about
 * −0.6 to 0.6), and each card moves by its own depth (--ls-z in the CSS), the front ones more. `translate` only, so it
 * adds to the cards' own transforms. Nothing with reduced motion.
 */
function depth(root: HTMLElement): void {
  if (calm() || !('IntersectionObserver' in window)) return;
  const stages = [...root.querySelectorAll<HTMLElement>('.ls-stage')];
  let raf = 0;
  let near = false;
  const update = (): void => {
    raf = 0;
    const view = innerHeight;
    for (const stage of stages) {
      const box = stage.getBoundingClientRect();
      if (box.bottom < -200 || box.top > view + 200) continue;
      const p = Math.max(-0.7, Math.min(0.7, (box.top + box.height / 2 - view / 2) / view));
      stage.style.setProperty('--ls-p', p.toFixed(3));
    }
  };
  // Paused, the cards keep the depth they have; playing brings them to where the scroll puts them.
  const schedule = (): void => { if (near && !raf && !motionPaused()) raf = requestAnimationFrame(update); };
  new IntersectionObserver(entries => { near = entries[entries.length - 1].isIntersecting; schedule(); }, { rootMargin: '200px 0px' }).observe(root);
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  onMotionPause(paused => { if (paused) { cancelAnimationFrame(raf); raf = 0; } else schedule(); });
}

// ── Pieces of the app, as it looks ────────────────────────────────────────────────────────────────────────────────

/** A paper card with the brand's gold rail on its top edge, as every card of the app has. */
const card = (cls: string, ...children: (Node | string | false | undefined)[]): HTMLElement =>
  h('div', { class: `ls-app ${cls}` }, h('i', { class: 'ls-rail' }), ...children);

/** A label, a gap and a figure, as on the app's cards. */
const line = (label: string, value: Node | string, cls = ''): HTMLElement =>
  h('p', { class: `ls-row ${cls}`.trim() }, h('span', {}, label), h('i'), typeof value === 'string' ? h('b', {}, value) : value);

/** The tick in a checked box: the app's own mark. */
function tick(): SVGSVGElement {
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
function decoyCode(seed: number, size = 29): SVGSVGElement {
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

// ── 1. The grid ───────────────────────────────────────────────────────────────────────────────────────────────────

const tile = (cls: string, say: Node, stage: HTMLElement): HTMLElement =>
  h('article', { class: `ls-tile ${cls}` }, h('h3', { class: 'ls-say' }, say), stage);

/** a. The items step: who shared each line of the sample dinner is ticked in, and the totals follow. */
function itemsTile(): HTMLElement {
  // The sample dinner of the demo, split by the app's own splitItems; the organiser is "You" on this step.
  const ids = ['Lena', 'Ana', 'Ben'];
  const shown = ['You', 'Ana', 'Ben'];
  const tip = '10';
  const picks = DEMO_ITEMS.map(() => [] as HTMLElement[]);
  const everyone: HTMLElement[] = [];
  const items = DEMO_ITEMS.map((item, i) => {
    const all = h('span', { class: 'ls-pill' }, 'Everyone');
    everyone.push(all);
    return h(
      'div',
      { class: 'ls-item' },
      h('span', { class: 'ls-legend' }, `Item ${i + 1}`),
      h(
        'div',
        { class: 'ls-fields' },
        h('span', { class: 'ls-flabel' }, 'Item'),
        h('span', { class: 'ls-flabel' }, 'Price'),
        h('span', { class: 'ls-input' }, item.name),
        h('span', { class: 'ls-input ls-num' }, item.amount),
      ),
      h('div', { class: 'ls-who' }, h('span', {}, 'Who shared it?'), all),
      h('div', { class: 'ls-picks' }, ...shown.map(name => {
        const pick = h('span', { class: 'ls-pick' }, h('i', { class: 'ls-box' }, tick()), h('span', {}, name));
        picks[i].push(pick);
        return pick;
      })),
    );
  });
  const figs = { tip: figure('$0.00'), total: figure('$0.00'), people: shown.map(() => figure('$0.00')) };
  // Under each share, a gold piece as long as the share, cut at the Z's angle like the pieces of the first screen.
  const bars = shown.map(() => h('b', { class: 'ls-bar' }));
  const totals = card(
    'ls-totals',
    line('Tip / service', figs.tip),
    h('p', { class: 'ls-grand' }, h('span', {}, 'Total'), figs.total),
    h('p', { class: 'ls-each' }, 'Each person pays'),
    ...shown.map((name, j) => h('p', { class: 'ls-row ls-share' }, h('span', {}, name), h('i', {}, bars[j]), figs.people[j])),
  );
  const form = card(
    'ls-items',
    h('p', { class: 'ls-kicker' }, 'Step 3 of 5'),
    h('p', { class: 'ls-h' }, 'Who had what?'),
    ...items,
    h('div', { class: 'ls-tipbox' }, h('span', { class: 'ls-flabel' }, 'Tip or service (%)'), h('span', { class: 'ls-input' }, tip)),
  );
  // How to split, as the Bill step asks it: the total, or by item.
  const choices = [
    ['Split the total', 'Equal shares, or a fixed amount for anyone'],
    ['Split by item', 'Each item to whoever had it, with a tip. Anyone can also have an amount of their own.'],
  ].map(([title, note]) => h('span', { class: 'ls-choice' }, h('i', { class: 'ls-radio' }), h('b', {}, title), h('small', {}, note)));
  const mode = card('ls-mode', h('p', { class: 'ls-legend-plain' }, 'How to split'), ...choices);
  const byItem = (on: boolean): void => { choices[0].classList.toggle('on', !on); choices[1].classList.toggle('on', on); };
  const final = splitItems(ids, DEMO_ITEMS, tip);
  if (final.kind !== 'split') throw new Error('the sample dinner does not split');
  const stage = h(
    'div',
    {
      class: 'ls-stage',
      role: 'img',
      'aria-label': `The Items step in Ztab with the sample dinner: ${DEMO_ITEMS.map(item => `${item.name} $${item.amount}`).join(', ')}, a ${tip}% tip, and what each person pays: ${shown.map((name, j) => `${name} ${usd(final.shares[j].total)}`).join(', ')}.`,
    },
    h('div', { class: 'ls-items-in', 'aria-hidden': 'true' }, form, mode, totals),
  );

  /** The totals once the first `n` lines have their people, by splitItems; nothing yet is all zeros. */
  const show = (n: number, moving: boolean): void => {
    const split = n === 0 ? undefined : splitItems(ids, DEMO_ITEMS.slice(0, n), tip);
    const at = split?.kind === 'split' ? split : undefined;
    roll(figs.tip, usd(at?.tip ?? '0.00'), moving);
    roll(figs.total, usd(at?.total ?? '0.00'), moving);
    figs.people.forEach((fig, j) => roll(fig, usd(at?.shares[j].total ?? '0.00'), moving));
    const most = Math.max(...final.shares.map(share => Number(share.total)));
    bars.forEach((bar, j) => { bar.style.transform = `scaleX(${(Number(at?.shares[j].total ?? 0) / most).toFixed(4)})`; });
  };
  const set = (i: number, j: number, on: boolean): void => { picks[i][j].classList.toggle('on', on); };
  const tickIn = (i: number, j: number): void => {
    set(i, j, true);
    play(picks[i][j].querySelector('.ls-box') as Element, [{ transform: 'scale(0.4)' }, { transform: 'scale(1.18)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 340, easing: 'ease-out' });
    play(picks[i][j], [{ transform: 'scale(1)' }, { transform: 'scale(0.96)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  };

  animate(stage, {
    reset() {
      DEMO_ITEMS.forEach((_, i) => shown.forEach((__, j) => set(i, j, false)));
      byItem(false);
      show(0, false);
    },
    still() {
      DEMO_ITEMS.forEach((item, i) => ids.forEach((id, j) => set(i, j, item.people.includes(id))));
      byItem(true);
      show(DEMO_ITEMS.length, false);
    },
    async run(wait) {
      await wait(360);
      byItem(true);
      play(choices[1].querySelector('.ls-radio') as Element, [{ transform: 'scale(0.6)' }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 340, easing: 'ease-out' });
      press(choices[1]);
      await wait(560);
      for (const [i, item] of DEMO_ITEMS.entries()) {
        const who = ids.flatMap((id, j) => (item.people.includes(id) ? [j] : []));
        if (who.length === ids.length) {
          press(everyone[i]);
          await wait(160);
        }
        for (const j of who) { tickIn(i, j); await wait(60); }
        await wait(120);
        show(i + 1, true);
        await wait(i === DEMO_ITEMS.length - 1 ? 2600 : 820);
      }
      // Back to the start: the ticks go out, last first, and the totals fall back to nothing.
      for (let i = DEMO_ITEMS.length - 1; i >= 0; i--) {
        for (let j = ids.length - 1; j >= 0; j--) {
          if (!picks[i][j].classList.contains('on')) continue;
          set(i, j, false);
          await wait(40);
        }
      }
      show(0, true);
      byItem(false);
      await wait(700);
    },
  });
  return tile('ls-a', document.createTextNode(SECTION_SENTENCES.items), stage);
}

/** b. Each friend's card on the links page, landing on a stack; the front one's link is copied and it moves on. */
function linksTile(): HTMLElement {
  const friends = LANDING_SAMPLE.shares.filter(share => !share.own);
  const cards = friends.map(friend => {
    // The app's own word after a copy, on the same ink button.
    const copy = h('span', { class: 'ls-btn ls-btn-ink' }, h('span', { class: 'ls-copy' }, 'Copy link'), h('span', { class: 'ls-copied' }, 'Copied'));
    const [start, end] = friend.link.split('…');
    const link = h('p', { class: 'ls-link', translate: 'no' }, h('span', {}, `${start}…`), h('span', {}, end), h('i', { class: 'ls-sel' }));
    const label = LANDING_SAMPLE.fixed[friend.name] ? 'Fixed amount' : 'Share of the rest';
    const el = card(
      'ls-person',
      h('p', { class: 'ls-name' }, friend.name),
      line(label, usd(friend.fiatShare), 'ls-lead'),
      line('In ZEC', zecFigure(friend.zec)),
      link,
      h('p', { class: 'ls-acts' }, copy, h('span', { class: 'ls-btn' }, 'Preview')),
    );
    return { slot: h('div', { class: 'ls-slot' }, el), el, copy, link };
  });
  const stage = h(
    'div',
    {
      class: 'ls-stage ls-deck',
      role: 'img',
      'aria-label': `Cards from the links page in Ztab, one for each friend with their share and their link: ${friends.map(f => `${f.name} ${usd(f.fiatShare)}`).join(', ')}.`,
    },
    h('div', { class: 'ls-deck-in', 'aria-hidden': 'true' }, ...cards.map(c => c.slot)),
  );
  let order = cards.map((_, i) => i);
  const place = (): void => order.forEach((c, k) => { cards[c].slot.dataset.slot = String(Math.min(k, 3)); });
  const copied = (on: boolean, c: number): void => { cards[c].copy.classList.toggle('done', on); cards[c].link.classList.toggle('done', on); };

  animate(stage, {
    reset() {
      order = cards.map((_, i) => i);
      place();
      cards.forEach((_, c) => copied(false, c));
      stage.classList.remove('ls-in');
    },
    still() {
      order = cards.map((_, i) => i);
      place();
      stage.classList.add('ls-in');
    },
    async run(wait) {
      // The first three land one on another, the back one first.
      stage.classList.add('ls-in');
      [2, 1, 0].forEach((k, n) => {
        play(cards[order[k]].el, [{ transform: 'translate3d(0, 46px, 0) scale(0.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 440, delay: n * 60, fill: 'backwards' });
      });
      await wait(900);
      for (let turn = 0; turn < cards.length; turn++) {
        const front = order[0];
        press(cards[front].copy);
        await wait(110);
        copied(true, front);
        await wait(1150);
        // The front card goes; the others come forward one place, and a new one shows at the back.
        cards[front].slot.dataset.slot = 'out';
        await wait(60);
        order = [...order.slice(1), front];
        order.slice(0, -1).forEach((c, k) => { cards[c].slot.dataset.slot = String(Math.min(k, 3)); });
        await wait(480);
        instant(cards[front].slot, () => { cards[front].slot.dataset.slot = '3'; copied(false, front); });
        await wait(380);
      }
      stage.classList.remove('ls-in');
      await wait(420);
    },
  });
  return tile('ls-b', document.createTextNode(SECTION_SENTENCES.links), stage);
}

/** c. The Table QR card, scanned again and again, and each time another name on the picker is chosen. */
function tableTile(): HTMLElement {
  const friends = LANDING_SAMPLE.shares.filter(share => !share.own);
  const sweep = h('i', { class: 'ls-sweep' }, h('i'));
  const frame = h('i', { class: 'ls-frame' }, h('i'), h('i'), h('i'), h('i'));
  const code = h('div', { class: 'ls-code' }, decoyCode(0x7ab1e), sweep, frame);
  const rows = friends.map(friend => h(
    'li',
    { class: 'ls-pr' },
    h('i', { class: 'ls-lit' }),
    h('strong', {}, friend.name),
    h('span', { class: 'ls-amt' }, h('small', {}, '$'), friend.fiatShare),
    h('span', { class: 'ls-arr' }, '→'),
  ));
  const qrCard = card(
    'ls-tqr',
    h('p', { class: 'ls-eyebrow' }, LANDING_SAMPLE.label),
    h('p', { class: 'ls-h' }, 'Table QR code'),
    h('p', { class: 'ls-p' }, 'Scan with your phone camera, then choose your name.'),
    code,
  );
  const picker = card(
    'ls-picker',
    h('p', { class: 'ls-eyebrow' }, LANDING_SAMPLE.label),
    h('p', { class: 'ls-h' }, 'Choose your name'),
    h('p', { class: 'ls-p' }, `Paying ${LANDING_SAMPLE.organiser}.`),
    h('ul', {}, ...rows),
  );
  const stage = h(
    'div',
    {
      class: 'ls-stage ls-table',
      role: 'img',
      'aria-label': `The Table QR code of ${LANDING_SAMPLE.label} in Ztab, and the name picker it opens: ${friends.map(f => f.name).join(', ')}. The code in this picture holds nothing.`,
    },
    h('div', { class: 'ls-table-in', 'aria-hidden': 'true' }, qrCard, picker),
  );
  const light = (k: number): void => rows.forEach((row, i) => row.classList.toggle('on', i === k));

  animate(stage, {
    reset() { light(-1); },
    still() { light(0); },
    async run(wait) {
      for (let k = 0; k < rows.length; k++) {
        play(frame, [{ transform: 'scale(1.1)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, fill: 'both' });
        await wait(160);
        play(sweep, [{ transform: 'translateY(0)', opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.88 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 820, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'both' });
        await wait(760);
        play(frame, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.04)', opacity: 0 }], { duration: 240, fill: 'both' });
        light(k);
        press(rows[k]);
        await wait(1250);
        light(-1);
        await wait(260);
      }
    },
  });
  return tile('ls-c', document.createTextNode(SECTION_SENTENCES.table), stage);
}

/** Ana's pay page, as the app sets it (the share of the sample dinner); the button is a picture, it opens nothing. */
function payCard(cls: string): { el: HTMLElement; button: HTMLElement } {
  const ana = LANDING_SAMPLE.shares[1];
  const lena = LANDING_SAMPLE.organiser;
  const button = h('span', { class: 'ls-wallet' }, h('span', {}, 'Open in my wallet'));
  const el = card(
    `ls-pay ${cls}`,
    h('p', { class: 'ls-eyebrow' }, LANDING_SAMPLE.label),
    h('p', { class: 'ls-owed' }, `${ana.name}, your share is`),
    h('p', { class: 'ls-amount' }, h('small', {}, '$'), ana.fiatShare),
    h('p', { class: 'ls-that' }, 'That is ', zecFigure(ana.zec), '.'),
    h('p', { class: 'ls-pays' }, `Pays ${lena}`),
    h('p', { class: 'ls-caution' }, `Pay only if ${lena} sent you this link. Check the address with them if you are unsure.`),
    button,
  );
  return { el, button };
}

/** d. The pay page: the button is pressed, and that is all Ztab does; the wallet does the rest. */
function payTile(): HTMLElement {
  const ana = LANDING_SAMPLE.shares[1];
  const pay = payCard('');
  const stage = h(
    'div',
    { class: 'ls-stage ls-paystage', role: 'img', 'aria-label': `${ana.name}’s pay page in Ztab, with example values: her share of ${LANDING_SAMPLE.label} is $${ana.fiatShare}, for ${LANDING_SAMPLE.organiser}, and the button Open in my wallet.` },
    h('div', { class: 'ls-pay-in', 'aria-hidden': 'true' }, pay.el),
  );
  const shade = h('i', { class: 'ls-shade' });
  pay.button.append(shade);
  const inner = stage.firstElementChild as HTMLElement;
  const amount = pay.el.querySelector('.ls-amount') as HTMLElement;
  const groups = [...pay.el.querySelectorAll<HTMLElement>('.ls-that .zec, .ls-that .zg')];
  const later = [...pay.el.querySelectorAll<HTMLElement>('.ls-pays, .ls-caution, .ls-wallet')];
  animate(stage, {
    reset() { /* the card is still between presses */ },
    still() { inner.classList.remove('ls-away'); },
    away() { inner.classList.add('ls-away'); },
    async enter(wait) {
      // The page as it opens: the card rises, the share rolls in, the ZEC figure in its groups, then whom to pay.
      inner.classList.remove('ls-away');
      play(inner, [{ transform: 'translate3d(0, 40px, 0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, fill: 'backwards' });
      play(amount, [{ transform: 'translate3d(0, 45%, 0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: 140, fill: 'backwards' });
      groups.forEach((g, i) => play(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 260 + 60 * i, fill: 'backwards' }));
      later.forEach((el, i) => play(el, [{ transform: 'translate3d(0, 10px, 0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 420 + 60 * i, fill: 'backwards' }));
      await wait(700);
    },
    async run(wait) {
      await wait(700);
      press(pay.button);
      play(shade, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
      await wait(2000);
    },
  });
  return tile('ls-d', document.createTextNode(SECTION_SENTENCES.pay), stage);
}

/** e. The sample dinner: its receipt comes out of a printer, line by line, and is torn off. */
function sampleTile(): HTMLElement {
  const split = splitItems(['Lena', 'Ana', 'Ben'], DEMO_ITEMS, '10');
  if (split.kind !== 'split') throw new Error('the sample dinner does not split');
  const lines = [
    ...DEMO_ITEMS.map(item => [item.name, item.amount]),
    ['Tip / service', split.tip],
  ].map(([name, amount]) => h('p', { class: 'ls-rl' }, h('span', {}, name), h('i'), h('span', {}, amount)));
  const receipt = h('div', { class: 'ls-receipt' }, h('i', { class: 'ls-zig' }), ...lines, h('p', { class: 'ls-rl ls-rt' }, h('span', {}, 'Total'), h('i'), h('span', {}, split.total)));
  const stage = h(
    'div',
    { class: 'ls-stage ls-printer', 'aria-hidden': 'true' },
    h('i', { class: 'ls-mouth' }),
    h('div', { class: 'ls-feed' }, receipt),
  );
  const link = h('a', { href: `${location.pathname}?demo` }, SECTION_SENTENCES.sampleLink);
  const steps = lines.length + 1;
  animate(stage, {
    reset() { receipt.style.transform = 'translateY(115%)'; receipt.style.opacity = '1'; },
    still() { receipt.style.transform = 'translateY(0)'; receipt.style.opacity = '1'; },
    async run(wait) {
      await wait(300);
      // A line at a time, with the printer's short stop between lines.
      const at = (k: number): string => `translateY(${(115 - (115 * k) / steps).toFixed(2)}%)`;
      const frames: Keyframe[] = [{ transform: at(0), offset: 0 }];
      for (let k = 1; k <= steps; k++) {
        frames.push({ transform: at(k - 1), offset: (k - 0.55) / steps, easing: EASE });
        frames.push({ transform: at(k), offset: k / steps });
      }
      const feed = receipt.animate(frames, { duration: 150 * steps + 300, easing: 'linear', fill: 'forwards' });
      await wait(150 * steps + 300);
      feed.commitStyles?.();
      feed.cancel();
      receipt.style.transform = 'translateY(0)';
      await wait(2200);
      // Torn off: it lifts away and goes.
      const away = play(receipt, [{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: 'translateY(-12%) rotate(-3deg)', opacity: 0 }], { duration: 380, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
      await wait(420);
      away.cancel();
      receipt.style.transform = 'translateY(115%)';
      await wait(200);
    },
  });
  return tile('ls-e', h('span', {}, link, SECTION_SENTENCES.sampleRest), stage);
}

function grid(): HTMLElement {
  const section = h(
    'section',
    // The opening's "How it works" scrolls here.
    { class: 'ls-bento', id: 'how-it-works', 'aria-labelledby': 'ls-title' },
    h(
      'div',
      { class: 'ls-wrap' },
      h('h2', { class: 'ls-title', id: 'ls-title' }, ...SECTION_SENTENCES.title.split(/(?<=\.) /).flatMap((part, i) => (i ? [' ', h('span', {}, part)] : [h('span', {}, part)]))),
      h('div', { class: 'ls-grid' }, itemsTile(), linksTile(), tableTile(), payTile(), sampleTile()),
    ),
  );
  rise(section, [...section.querySelectorAll<HTMLElement>('.ls-title, .ls-tile')]);
  depth(section);
  return section;
}

// ── 2. The ring: twelve friends' link cards from three tabs, turning ─────────────────────────────────────────────────

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
 * The ring: a card for each friend on a cylinder (30° apart), turning once in 40 s, the cards further round fading.
 * Transform and opacity only; it stops under the pointer, with the focus, and off screen; with reduced motion it is
 * a still arc.
 */
function ring(): HTMLElement {
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
    el.style.setProperty('--ls-phase', `${(-((count - i) % count) * 40) / count}s`);
    // The still arc's fading, by how far round each card is.
    const angle = ((i * 360) / count + 180) % 360 - 180;
    el.style.setProperty('--ls-still-o', Math.max(0, Math.cos((angle * Math.PI) / 180)).toFixed(3));
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
    h('div', { class: 'ls-ring-scene', 'aria-hidden': 'true' }, spin),
  );
  const caption = h('p', { class: 'ls-ring-caption', id: 'ls-ring-caption' }, SECTION_SENTENCES.links);
  const section = h('section', { class: 'ls-ring', 'aria-labelledby': 'ls-ring-caption' }, stage, caption);
  rise(section, [stage, caption]);
  if (!calm() && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { section.classList.toggle('ls-ring-on', entries[entries.length - 1].isIntersecting); }, { rootMargin: '100px 0px' }).observe(stage);
  } else if (!calm()) section.classList.add('ls-ring-on');
  return section;
}

// ── 3. The counts: four figures that count up once, as the strip comes into view ────────────────────────────────

/**
 * The figures, each a fact of the app: the ZecDev ZIP 321 conformance tests the engine passes (67: 51 valid and invalid
 * vectors and 16 canonical URIs; the engine's other tests are not counted), the currencies it offers (USD, EUR, GBP, CZK,
 * PLN, CHF), the wallets the requests were tried in (Zodl, Zingo, YWallet, Zkool), and the accounts it keeps.
 */
const COUNTS: [number, string][] = [[67, 'ZIP 321 conformance tests passed'], [6, 'currencies'], [4, 'wallets tried'], [0, 'accounts']];

function counts(): HTMLElement {
  const items = COUNTS.map(([value, label]) => {
    const figure = h('span', { class: 'ls-count-num', 'aria-hidden': 'true' }, String(value));
    figure.style.minWidth = `${String(value).length}ch`;
    return { value, figure, el: h('p', { class: 'ls-count' }, figure, h('span', { class: 'ls-vh' }, `${value} `), h('span', { class: 'ls-count-label' }, label)) };
  });
  const section = h('section', { class: 'ls-counts', 'aria-label': 'Ztab in figures' }, h('div', { class: 'ls-counts-in' }, ...items.map(item => item.el)));
  rise(section, items.map(item => item.el));
  if (calm() || !('IntersectionObserver' in window)) return section;
  items.forEach(item => { item.figure.textContent = '0'; });
  const finish = (): void => items.forEach(item => { item.figure.textContent = String(item.value); });
  let frame = 0;
  const seen = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    seen.disconnect();
    // Paused, the figures are there at once.
    if (motionPaused()) { finish(); return; }
    // 900 ms, easing out: fast at first, settling on the figure.
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      items.forEach(item => { item.figure.textContent = String(Math.round(item.value * eased)); });
      frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  }, { threshold: 0.4 });
  seen.observe(section);
  // A pause in the middle of the count brings the figures to where they end, so none is left half counted.
  onMotionPause(paused => { if (paused && frame) { cancelAnimationFrame(frame); frame = 0; finish(); } });
  return section;
}

// ── 4. The band of ink: a recording of the pay page on a phone, the lines coming in with the scroll ───────────────

/**
 * Ana's pay page, recorded on the app at 390 × 844 from a tab made there (Zcash's test network, a typed rate): the
 * request, then "Which wallet?", then the code, and back to the top, a 7 s loop. In the recording the page's QR code is
 * swapped for a drawn pattern that holds nothing. Fetched only when the band is near; played only while it is on screen.
 */
const RECORDING = { webm: '/landing/sections-pay.webm', mp4: '/landing/sections-pay.mp4', poster: '/landing/sections-pay-poster.webp' };

function band(): HTMLElement {
  const video = h('video', { class: 'ls-video', muted: '', playsinline: '', loop: '', preload: 'none', disablepictureinpicture: '', disableremoteplayback: '', 'aria-hidden': 'true' }) as HTMLVideoElement;
  video.muted = true;
  const screen = h('div', { class: 'ls-screen' }, video, h('i', { class: 'ls-island' }));
  const phone = h(
    'div',
    {
      class: 'ls-phone',
      role: 'img',
      'aria-label': `A recording of ${LANDING_SAMPLE.shares[1].name}’s pay page in Ztab on a phone, on Zcash’s test network: her share of ${LANDING_SAMPLE.label} is $${LANDING_SAMPLE.shares[1].fiatShare}, for ${LANDING_SAMPLE.organiser}. The page moves on to the wallets we have tried and to the code to scan, which in this recording holds nothing.`,
    },
    h('div', { class: 'ls-bezel', 'aria-hidden': 'true' }, screen),
  );
  // Each line comes in with the part of the page it speaks of: the request, the wallets tried, then the code.
  const lines = [SECTION_SENTENCES.fills, SECTION_SENTENCES.tried, SECTION_SENTENCES.cannot].map(text => h('p', { class: 'ls-line' }, text));
  const stage = h(
    'div',
    { class: 'ls-band-stage' },
    h('div', { class: 'ls-band-words' }, h('h2', { class: 'ls-band-title', id: 'ls-band-title' }, SECTION_SENTENCES.pay), h('div', { class: 'ls-lines' }, ...lines)),
    h('div', { class: 'ls-band-phone' }, phone),
  );
  const track = h('div', { class: 'ls-track' }, stage);
  const section = h('section', { class: 'ls-band', 'aria-labelledby': 'ls-band-title' }, track);
  rise(section, [stage.querySelector('.ls-band-title') as HTMLElement, stage.querySelector('.ls-band-phone') as HTMLElement]);

  // The recording: fetched once the phone has been in view for a moment (a quick scroll past fetches nothing), played
  // only with motion and while it is seen.
  let near = false;
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

  let state = -1;
  let shown = -1;
  const setState = (next: number): void => {
    if (next === state) return;
    state = next;
    section.dataset.state = String(next);
  };
  const setShown = (count: number): void => {
    if (count === shown) return;
    shown = count;
    lines.forEach((el, i) => { el.classList.toggle('on', i < count); el.classList.toggle('now', i === count - 1); });
  };
  const still = (): void => {
    section.classList.add('ls-still');
    instant(section, () => { setState(0); setShown(3); });
    video.pause();
  };
  let raf = 0;
  const update = (): void => {
    raf = 0;
    if (section.classList.contains('ls-still')) return;
    const rect = track.getBoundingClientRect();
    const view = innerHeight;
    const range = rect.height - view;
    const sticky = range > view * 0.3;
    let progress: number;
    if (sticky) progress = Math.min(1, Math.max(0, -rect.top / range));
    else {
      // No room to hold the screen: the phone's own way through the screen brings the lines in.
      const box = phone.getBoundingClientRect();
      progress = Math.min(1, Math.max(0, (view * 0.8 - box.top) / Math.max(1, box.height * 0.9)));
    }
    const next = progress < 0.34 ? 0 : progress < 0.68 ? 1 : 2;
    setState(next);
    const arrived = sticky ? rect.top <= view * 0.25 : phone.getBoundingClientRect().top < view * 0.85;
    setShown(arrived ? next + 1 : 0);
  };
  const schedule = (): void => { if (!raf) raf = requestAnimationFrame(update); };

  const boot = (): void => {
    if (!section.isConnected) { requestAnimationFrame(boot); return; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { near = entries[entries.length - 1].isIntersecting; schedule(); }, { rootMargin: '200px 0px' }).observe(track);
      new IntersectionObserver(entries => { seen = entries[entries.length - 1].isIntersecting; sync(); }, { threshold: 0.25 }).observe(phone);
    } else { near = true; seen = true; dwelt = true; sync(); }
    document.addEventListener('visibilitychange', sync);
    // Pause motion holds the recording where it is, and it does not start again when the phone is seen; playing carries on.
    onMotionPause(sync);
    if (calm()) { still(); return; }
    instant(section, () => { setState(0); setShown(0); });
    addEventListener('scroll', () => { if (near) schedule(); }, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', event => { if (event.matches) still(); });
  };
  boot();
  return section;
}

/** Both sections, in order: the grid on paper, then the band of ink. */
export function sections(): HTMLElement {
  return h('div', { class: 'ls' }, grid(), ring(), counts(), band());
}
