/** An item amount is its whole line price, shared equally by the selected people. */
export interface BillItem { name: string; amount: string; people: string[] }
export interface ItemAllocation { index:number; name:string; price:string; shares:Array<{id:string;amount:string}> }
export type ItemSplit =
  | { kind: 'error'; field: 'people' | 'items' | 'amount' | 'assignment' | 'tip' | 'total'; index?: number; message: string }
  | { kind: 'split'; allocations:ItemAllocation[]; subtotal: string; tip: string; total: string; shares: Array<{ id: string; subtotal: string; tip: string; total: string }> };
const LIMIT = 1_000_000_000_000n; // The engine's 10 billion fiat-unit limit, in cents.
const decimal = (text: string): bigint | undefined => {
  const s = text.trim();
  if (s.length > 14 || !/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(s)) return undefined;
  const [whole, fraction = ''] = s.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const money = (cents: bigint): string => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

/**
 * Integer cents only. Item remainders go in the displayed participant order.
 * Round the whole tip once (half up); apportion it by each person's item subtotal,
 * largest fractional remainder first, with participant order breaking ties.
 */
export function splitItems(people: string[], items: BillItem[], tip: string): ItemSplit {
  const fail = (field: Extract<ItemSplit, {kind: 'error'}>['field'], message: string, index?: number): ItemSplit =>
    ({kind: 'error', field, message, ...(index === undefined ? {} : {index})});
  if (people.length < 2 || people.length > 50 || new Set(people).size !== people.length || people.some(id => !id)) {
    return fail('people', 'Include yourself and between 1 and 49 other people.');
  }
  if (items.length < 1 || items.length > 100) return fail('items', 'Add between 1 and 100 bill items.');
  const percent = tip.trim() === '' ? 0n : decimal(tip);
  if (percent === undefined || percent > 10000n) return fail('tip', 'Write a tip from 0 to 100%, with at most two decimals.');
  const subtotals = people.map(() => 0n);
  const allocations:ItemAllocation[]=[];
  for (const [i, item] of items.entries()) {
    const amount = decimal(item.amount);
    if (amount === undefined || amount <= 0n || amount > LIMIT) {
      return fail('amount', 'Write this item’s price above zero with at most two decimals.', i);
    }
    const selected = new Set(item.people);
    if (!selected.size || selected.size !== item.people.length || item.people.some(id => !people.includes(id))) {
      return fail('assignment', 'Choose who shared this item. Remove any person who is no longer on the bill.', i);
    }
    const allocation:ItemAllocation={index:i,name:item.name.trim() || `Item ${i+1}`,price:money(amount),shares:[]};
    const divisor = BigInt(selected.size);
    let remainder = amount % divisor;
    people.forEach((id, j) => {
      if (selected.has(id)) {
        const part=amount / divisor + (remainder > 0n ? 1n : 0n);
        subtotals[j] += part;
        allocation.shares.push({id,amount:money(part)});
        if (remainder > 0n) remainder--;
      }
    });
    allocations.push(allocation);
  }
  const subtotal = subtotals.reduce((sum, n) => sum + n, 0n);
  const tipCents = (subtotal * percent + 5000n) / 10000n;
  const total = subtotal + tipCents;
  if (total > LIMIT) return fail('total', 'The total including tip must be at most 10,000,000,000.');
  const tips = subtotals.map(n => n * tipCents / subtotal);
  const left = tipCents - tips.reduce((sum, n) => sum + n, 0n);
  const ranked = subtotals.map((n, i) => ({i, remainder: n * tipCents % subtotal})).sort((a, b) =>
    a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < Number(left); i++) tips[ranked[i].i]++;
  return {kind: 'split', allocations, subtotal: money(subtotal), tip: money(tipCents), total: money(total),
    shares: people.map((id, i) => ({id, subtotal: money(subtotals[i]), tip: money(tips[i]), total: money(subtotals[i] + tips[i])}))};
}
