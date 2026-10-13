import { decodeShare, encodeShare, type ShareLink, type Network } from '../../../packages/engine/src/index.ts';
import { requestFor } from './pay.ts';

/** A bounded web envelope, not a new payment engine or ZIP-321 format. */
export const MAX_TABLE_FRAGMENT = 20_000;
export interface TableLink {
  kind: 'table';
  rows: Array<{share: ShareLink; fragment: string}>;
  zeroPeople: string[];
}
type Failure = {kind:'error'; error?:'amounts-disagree'};
const failure = ():Failure => ({kind:'error'});
const common = (s:ShareLink):string[] => [s.network,s.payee,s.label,s.from,s.rate.fiat,s.rate.fiatPerZec,s.rate.source,s.rate.observedAt,s.createdAt ?? '',s.memoBrand ?? 'Tab'];
const encode = (value:unknown):string => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for(const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
};
const strings = (v:unknown,n:number):v is string[] => Array.isArray(v) && v.length===n && v.every(x=>typeof x==='string');

export function encodeTable(fragments:string[],zeroPeople:string[]):{kind:'fragment';fragment:string}|Failure {
  if(fragments.length<1 || fragments.length+zeroPeople.length>49) return failure();
  const shares:ShareLink[]=[];
  for(const fragment of fragments){const d=decodeShare(fragment);if(d.kind!=='share')return failure();shares.push(d.share);}
  const shared=common(shares[0]);
  if(shares.some(s=>JSON.stringify(common(s))!==JSON.stringify(shared)))return failure();
  const fragment=(shares[0].memoBrand === 'Ztab' ? 'g2.' : 'g1.')+encode([shared.slice(0,9),shares.map(s=>[s.name,s.fiatShare,s.zatoshis]),zeroPeople]);
  return decodeTable(fragment).kind==='table'?{kind:'fragment',fragment}:failure();
}

/** All entries are validated before any name can be selected. No storage or network. */
export function decodeTable(fragment:string):TableLink|Failure {
  if(fragment.length>MAX_TABLE_FRAGMENT || !/^g[12]\.[A-Za-z0-9_-]+$/.test(fragment))return failure();
  try{
    const data=fragment.slice(3).replaceAll('-','+').replaceAll('_','/');
    const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
    const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!Array.isArray(v)||v.length!==3||!strings(v[0],9)||!Array.isArray(v[1])||!Array.isArray(v[2]))return failure();
    const [shared,entries,zeroPeople]=v;
    if(entries.length<1||entries.length+zeroPeople.length>49||zeroPeople.some(n=>typeof n!=='string'||[...n].length>40||!n.trim()))return failure();
    const [network,payee,label,from,fiat,fiatPerZec,source,observedAt,createdAt]=shared;
    const rows:TableLink['rows']=[];
    for(const row of entries){
      if(!strings(row,3))return failure();
      const [name,fiatShare,zatoshis]=row;
      const share:ShareLink={network:network as Network,payee,label,from,name,fiatShare,zatoshis,rate:{fiat,fiatPerZec,source,observedAt},...(createdAt?{createdAt}:{}),...(fragment.startsWith('g2.')?{memoBrand:'Ztab' as const}:{})};
      const e=encodeShare(share);
      if(e.kind!=='fragment')return e.kind==='error'&&e.error==='amounts-disagree'?{kind:'error',error:'amounts-disagree'}:failure();
      if(requestFor(share).kind!=='request')return failure();
      rows.push({share,fragment:e.fragment});
    }
    return {kind:'table',rows,zeroPeople:zeroPeople as string[]};
  }catch{return failure();}
}

/** The organiser's own ticks, one per paying row, kept in the link itself. */
const TICKS=/^[01]+$/;

export function readTableRoute(raw:string):{kind:'table-route';table:TableLink;fragment:string;view:'picker'|'qr'|number}|{kind:'table-route';table:TableLink;fragment:string;view:'mine';ticks:boolean[]}|Failure {
  if(raw.length>MAX_TABLE_FRAGMENT+60)return failure();
  const [fragment,selection,ticks,...rest]=raw.split('/');
  if(rest.length)return failure();
  const table=decodeTable(fragment);
  if(table.kind!=='table')return table;
  if(selection==='mine'){
    // No ticks yet, or exactly one mark for each paying row.
    if(ticks===undefined)return {kind:'table-route',table,fragment,view:'mine',ticks:table.rows.map(()=>false)};
    if(!TICKS.test(ticks)||ticks.length!==table.rows.length)return failure();
    return {kind:'table-route',table,fragment,view:'mine',ticks:[...ticks].map(mark=>mark==='1')};
  }
  if(ticks!==undefined)return failure();
  if(selection===undefined)return {kind:'table-route',table,fragment,view:'picker'};
  if(selection==='qr')return {kind:'table-route',table,fragment,view:'qr'};
  if(!/^(0|[1-9][0-9]?)$/.test(selection)||Number(selection)>=table.rows.length)return failure();
  return {kind:'table-route',table,fragment,view:Number(selection)};
}

/** The fragment of the organiser's page with these ticks written into it. */
export const mineFragment=(fragment:string,ticks:boolean[]):string=>
  `${fragment}/mine${ticks.some(Boolean)?'/'+ticks.map(tick=>tick?'1':'0').join(''):''}`;
