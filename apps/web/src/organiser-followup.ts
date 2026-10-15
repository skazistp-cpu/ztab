import { zatoshisToZec } from '../../../packages/engine/src/index.ts';
import { formatFiat } from './money.ts';
import type { TableLink } from './table-link.ts';

/** A message to review, not a statement that an unticked share is unpaid. */
export function followupText(table: TableLink, marks: readonly boolean[], base: string): string {
  const pending = table.rows.flatMap((row, index) => marks[index] ? [] : [{ row, index }]);
  if (!pending.length) return '';
  const first = table.rows[0].share;
  // Copy only individual pay links; never the organiser fragment or URL query data.
  const url = new URL(base);
  const site = `${url.origin}${url.pathname}`;
  return [
    `${first.label || 'Your tab'} — share requests to check`,
    ...(first.network === 'test' ? ['Testnet: not real ZEC'] : first.network === 'regtest' ? ['Regtest: not real ZEC'] : []),
    "These shares are not ticked in the organiser's own record. That does not confirm whether a payment was made.",
    'If you already paid, check with the organiser before paying again.',
    '',
    ...pending.flatMap(({row: {share, fragment}, index}) => [
      `${index + 1}. ${share.name || `Person ${index + 1}`} — ${formatFiat(share.fiatShare, share.rate.fiat)} · ${zatoshisToZec(BigInt(share.zatoshis))} ZEC`,
      `${site}#${fragment}`,
      '',
    ]),
    'Ztab',
  ].join('\n');
}
