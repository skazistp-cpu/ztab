import {h} from './dom.ts';
import {copyButton} from './pay.ts';
import {shareExplanation} from './item-breakdown.ts';
import type {ItemSplit} from './items.ts';

/** Organiser-only snapshot. Item details are not added to payment links or requests. */
export function itemBreakdownView(split:Extract<ItemSplit,{kind:'split'}>,names:string[],fiat:string):HTMLElement {
 const details=h('details',{class:'item-breakdowns'},h('summary',{},'How each share adds up'),
  h('p',{class:'note'},'These item details stay on your page unless you copy them. Payment links carry the total, not this breakdown.'));
 split.shares.forEach((share,i)=>{
  const raw=names[i] || `Person ${i}`;
  const name=names.filter(n=>n===raw).length>1?`${raw} (${i===0?'organiser':`person ${i}`})`:raw;
  const text=shareExplanation(split,share.id,name,fiat);
  const entry=h('details',{class:'item-breakdown'},h('summary',{},name),
   h('pre',{class:'breakdown-text'},text),copyButton('Copy breakdown',()=>text));
  details.append(entry);
 });
 return details;
}
