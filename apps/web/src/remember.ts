/**
 * What a person asked Tab to remember on this device: their own address and the names they used.
 * Only the make screen uses this. The pay screen never reads or writes it.
 */
export type Remembered = { address: string; names: string[] };

export const REMEMBER_KEY = 'tab.remember.v1';
const MAX_NAMES = 30;
const MAX_NAME_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 512;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Stands in for a storage the browser will not hand over: every call fails, so nothing is ever assumed about it. */
const REFUSED: Store = {
  getItem: () => {
    throw new Error('storage refused');
  },
  setItem: () => {
    throw new Error('storage refused');
  },
  removeItem: () => {
    throw new Error('storage refused');
  },
};

/**
 * The storage of a page: the real one, null where the browser has none at all,
 * or a stand-in that always fails where reaching for it is refused.
 * A refusal is not the same as having none: something may still be kept behind it.
 */
export function storeOf(host: { localStorage?: Store | null }): Store | null {
  try {
    return host.localStorage ?? null;
  } catch {
    return REFUSED;
  }
}

const deviceStore = (): Store | null => storeOf(globalThis as { localStorage?: Store | null });

const tidyNames = (names: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (typeof name !== 'string') {
      continue;
    }
    const clean = name.trim().slice(0, MAX_NAME_LENGTH);
    const key = clean.toLowerCase();
    if (clean === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(clean);
  }
  return out.slice(0, MAX_NAMES);
};

/**
 * What is on this device, as far as it can be told:
 * nothing, a record, something under Tab's key that cannot be read, or unknown because the browser refused the read.
 * A refused read is never taken to mean that nothing is kept.
 */
export type Kept =
  | { kind: 'none' }
  | { kind: 'kept'; record: Remembered }
  | { kind: 'unreadable' }
  | { kind: 'unknown' };

export function look(store: Store | null = deviceStore()): Kept {
  if (!store) {
    return { kind: 'none' };
  }
  let raw: string | null;
  try {
    raw = store.getItem(REMEMBER_KEY);
  } catch {
    return { kind: 'unknown' };
  }
  if (raw === null) {
    return { kind: 'none' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const { address, names } = parsed as { address?: unknown; names?: unknown };
      if (typeof address === 'string' && address !== '' && address.length <= MAX_ADDRESS_LENGTH && !/\s/.test(address)) {
        return { kind: 'kept', record: { address, names: Array.isArray(names) ? tidyNames(names) : [] } };
      }
    }
  } catch {
    // Falls through: something is there, and it is not a record.
  }
  return { kind: 'unreadable' };
}

/** The record, when there is one that can be read. */
export function recall(store: Store | null = deviceStore()): Remembered | undefined {
  const kept = look(store);
  return kept.kind === 'kept' ? kept.record : undefined;
}

/** Remembers the address and adds the names to those already kept, newest first. True when it was written. */
export function remember(address: string, names: string[], store: Store | null = deviceStore()): boolean {
  try {
    if (!store || address === '' || address.length > MAX_ADDRESS_LENGTH) {
      return false;
    }
    const kept = recall(store)?.names ?? [];
    store.setItem(REMEMBER_KEY, JSON.stringify({ address, names: tidyNames([...names, ...kept]) }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes everything Tab kept on this device. True only when a read afterwards found nothing,
 * or when the browser has no storage at all. A refused read never counts as gone.
 */
export function forget(store: Store | null = deviceStore()): boolean {
  if (!store) {
    return true;
  }
  try {
    store.removeItem(REMEMBER_KEY);
  } catch {
    // The read below decides: nothing may have been there to remove.
  }
  try {
    return store.getItem(REMEMBER_KEY) === null;
  } catch {
    return false;
  }
}

/** The two ends of an address, for showing which one is meant without printing all of it. */
export const addressEnds = (address: string): string =>
  address.length > 24 ? `${address.slice(0, 8)}…${address.slice(-8)}` : address;
