type Child = Node | string | undefined | false;

/** Builds an element. Text is always set as text, never parsed as markup. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  for (const child of children) {
    if (child) {
      el.append(child);
    }
  }
  return el;
}

/** A label, a dotted leader and a figure, as on a printed bill. */
export const row = (label: string, figure: string | Node): HTMLElement =>
  h('p', { class: 'row' }, h('span', {}, label), h('i', { 'aria-hidden': 'true' }), h('span', {}, figure));

/** A display amount such as "$68.66", with the currency sign set small beside the figures. */
export const fiatAmount = (text: string): HTMLElement => {
  const sign = /^[^\d]+/.exec(text)?.[0] ?? '';
  return h('span', { class: 'amount' }, sign && h('span', { class: 'cur' }, sign), text.slice(sign.length));
};

/**
 * A ZEC figure with its decimals in groups, 0.01 845 825, so it can be read at a glance.
 * The gaps are spacing only: the text is still the exact figure, for copying and for screen readers.
 */
export const zecFigure = (zec: string): HTMLElement => {
  const [whole, decimals = ''] = zec.split('.');
  const groups = [decimals.slice(0, 2), decimals.slice(2, 5), decimals.slice(5)].filter(Boolean);
  return h(
    'span',
    { class: 'zec' },
    decimals ? `${whole}.${groups[0]}` : whole,
    ...groups.slice(1).map(group => h('span', { class: 'zg' }, group)),
    ' ZEC',
  );
};

/** An address in groups of four, its first and last eight characters set darker so the ends can be checked. */
export const addressBlock = (address: string): HTMLElement => {
  const fours = (part: string): string[] => part.match(/.{1,4}/g) ?? [];
  if (address.length <= 24) {
    return h('p', { class: 'address' }, ...fours(address).map(group => h('b', {}, group)));
  }
  return h(
    'p',
    { class: 'address' },
    ...fours(address.slice(0, 8)).map(group => h('b', {}, group)),
    ...fours(address.slice(8, -8)).map(group => h('span', {}, group)),
    ...fours(address.slice(-8)).map(group => h('b', {}, group)),
  );
};

/** A card with its shadow and the short gold line at its top edge. */
export const hang = (card: HTMLElement, order = 0): HTMLElement => {
  const el = h('div', { class: 'hang' }, h('i', { class: 'rail', 'aria-hidden': 'true' }), card);
  // The wait is capped, so the last card of a long tab is not kept back for seconds.
  el.style.setProperty('--i', String(Math.min(order, 5)));
  return el;
};
