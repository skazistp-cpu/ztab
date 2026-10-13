import {h} from './dom.ts';
import {receiptLines, confirmedItems} from './receipt-lines.ts';

/** Explicit text input only: no clipboard read, file input, OCR, storage or network. */
export function receiptPaste(capacity:()=>number,append:(items:Array<{name:string;amount:string}>)=>void) {
 const open=h('button',{type:'button',class:'secondary'},'Paste bill lines');
 const panel=h('section',{class:'receipt-paste','aria-label':'Paste bill lines'});panel.hidden=true;
 const status=h('p',{id:'receipt-status',role:'status','aria-live':'polite',class:'note'},'Paste your text, then review each line.');
 const text=h('textarea',{id:'receipt-text',rows:'6',placeholder:'Steak 32.00\nSalad 11,50\nWine 28.00','aria-describedby':'receipt-status'});
 const review=h('button',{type:'button',class:'secondary'},'Review text');
 const rows=h('div',{class:'receipt-review'});
 const apply=h('button',{type:'button'},'Add selected items');apply.hidden=true;
 const cancel=h('button',{type:'button',class:'secondary'},'Cancel import');
 panel.append(h('h3',{},'Check the bill before adding items'),
  h('p',{class:'note'},'Paste an e-receipt or text copied from a photo with your phone’s text tools. Ztab does not scan the photo. Check every name and price; totals, tax and tip are not extra items. Prices use the currency selected above.'),
  h('label',{class:'field',for:text.id},h('span',{},'Bill text'),text),status,review,rows,h('div',{class:'actions'},apply,cancel));
 const root=h('div',{class:'receipt-paste-wrap'},open,panel);
 let fields:Array<{selected:HTMLInputElement;name:HTMLInputElement;amount:HTMLInputElement}>=[];
 const clearReview=()=>{rows.replaceChildren();fields=[];apply.hidden=true;};
 const reset=()=>{text.value='';clearReview();panel.hidden=true;open.hidden=false;window.removeEventListener('hashchange',reset);};
 open.addEventListener('click',()=>{panel.hidden=false;open.hidden=true;status.textContent='Paste your text, then review each line.';window.addEventListener('hashchange',reset);text.focus();});
 cancel.addEventListener('click',()=>{reset();open.focus();});
 text.addEventListener('input',()=>{clearReview();status.textContent='Text changed. Review it again before adding items.';});
 review.addEventListener('click',()=>{
  clearReview();const parsed=receiptLines(text.value);
  if(parsed.kind==='error'){status.textContent=parsed.message;return;}
  if(!parsed.rows.length){status.textContent='Paste at least one bill line first.';return;}
  fields=parsed.rows.map((r,i)=>{
   const selected=h('input',{type:'checkbox','aria-label':`Include receipt line ${i+1}`});
   const name=h('input',{type:'text',value:r.name,maxlength:'80','aria-label':`Receipt line ${i+1} item`,'aria-describedby':'receipt-status'});
   const amount=h('input',{type:'text',inputmode:'decimal',value:r.amount,'aria-label':`Receipt line ${i+1} price`,'aria-describedby':'receipt-status'});
   rows.append(h('fieldset',{class:'receipt-row'},h('legend',{},`Line ${i+1}`),h('p',{class:'receipt-raw'},r.raw),
    r.caution&&h('p',{class:'note'},'Possible total, tax, payment or adjustment — check before including.'),
    h('label',{class:'receipt-include'},selected,'Include this item'),
    h('label',{class:'field'},h('span',{},'Item'),name),h('label',{class:'field'},h('span',{},'Price'),amount)));
   return {selected,name,amount};
  });
  apply.hidden=false;status.textContent=`Review ${fields.length} lines. Nothing is selected or added yet. Combine multi-line names and prices by hand if needed.`;
 });
 apply.addEventListener('click',()=>{
  const result=confirmedItems(fields.map(f=>({selected:f.selected.checked,name:f.name.value,amount:f.amount.value})),capacity());
  if(result.kind==='error'){status.textContent=result.message;status.scrollIntoView({block:'nearest'});return;}
  if(!result.items.length){status.textContent='Select the items you checked first. Nothing was added.';return;}
  append(result.items);reset();open.focus();
 });
 return root;
}
