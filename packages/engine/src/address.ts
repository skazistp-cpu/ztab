import { bech32, bech32m, createBase58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2';

export type Network = 'main' | 'test' | 'regtest';
export type AddressKind = 'transparent' | 'sapling' | 'unified' | 'tex';

export type AddressCheck =
  | { kind: 'address'; addressKind: AddressKind; network: Network }
  | { kind: 'error'; reason: 'sprout' | 'unrecognised' | 'checksum' | 'length' };

const base58check = createBase58check(sha256);

// Two-byte version prefixes of base58check Zcash addresses.
const BASE58: Record<string, { network: Network; sprout?: true }> = {
  '1cb8': { network: 'main' }, // t1, P2PKH
  '1cbd': { network: 'main' }, // t3, P2SH
  '1d25': { network: 'test' }, // tm, P2PKH (also regtest)
  '1cba': { network: 'test' }, // t2, P2SH (also regtest)
  '169a': { network: 'main', sprout: true }, // zc
  '16b6': { network: 'test', sprout: true }, // zt
};

const SAPLING: Record<string, Network> = {
  zs: 'main',
  ztestsapling: 'test',
  zregtestsapling: 'regtest',
};
const UNIFIED: Record<string, Network> = {
  u: 'main',
  utest: 'test',
  uregtest: 'regtest',
};
const TEX: Record<string, Network> = {
  tex: 'main',
  textest: 'test',
  texregtest: 'regtest',
};

// A unified address holds at least one 43-byte shielded receiver, its type and
// length bytes, and 16 bytes of padding.
const UNIFIED_MIN_BYTES = 61;

// A plain `in` would also match inherited names such as "constructor".
const has = (table: Record<string, Network>, hrp: string): boolean =>
  Object.hasOwn(table, hrp);

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/**
 * Checks an address's prefix, network, checksum and length. It does not decode
 * a unified address's receivers, so "checksum-verified" is the claim, not
 * "fully validated".
 */
export function checkAddress(address: string): AddressCheck {
  const sep = address.lastIndexOf('1');
  const hrp = sep > 0 ? address.slice(0, sep).toLowerCase() : '';

  if (has(SAPLING, hrp)) {
    try {
      const { words } = bech32.decode(address as `${string}1${string}`, 200);
      return bech32.fromWords(words).length === 43
        ? { kind: 'address', addressKind: 'sapling', network: SAPLING[hrp] }
        : { kind: 'error', reason: 'length' };
    } catch {
      return { kind: 'error', reason: 'checksum' };
    }
  }
  if (has(UNIFIED, hrp) || has(TEX, hrp)) {
    try {
      const { words } = bech32m.decode(address as `${string}1${string}`, 2000);
      if (has(TEX, hrp)) {
        return bech32m.fromWords(words).length === 20
          ? { kind: 'address', addressKind: 'tex', network: TEX[hrp] }
          : { kind: 'error', reason: 'length' };
      }
      return bech32m.fromWords(words).length >= UNIFIED_MIN_BYTES
        ? { kind: 'address', addressKind: 'unified', network: UNIFIED[hrp] }
        : { kind: 'error', reason: 'length' };
    } catch {
      return { kind: 'error', reason: 'checksum' };
    }
  }
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
    let payload: Uint8Array;
    try {
      payload = base58check.decode(address);
    } catch {
      return { kind: 'error', reason: 'checksum' };
    }
    const prefix = hex(payload.slice(0, 2));
    if (!Object.hasOwn(BASE58, prefix)) {
      return { kind: 'error', reason: 'unrecognised' };
    }
    const version = BASE58[prefix];
    if (version.sprout) {
      return { kind: 'error', reason: 'sprout' };
    }
    return payload.length === 22
      ? { kind: 'address', addressKind: 'transparent', network: version.network }
      : { kind: 'error', reason: 'length' };
  }
  return { kind: 'error', reason: 'unrecognised' };
}

/** Transparent and TEX recipients cannot receive a memo. */
export const canReceiveMemo = (kind: AddressKind): boolean =>
  kind === 'sapling' || kind === 'unified';

/** Regtest reuses the testnet prefixes for transparent addresses only. */
export const onNetwork = (
  found: Network,
  wanted: Network,
  kind: AddressKind,
): boolean =>
  found === wanted ||
  (wanted === 'regtest' && found === 'test' && kind === 'transparent');
