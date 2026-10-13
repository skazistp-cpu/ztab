import qrcode from 'qrcode-generator';
import { h, hang, fiatAmount } from './dom.ts';
import { formatFiat } from './money.ts';
import { copyButton, networkStrip } from './pay.ts';
import { encodeTable, type TableLink } from './table-link.ts';
import type { Tab } from './tab.ts';

export const TABLE_DISCLOSURE='Anyone with this table link can see everyone’s names and shares. Share it only with your table.';
const link=(fragment:string):string=>`${location.origin}${location.pathname}#${fragment}`;

/** Keep quiet zone at four modules and decline codes too dense for a phone display. */
function tableQr(url:string):HTMLElement|undefined {
  const qr=qrcode(0,'M');qr.addData(url,'Byte');
  try{qr.make();}catch{return undefined;}
  if(qr.getModuleCount()>97)return undefined;
  const holder=h('div',{class:'table-qr',role:'img','aria-label':'Table QR code: scan with your phone camera'});
  holder.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
  return holder;
}

export function tableInvite(tab:Extract<Tab,{kind:'tab'}>):HTMLElement|false {
  if(!tab.rows.length)return false;
  const encoded=encodeTable(tab.rows.map(r=>r.fragment),tab.zeroPeople);
  if(encoded.kind!=='fragment')return h('p',{class:'note'},'This table link could not be made. Use the individual links below.');
  return hang(h('section',{class:'card table-invite'},
    h('p',{class:'eyebrow'},'Together at the table'),
    h('h3',{},'One code for everyone'),
    h('p',{},'Show one QR. Each friend scans with their phone camera, chooses their name, then opens their own payment request.'),
    h('p',{class:'actions'},h('a',{class:'button primary',href:`#${encoded.fragment}/qr`},'Show Table QR'),h('a',{class:'button secondary',href:`#${encoded.fragment}`},'Open name picker')),
    h('p',{class:'note'},TABLE_DISCLOSURE),
  ));
}

export function tableCodeScreen(table:TableLink,fragment:string):HTMLElement {
  const first=table.rows[0].share,url=link(fragment),qr=tableQr(url);
  return hang(h('section',{class:'card table-code'},
    networkStrip(first.network),h('p',{class:'eyebrow'},first.label||'Your table'),
    h('h1',{},'Table QR code'),h('p',{},'Scan with your phone camera, then choose your name.'),
    qr ?? h('p',{class:'warning'},'This table is too large for a clear QR code on a phone. Copy the table link, or use the individual links from your bill.'),
    // Who can see the table is read before the link is copied.
    h('p',{class:'note'},TABLE_DISCLOSURE),
    h('p',{class:'actions'},copyButton('Copy table link',()=>url),h('a',{class:'button secondary',href:`#${fragment}`},'Open name picker')),
    h('p',{class:'table-nav'},h('a',{href:'#',class:'tap-link'},'Back to your bill')),
  ));
}

export function tablePicker(table:TableLink,fragment:string):HTMLElement {
  const first=table.rows[0].share;
  const names=[...table.rows.map(r=>r.share.name),...table.zeroPeople];
  const duplicates=new Set(names.filter((n,i)=>names.indexOf(n)!==i));
  // A row's number is shown only where it tells two rows with the same name apart.
  const rows=table.rows.map(({share},i)=>h('li',{},h('a',{class:'table-person',href:`#${fragment}/${i}`},
    h('span',{},h('strong',{},share.name||`Person ${i+1}`),share.name!==''&&duplicates.has(share.name)&&h('small',{},`Share ${i+1}`)),
    fiatAmount(formatFiat(share.fiatShare,share.rate.fiat)),h('span',{'aria-hidden':'true'},'→'),
  )));
  return hang(h('section',{class:'card table-picker'},
    networkStrip(first.network),h('p',{class:'eyebrow'},first.label||'Your table'),
    h('h1',{},'Choose your name'),h('p',{},`Paying ${first.from||'the organiser'}. Choose only your own name and check your amount on the next page.`),
    duplicates.size>0 && h('p',{class:'caution'},'Some names repeat. Check your share with the organiser before choosing.'),
    h('ul',{class:'table-people'},...rows),
    table.zeroPeople.length>0 && h('div',{class:'table-zero'},h('h2',{},'No payment needed'),...table.zeroPeople.map(name=>h('p',{},name))),
    h('p',{class:'note'},TABLE_DISCLOSURE),
    h('p',{class:'note'},'Choosing a name does not mark a share as paid. Check payments in your wallet.'),
  ));
}
