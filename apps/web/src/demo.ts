import { checkAddress } from '../../../packages/engine/src/index.ts';
import { splitItems, type BillItem } from './items.ts';
import { makeTab } from './tab.ts';
import { decodeTable, encodeTable } from './table-link.ts';

export interface DemoReceiver { version: 1; network: 'test'; address: string; viewingKey: string; birthday: number }
export interface DemoSession { createdAt: string; id: string; marks: boolean[]; receiver?: string }
/** The intentionally public receiver is a deployment artifact, never a user's wallet or a key in Git. */
export function readDemoReceiver(value: unknown): DemoReceiver | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'address,birthday,network,version,viewingKey' || v.version !== 1 || v.network !== 'test') return;
  if (typeof v.address !== 'string' || typeof v.viewingKey !== 'string' || v.viewingKey.length > 2048 || !/^(uviewtest1|uvftest1)[a-z0-9]{50,}$/.test(v.viewingKey)) return;
  const address = checkAddress(v.address);
  if (address.kind !== 'address' || address.network !== 'test' || address.addressKind !== 'unified') return;
  if (!Number.isSafeInteger(v.birthday) || (v.birthday as number) < 1 || (v.birthday as number) > 0x7fffffff) return;
  return v as unknown as DemoReceiver;
}
export function readDemoSession(fragment: string): DemoSession | undefined {
  const m = /^demo\/(\d{13})\/([a-f0-9]{16})\/([01]{2})(?:\/([a-f0-9]{32}))?$/.exec(fragment);
  if (!m) return;
  const date = new Date(Number(m[1]));
  if (date.getUTCFullYear() < 2020 || date.getUTCFullYear() > 2100) return;
  return { createdAt: date.toISOString(), id: m[2], marks: [...m[3]].map(n => n === '1'), ...(m[4] ? { receiver: m[4] } : {}) };
}
export const demoFragment = (s: DemoSession): string => `demo/${Date.parse(s.createdAt)}/${s.id}/${s.marks.map(b => b ? '1' : '0').join('')}${s.receiver ? '/'+s.receiver : ''}`;
export const DEMO_ITEMS: BillItem[] = [
  { name: 'Steak', amount: '32.00', people: ['Ana'] },
  { name: 'Salad', amount: '11.50', people: ['Ben'] },
  { name: 'Wine', amount: '28.00', people: ['Lena', 'Ana', 'Ben'] },
];
export function makeDemo(receiver: DemoReceiver, session: DemoSession) {
  const items = splitItems(['Lena', 'Ana', 'Ben'], DEMO_ITEMS, '10');
  if (items.kind !== 'split') throw new Error('sample items');
  const tab = makeTab({ createdAt: session.createdAt, itemized: true, from: 'Ztab public testnet demo', label: `Demo ${session.id}`, payee: receiver.address,
    fiat: 'USD', total: items.total, ownShare: items.shares[0].total,
    people: items.shares.slice(1).map(p => ({ name: p.id, amount: p.total })),
    rate: { fiatPerZec: '1000', source: 'Demo example, not a market rate', observedAt: session.createdAt } });
  if (tab.kind !== 'tab' || tab.network !== 'test') throw new Error('sample request');
  const encoded = encodeTable(tab.rows.map(r => r.fragment), []);
  if (encoded.kind !== 'fragment') throw new Error('sample table');
  const table = decodeTable(encoded.fragment);
  if (table.kind !== 'table') throw new Error('sample table');
  return { tab, table, items, tableFragment: encoded.fragment };
}
