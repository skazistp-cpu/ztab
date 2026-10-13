import { h } from '../dom.ts';

/*
 * The band's phone, drawn: a titanium edge, side buttons, a thin bezel, the island, and a screen that is a real
 * 390 × 844 page scaled to fit (its content is DOM, never a picture). On the screen: the status bar, the page, and
 * the wallet's Send sheet that slides over it. Everything on the screen is inert: a picture of a phone, not controls.
 */

const NS = 'http://www.w3.org/2000/svg';

/** An SVG element with its attributes and children. */
export function s(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

/** The screen's width in CSS points, the space the page is laid out in. */
export const SCREEN_W = 390;
/** Where the sheet's top edge rests (points from the top of the screen). */
export const SHEET_TOP = 200;

/** iOS's status bar's icons: the signal, Wi-Fi and the battery, drawn (the time is HTML text beside them). */
function statusBar(): SVGElement {
  return s(
    'svg',
    { class: 'wb-status', viewBox: `0 0 ${SCREEN_W} 54`, 'aria-hidden': 'true' },
    // The signal: four bars, each a little taller.
    s(
      'g',
      { fill: '#fff' },
      s('rect', { x: '289', y: '27.5', width: '3.2', height: '4.5', rx: '1' }),
      s('rect', { x: '293.7', y: '25', width: '3.2', height: '7', rx: '1' }),
      s('rect', { x: '298.4', y: '22.3', width: '3.2', height: '9.7', rx: '1' }),
      s('rect', { x: '303.1', y: '19.5', width: '3.2', height: '12.5', rx: '1' }),
    ),
    // Wi-Fi: three arcs and the dot.
    s(
      'g',
      { transform: 'translate(309.5 17) scale(0.74)', fill: 'none', stroke: '#fff', 'stroke-width': '2.6', 'stroke-linecap': 'round' },
      s('path', { d: 'M1.42 9a16 16 0 0 1 21.16 0' }),
      s('path', { d: 'M5 12.55a11 11 0 0 1 14.08 0' }),
      s('path', { d: 'M8.53 16.11a6 6 0 0 1 6.95 0' }),
      s('path', { d: 'M12 20h.01' }),
    ),
    // The battery, full.
    s(
      'g',
      {},
      s('rect', { x: '331.5', y: '20', width: '25', height: '12.5', rx: '3.8', fill: 'none', stroke: 'rgba(255,255,255,0.42)', 'stroke-width': '1' }),
      s('rect', { x: '333.5', y: '22', width: '21', height: '8.5', rx: '2', fill: '#fff' }),
      s('path', { d: 'M358 23.6v5.3a2.4 2.4 0 0 0 0-5.3z', fill: 'rgba(255,255,255,0.42)' }),
    ),
  );
}

export interface Field {
  readonly el: HTMLElement;
  readonly value: HTMLElement;
  readonly caret: HTMLElement;
}

export interface Sheet {
  readonly el: HTMLElement;
  readonly to: Field;
  readonly amount: Field;
  /** The amount's digits, one span each, for the roll into place. */
  readonly digits: HTMLElement[];
  readonly unit: HTMLElement;
  readonly note: Field;
  readonly review: HTMLElement;
}

function field(name: 'to' | 'amount' | 'note', label: string): Field {
  const value = h('span', { class: 'wb-val' });
  const caret = h('i', { class: 'wb-caret' });
  const el = h('div', { class: 'wb-field', 'data-f': name }, h('span', { class: 'wb-label' }, label), h('span', { class: 'wb-valrow' }, value, caret));
  return { el, value, caret };
}

/**
 * A wallet's Send sheet with no name on it: To, Amount and Note, and Review. The fields start empty; the story fills
 * them with what the request carries. Nothing on it ever says a payment was made.
 */
export function sendSheet(zec: string): Sheet {
  const to = field('to', 'To');
  const amount = field('amount', 'Amount');
  const note = field('note', 'Note');
  // Every span starts empty: the field holds nothing until the request fills it.
  const digits = [...zec].map(ch => h('span', { class: ch === '.' ? 'wb-dg wb-dot' : 'wb-dg' }));
  const unit = h('span', { class: 'wb-unit' });
  amount.value.append(...digits, unit);
  const review = h('span', { class: 'wb-review' }, 'Review');
  const el = h(
    'div',
    { class: 'wb-sheet' },
    h('i', { class: 'wb-grab' }),
    h('p', { class: 'wb-sheet-title' }, 'Send'),
    to.el,
    amount.el,
    note.el,
    review,
  );
  return { el, to, amount, digits, unit, note, review };
}

export interface Device {
  /** The 3D wrapper the story tilts. */
  readonly tilt: HTMLElement;
  readonly phone: HTMLElement;
  /** The screen, in page pixels: its width gives the fit's scale. */
  readonly screen: HTMLElement;
  /** The 390-point space the page and the sheet are laid out in. */
  readonly fit: HTMLElement;
  /** The page under the sheet: scales back as the sheet comes up. */
  readonly back: HTMLElement;
  readonly dim: HTMLElement;
  readonly glass: HTMLElement;
}

/** The phone around a page (`page` is placed under the status bar) and a sheet. */
export function device(label: string, page: HTMLElement, sheet: HTMLElement): Device {
  const dim = h('i', { class: 'wb-dim' });
  const back = h('div', { class: 'wb-back' }, h('div', { class: 'wb-pagepad' }, page), dim);
  const fit = h('div', { class: 'wb-fit' }, back, sheet, statusBar(), h('b', { class: 'wb-time' }, '9:41'), h('i', { class: 'wb-home' }), h('i', { class: 'wb-island' }));
  const glass = h('i', { class: 'wb-glass' });
  const screen = h('div', { class: 'wb-screen', 'aria-hidden': 'true' }, fit, glass);
  screen.inert = true;
  const phone = h(
    'div',
    { class: 'wb-phone', role: 'img', 'aria-label': label },
    h('i', { class: 'wb-sb wb-sb-action' }),
    h('i', { class: 'wb-sb wb-sb-up' }),
    h('i', { class: 'wb-sb wb-sb-down' }),
    h('i', { class: 'wb-sb wb-sb-power' }),
    h('div', { class: 'wb-bezel' }, screen),
  );
  const tilt = h('div', { class: 'wb-tilt' }, phone);
  return { tilt, phone, screen, fit, back, dim, glass };
}
