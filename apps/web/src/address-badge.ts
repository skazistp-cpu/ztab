import { checkAddress } from '../../../packages/engine/src/index.ts';

/**
 * What kind of address was typed, said plainly beside the field.
 * It names the kind of address and nothing else. How a payment is made is the payer's
 * wallet's choice, so no badge says "private" or "shielded payment".
 */
export type AddressBadge =
  | { tone: 'shielded' | 'public'; label: string; detail: string }
  | undefined;

/** The sentence the results and the pay page already give for a public address. */
export const PUBLIC_ADDRESS = 'This address is public. Anyone who sees a payment to it can see the amount.';

export function addressBadge(text: string): AddressBadge {
  const address = text.trim();
  if (address === '') {
    return undefined;
  }
  const checked = checkAddress(address);
  // An address the engine refuses gets no badge; it is reported when the links are made.
  if (checked.kind !== 'address') {
    return undefined;
  }
  switch (checked.addressKind) {
    case 'sapling':
      return { tone: 'shielded', label: 'Shielded address', detail: '' };
    case 'unified':
      return { tone: 'shielded', label: 'Unified address', detail: '' };
    case 'transparent':
      return { tone: 'public', label: 'Transparent address', detail: PUBLIC_ADDRESS };
    case 'tex':
      return { tone: 'public', label: 'Transparent address (TEX)', detail: PUBLIC_ADDRESS };
  }
}
