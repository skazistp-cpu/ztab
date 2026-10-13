import { receiptPaste } from './receipt-paste.ts';
import { h, row } from './dom.ts';
import { formatFiat } from './money.ts';
import { splitItems, type ItemSplit } from './items.ts';

export interface ItemPerson { id: string; name: string }
/** Local form state only. The bill and assignments never enter storage or a request. */
export function itemEditor(onChange: () => void) {
  let people: ItemPerson[] = [];
  let fiat = 'USD';
  let next = 1;
  let validationAttempted = false;
  // A line is touched once its price box has been left; only then are its own errors shown, or after Next.
  const lines: Array<{el: HTMLElement; name: HTMLInputElement; price: HTMLInputElement; assigned: Set<string>; picks: HTMLElement; touched: boolean}> = [];
  const list = h('div', {class: 'bill-items'});
  const totals = h('div', {class: 'item-totals', 'aria-live': 'polite', 'aria-atomic': 'true'});
  const tip = h('input', {type: 'text', inputmode: 'decimal', value: '0', id: 'item-tip'});
  const add = h('button', {type: 'button', class: 'secondary'}, 'Add an item');
  const root = h('section', {class: 'group item-editor'}, h('h2', {class: 'eyebrow'}, 'Bill items'),
    h('p', {class: 'note'}, 'Enter each line’s full price, then choose who shared it.'), list,
    h('p', {class: 'actions'}, add),
    h('label', {class: 'field', for: 'item-tip'}, h('span', {}, 'Tip or service (%)'), tip,
      h('small', {}, 'Added to the items total, in proportion to each person’s share. Use 0 if already included.')),
    totals,
    h('details', {class: 'rounding'}, h('summary', {}, 'How item totals are rounded'),
      h('p', {}, 'Each item is divided in cents. Leftover cents go in the order people appear above. The tip is rounded once to the nearest cent, half up, then divided by each person’s item subtotal. Largest fractional remainders come first; ties follow the same person order.')));
  root.hidden = true;
  const calculate = (): ItemSplit => splitItems(people.map(p => p.id), lines.map(line => ({name: line.name.value, amount: line.price.value, people: [...line.assigned]})), tip.value);
  const orphaned = (line: typeof lines[number]): boolean => [...line.assigned].some(id => !people.some(person => person.id === id));
  const ready = (line: typeof lines[number]): boolean => line.price.value.trim() !== '' && line.assigned.size > 0 && !orphaned(line);
  const refreshTotals = (): void => {
    let result = calculate();
    if (result.kind === 'error') {
      const line = result.index === undefined ? undefined : lines[result.index];
      // An error is said once its line's price box has been left, after Next, or when a person on it was removed.
      const due = lines.some(orphaned) || (line ? line.touched : validationAttempted || result.field === 'tip');
      // Until then the running totals stay, worked out from the lines that are complete so far.
      const complete = lines.filter(ready);
      const partial = !due && complete.length > 0
        ? splitItems(people.map(p => p.id), complete.map(l => ({name: l.name.value, amount: l.price.value, people: [...l.assigned]})), tip.value)
        : undefined;
      if (partial?.kind !== 'split') {
        totals.hidden = !due;
        totals.replaceChildren(...(due ? [h('p', {}, result.message)] : []));
        return;
      }
      result = partial;
    }
    totals.hidden = false;
    totals.replaceChildren(
      row('Items', formatFiat(result.subtotal, fiat)), row('Tip / service', formatFiat(result.tip, fiat)),
      h('p', {class:'item-grand-total'}, h('span',{},'Total'), h('strong',{},formatFiat(result.total,fiat))),
      h('h3',{},'Each person pays'),
      ...result.shares.map(share => row(people.find(p => p.id === share.id)?.name ?? share.id, formatFiat(share.total,fiat))),
    );
  };
  const changed = (): void => { onChange(); refreshTotals(); };
  const renderPicks = (line: typeof lines[number]): void => {
    const orphaned = [...line.assigned].filter(id => !people.some(p => p.id === id));
    const choices = [...people, ...orphaned.map(id => ({id, name: 'Removed person — unassign'}))];
    line.picks.replaceChildren(...choices.map(person => {
      const check = h('input', {type:'checkbox', value:person.id});
      check.checked = line.assigned.has(person.id);
      check.addEventListener('change', () => {
        if(check.checked) line.assigned.add(person.id); else line.assigned.delete(person.id);
        // Remove an orphan only after the user has explicitly cleared it.
        if(orphaned.includes(person.id)) {
          renderPicks(line);
          line.picks.querySelector<HTMLInputElement>('input')?.focus();
        }
        changed();
      });
      return h('label', {class:'item-person'}, check, h('span',{},person.name));
    }));
  };
  const renumber = (): void => {
    lines.forEach((line, i) => {
      const n = i+1;
      line.el.querySelector('legend')!.textContent = `Item ${n}`;
      line.name.setAttribute('aria-label',`Item ${n} name`);
      line.price.setAttribute('aria-label',`Item ${n} price`);
      line.el.querySelector('.remove')!.setAttribute('aria-label',`Remove item ${n}`);
    });
    add.disabled = lines.length >= 100;
  };
  const addItem = (focus: boolean, item?:{name:string;amount:string}): void => {
    if(lines.length >= 100) return;
    const id=next++;
    const name=h('input',{type:'text',placeholder:'e.g. Wine',maxlength:'80',id:`item-name-${id}`});
    const price=h('input',{type:'text',inputmode:'decimal',placeholder:'28.00',id:`item-price-${id}`});
    if(item){name.value=item.name;price.value=item.amount;}
    const picks=h('div',{class:'item-picks'});
    const remove=h('button',{type:'button',class:'secondary remove'},'×');
    const all=h('button',{type:'button',class:'secondary item-all'},'Everyone');
    const el=h('fieldset',{class:'bill-item'},h('legend',{},''),
      h('div',{class:'item-fields'},
        h('label',{class:'field',for:name.id},h('span',{},'Item'),name),
        h('label',{class:'field',for:price.id},h('span',{},'Price'),price),remove),
      h('div',{class:'item-assignment-heading'},h('span',{},'Who shared it?'),all),picks);
    const line={el,name,price,picks,assigned:new Set<string>(),touched:false};
    all.addEventListener('click',()=>{
      // Explicitly selecting Everyone replaces any removed-person assignment too.
      line.assigned=new Set(people.map(p=>p.id)); renderPicks(line); changed();
    });
    remove.addEventListener('click',()=>{
      const index=lines.indexOf(line); lines.splice(index,1); el.remove(); renumber(); changed();
      (lines[index]?.name ?? lines[index-1]?.name ?? add).focus();
    });
    name.addEventListener('input',changed); price.addEventListener('input',changed);
    price.addEventListener('blur',()=>{ if(!line.touched){ line.touched=true; refreshTotals(); } });
    lines.push(line); list.append(el); renderPicks(line); renumber();
    if(focus) {
      changed();
      // The new item comes fully into view, clear of anything fixed at the bottom of the screen (see its scroll margin).
      name.focus({preventScroll:true});
      el.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
  };
  add.addEventListener('click',()=>addItem(true));
  tip.addEventListener('input',changed);
  addItem(false);
  const untouched = () => lines.length === 1 && !lines[0].name.value && !lines[0].price.value && !lines[0].assigned.size;
  const paste = receiptPaste(() => untouched() ? 0 : lines.length, items => {
    if(untouched()){lines[0].el.remove();lines.splice(0,1);}
    for(const item of items)addItem(false,item);
    changed();
  });
  list.before(paste);
  return {
    element:root,
    validate(): ItemSplit {
      validationAttempted = true;
      // Every line there now has been checked; a line added afterwards starts quiet again.
      for (const line of lines) line.touched = true;
      refreshTotals();
      return calculate();
    },
    /** The split as it stands, for a live preview: nothing is marked or shown as an error. */
    peek(): ItemSplit {
      return calculate();
    },
    update(nextPeople: ItemPerson[], currency: string) {
      people=nextPeople; fiat=currency;
      for(const line of lines) renderPicks(line);
      refreshTotals();
    },
    errorHome(error: Extract<ItemSplit,{kind:'error'}>): {anchor:HTMLElement; control:HTMLElement} {
      const line=error.index === undefined ? undefined : lines[error.index];
      if(line) return {anchor:line.el,control:error.field==='amount' ? line.price : (line.picks.querySelector<HTMLInputElement>('input') ?? line.name)};
      return error.field==='tip' ? {anchor:tip.closest<HTMLElement>('.field')!,control:tip} : {anchor:totals,control:add};
    },
  };
}
