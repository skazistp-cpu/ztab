import { formatFiat } from './fiat.ts';
import { isUtcInstant } from './link.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Literal braces in a bill label must never become template instructions. */
export function tabMemoTemplate(purpose: string, brand: 'Tab' | 'Ztab' = 'Ztab'): string {
  const literal = (purpose || 'Bill').replace(/[{}]/g, brace => brace + brace);
  return `${literal} · {label} · {share} · {date} · ${brand}`;
}

/** Expand once: inserted names cannot themselves introduce template instructions. */
export function expandMemo(
  template: string, label: string, fiatShare: string, fiat: string, createdAt?: string,
): string | undefined {
  let valid = true;
  const memo = template.replace(/\{\{|\}\}|\{(label|share|date)\}/g, (token, field: string | undefined) => {
    if (token === '{{') return '{';
    if (token === '}}') return '}';
    if (field === 'label') return label;
    if (field === 'share') return formatFiat(fiatShare, fiat);
    if (createdAt === undefined || !isUtcInstant(createdAt)) {
      valid = false;
      return '';
    }
    const date = new Date(createdAt);
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  });
  return valid ? memo : undefined;
}
