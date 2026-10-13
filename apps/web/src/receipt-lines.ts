/** Pasted receipt text is untrusted input. Every nonempty line remains visible and unselected. */
export interface ReceiptRow {raw:string;name:string;amount:string;selected:boolean;caution:boolean}
export interface ConfirmRow {name:string;amount:string;selected:boolean}
export function receiptLines(text:string):{kind:'rows';rows:ReceiptRow[]}|{kind:'error';message:string} {
 const raw=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(text.length>20000||raw.length>200)return {kind:'error',message:'Too much receipt text. Paste fewer than 201 lines and at most 20,000 characters.'};
 return {kind:'rows',rows:raw.map(line=>{
  const m=/^(.+?)\s+(\d+(?:[.,]\d{2})?)$/.exec(line);
  const unambiguous=m&&!/[\d][.,]\d{2}|[\d][,.]\d{3}|\d\s*[x×*]/i.test(m[1])&&!/^\d+$/.test(m[1]);
  return {raw:line,name:unambiguous?m[1]:line,amount:unambiguous?Number(m[2].replace(',','.')).toFixed(2):'',selected:false,
   caution:/\b(total|sub\s*total|tax|vat|gst|sst|tip|service|cash|change|discount|round|balance|payment|tender|visa|mastercard)\b/i.test(line)};
 })};
}
export function confirmedItems(rows:ConfirmRow[],existing:number):{kind:'items';items:Array<{name:string;amount:string}>}|{kind:'error';message:string} {
 const chosen=rows.filter(x=>x.selected);
 if(!Number.isInteger(existing)||existing<0||existing+chosen.length>100)return {kind:'error',message:'A bill can have at most 100 items. Nothing was added.'};
 const items=[];
 for(const r of chosen){
  const name=r.name.trim(),a=r.amount.trim();
  if(!name||name.length>80||!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(a)||Number(a)<=0||Number(a)>1e10)return {kind:'error',message:'Check every selected name and price. Use a positive price with at most two decimals (for example 12.50). Nothing was added.'};
  items.push({name,amount:a});
 }
 return {kind:'items',items};
}
