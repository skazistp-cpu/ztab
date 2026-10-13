import {formatFiat} from './money.ts';
import type {ItemSplit} from './items.ts';
type Split=Extract<ItemSplit,{kind:'split'}>;

/** Explains the allocations already made by splitItems. Never divides money a second time. */
export function shareExplanation(split:Split,id:string,name:string,fiat:string):string {
 const share=split.shares.find(s=>s.id===id);
 if(!share)throw new Error('Unknown item participant');
 const money=(amount:string)=>formatFiat(amount,fiat);
 const rows=split.allocations.flatMap(item=>{
  const amount=item.shares.find(s=>s.id===id)?.amount;
  return amount===undefined?[]:[`${item.name} (${item.shares.length===1?'1 person':`shared by ${item.shares.length}`}): ${money(amount)} of ${money(item.price)}`];
 });
 return [name+' — share breakdown',...(rows.length?rows:['No items assigned.']),
  `Items: ${money(share.subtotal)}`,`Tip / service: ${money(share.tip)}`,`Total: ${money(share.total)}`,
  'Item cents follow the participant order; tip cents follow the largest fractional remainder. Wallet fees are separate.'].join('\n');
}
