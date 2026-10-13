import { zatoshisToZec } from '../../../packages/engine/src/index.ts';
import { h } from './dom.ts';
import { sortFound, type Asked } from './find/match.ts';
import type { Finder, DemoExample } from './find/wire.ts';

type Network = 'main' | 'test' | 'regtest';

/**
 * The public light-wallet server the page asks, and only after the organiser presses the button.
 * Testnet only until one mainnet payment has been found the same way.
 */
export const FINDER_SERVER: Partial<Record<Network, { url: string; host: string; operator: string }>> = {
  test: { url: 'https://zcash-testnet.chainsafe.dev', host: 'zcash-testnet.chainsafe.dev', operator: 'ChainSafe' },
};
/** The check looks back two days at most, by the clock: blocks come at very different rates on different networks. */
export const FINDER_LOOKBACK_SECONDS = 2 * 24 * 60 * 60;
/**
 * A bound on the blocks asked for, whatever their times say. Two days are about 2,300 blocks on mainnet (75 seconds
 * apart) and about 7,000 on today's testnet (25 seconds apart, measured 12 October 2026).
 */
export const FINDER_MAX_BLOCKS = 10_000;

/** From when to look, in Unix seconds: ten minutes before the tab was made, and never more than two days back. */
export function lookSince(createdAt: string | undefined, nowSeconds: number): number {
  const floor = nowSeconds - FINDER_LOOKBACK_SECONDS;
  const made = createdAt === undefined ? NaN : Math.floor(Date.parse(createdAt) / 1000) - 600;
  return Number.isFinite(made) ? Math.max(made, floor) : floor;
}

export const FINDER_HEADING = 'Check payments with a viewing key · testnet only for now';
export const finderExplained = (host: string, operator: string): [string, string][] => [
  ['What you paste.', 'A viewing key from your wallet. It can see that wallet’s payments. It cannot spend.'],
  ['Where it goes.', 'Nowhere. The key stays in this page on this device. It is not sent, not put in the link and not saved, and it is forgotten when you leave or close this page.'],
  ['Who else is involved.', `To look for payments, this page asks a public Zcash server run by ${operator} (${host}) for recent blocks and for the transactions that are yours. That server can see your network address, which blocks were asked for and which transactions were fetched. It cannot see your key, the amounts or the notes.`],
  ['What a viewing key shows.', 'Every payment into that wallet, not only this tab’s. Paste it only on a device you trust.'],
];
export const FINDER_SCOPE = 'This check reads unified viewing keys and looks back about two days. It does not read Sapling payments. It relies on the server for what is on the chain, and it does not check that the key belongs to this tab’s address.';
export const FINDER_LIMIT = 'A found payment arrived at your key with this amount and note. It does not show who sent it.';
export const FINDER_SECRET = 'This looks like a spending key or a recovery phrase. Never paste one into a web page. Ztab did not use it, and the box has been cleared. Use a viewing key.';
export const FINDER_MAINNET_KEY = 'This is a mainnet viewing key. This check works on testnet only for now.';
export const FINDER_NO_SERVER = 'Could not reach the server. Nothing was checked.';

const UNIFIED_KEY: Record<Network, string[]> = { main: ['uview1', 'uvf1'], test: ['uviewtest1', 'uvftest1'], regtest: [] };

/** Says why a pasted text is not a viewing key this check can use, or undefined when it may be one. */
export function refuseKey(text: string, network: Network): string | undefined {
  const key = text.trim();
  if (!key) return 'Paste a viewing key first.';
  if (/^\s*([a-z]+\s+){11,}[a-z]+\s*$/i.test(text) || /^(secret-|usk|zxprv|xprv|[KL5][1-9A-HJ-NP-Za-km-z]{50,51}$)/i.test(key)) return FINDER_SECRET;
  if (/^zxview/i.test(key)) return 'This is a Sapling viewing key. This check reads unified viewing keys only; they start with “uview”.';
  if (UNIFIED_KEY[network].some(p => key.startsWith(p))) return undefined;
  if (UNIFIED_KEY.main.some(p => key.startsWith(p))) return FINDER_MAINNET_KEY;
  if (UNIFIED_KEY.test.some(p => key.startsWith(p))) return 'This is a testnet viewing key, and this tab is not on testnet.';
  return 'This is not a unified viewing key. Look for “viewing key” in your wallet’s settings; it starts with “uview”.';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A block time as "11 Oct 2026, 14:03 UTC". */
export function utcMinute(unix: number): string {
  const d = new Date(unix * 1000), two = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}

const zec = (zatoshis: string): string => `${zatoshisToZec(BigInt(zatoshis))} ZEC`;
const shortTx = (txid: string): string => `${txid.slice(0, 8)}…${txid.slice(-8)}`;

/**
 * Checks for payments with a viewing key, on this device. Closed until the organiser opens it;
 * nothing is downloaded or asked of any server until the button is pressed. The key is held in
 * this page's memory only: never in storage, never in the link.
 */
export function paymentFinder(
  network: Network,
  createdAt: string | undefined,
  people: (Asked & { amount: string })[],
  marks: boolean[],
  tick: (index: number) => void,
  load: () => Promise<Finder> = () => loadFinder(network),
  example?: DemoExample,
): { element: HTMLElement; clear: () => void; dispose: () => void; useKey: (key: string) => void } | undefined {
  const server = FINDER_SERVER[network];
  if (!server || !people.some(person => person.memo !== undefined)) return undefined;
  const input = h('textarea', { id: 'viewing-key', rows: '3', maxlength: '2048', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-describedby': 'finder-explained finder-held finder-scope' });
  const status = h('p', { role: 'status', 'aria-atomic': 'true' });
  const results = h('div', { class: 'pay-find-result' });
  const look = h('button', { type: 'submit', class: 'secondary' }, 'Look for payments');
  const forget = h('button', { type: 'button', class: 'secondary' }, 'Forget the key');
  const stop = h('button', { type: 'button', class: 'secondary' }, 'Stop looking');
  const heldLine = h('p', { class: 'note', id: 'finder-held' });
  const clear = (): void => { results.replaceChildren(); status.textContent = ''; };
  let held: string | undefined, loaded: Promise<Finder> | undefined;
  // One look at a time. Ending a look (Stop, Forget, leaving the page) aborts its requests and makes
  // everything it would still have done a no-op: a late answer can no longer show, hold or restore anything.
  let looking: AbortController | undefined;
  const end = (): void => { looking?.abort(); looking = undefined; look.removeAttribute('disabled'); stop.hidden = true; };
  const showHeld = (): void => {
    heldLine.textContent = held === undefined ? '' : 'A viewing key is held in this page. Look again without pasting it, or forget it now. It is forgotten when you leave or close this page.';
    forget.hidden = held === undefined;
  };
  showHeld();
  stop.hidden = true;
  forget.addEventListener('click', () => { end(); held = undefined; input.value = ''; clear(); showHeld(); status.textContent = 'The key is forgotten.'; input.focus(); });
  stop.addEventListener('click', () => { end(); clear(); showHeld(); status.textContent = 'Stopped. Nothing was checked.'; input.focus(); });
  // Leaving the screen ends a look in flight and drops the key, the box, the results and the loaded scanner.
  // The router calls this (see leave.ts); nothing global keeps this screen alive afterwards.
  const dispose = (): void => { end(); held = undefined; loaded = undefined; input.value = ''; clear(); showHeld(); };
  const named = (index: number): string => people.filter(other => other.memo === people[index].memo).length > 1 ? `${people[index].name} (person ${index + 1})` : people[index].name;
  const tickButton = (index: number, label: string): HTMLElement => {
    const name = named(index);
    if (marks[index]) return h('p', {}, `${name} is already ticked.`);
    const confirm = h('button', { type: 'button', class: 'secondary' }, label);
    confirm.addEventListener('click', () => {
      if (!marks[index]) tick(index);
      clear();
      status.textContent = `${name} is ticked. This is your mark.`;
      input.focus();
    });
    return confirm;
  };
  const form = h('form', { class: 'pay-find-form' },
    h('div', { id: 'finder-explained' }, ...finderExplained(server.host, server.operator).map(([lead, rest]) => h('p', {}, h('strong', {}, lead), ` ${example ? rest.replace('for recent blocks', 'for the example’s fixed block and recent blocks') : rest}`))),
    h('label', { class: 'field', for: 'viewing-key' }, h('span', {}, 'Viewing key')),
    input,
    heldLine,
    h('p', { class: 'actions' }, look, stop, forget),
    h('p', { class: 'note', id: 'finder-scope' }, FINDER_SCOPE + (example ? ' In this demo it also reads the fixed block of the 12 Oct 2026 example, separately from recent payments.' : '')),
    status, results,
  );
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (looking) return;
    clear();
    const pasted = input.value;
    input.value = '';
    if (pasted.trim() || held === undefined) {
      const refused = refuseKey(pasted, network);
      if (refused) { status.textContent = refused; return; }
    }
    const key = pasted.trim() || held;
    if (key === undefined) return;
    const mine = (looking = new AbortController());
    const current = (): boolean => looking === mine && element.isConnected;
    look.setAttribute('disabled', '');
    stop.hidden = false;
    status.textContent = `Asking ${server.host} for ${example ? 'the example block and recent blocks' : 'recent blocks'}…`;
    try {
      const since = lookSince(createdAt, Math.floor(Date.now() / 1000));
      const ready = (loaded ??= load());
      ready.catch(() => { loaded = undefined; });
      const found = await (await ready).find(key, since, FINDER_MAX_BLOCKS, p => { if (current()) status.textContent = `Looked through ${p.blocks} blocks so far…`; }, mine.signal, example);
      if (!current()) return;
      held = key;
      if (example) {
        const historical = h('div', { class: 'note-match-choice demo-example-result' },
          h('h3', {}, 'Example payment from 12 Oct 2026'),
          h('p', {}, 'Testnet · our own example, not your payment. This cannot tick a share in your demo.'));
        if (found.example?.length) {
          for (const note of found.example) historical.append(
            h('p', {}, `${zec(note.zatoshis)} received · ${note.memo ?? 'no note'}`),
            h('p', { class: 'note' }, `Transaction ${shortTx(note.txid)} · block ${example.height.toLocaleString('en-US')}`));
        } else historical.append(h('p', {}, 'The example payment was not found in its fixed block. Nothing has been confirmed; try again later.'));
        results.append(historical, h('h3', {}, 'Recent payments for this demo'));
      }
      const { fits, others } = sortFound(people, found.notes);
      const from = utcMinute(found.oldest);
      if (!fits.length) status.textContent = `No payment to this key ${others.length ? 'with a note from this tab ' : ''}was found since ${from}. That does not prove none was made; your wallet is the record.`;
      else status.textContent = `Looked from ${from} to now. Check each payment below, then tick it yourself.`;
      if (example) status.textContent = 'Recent window: ' + status.textContent;
      for (const { note, people: fit } of fits) {
        const row = h('div', { class: 'note-match-choice' });
        if (fit.length === 1) {
          const { index, amount } = fit[0], name = named(index);
          row.append(amount
            ? h('p', {}, `A payment of ${zec(note.zatoshis)} arrived with the note in `, h('strong', {}, name), '’s request. The amount matches their share.')
            : h('p', {}, 'A payment arrived with the note in ', h('strong', {}, name), `’s request, but the amount differs: ${zec(note.zatoshis)} arrived, their share is ${zec(people[index].zatoshis)}.`));
          row.append(h('p', { class: 'note' }, `Transaction ${shortTx(note.txid)}`), tickButton(index, amount ? `Tick ${name}` : `Tick ${name} anyway`));
        } else {
          row.append(h('p', {}, `A payment of ${zec(note.zatoshis)} arrived with a note that is in ${fit.length} requests. Ztab cannot tell which. Check in your wallet, then choose the person yourself.`), h('p', { class: 'note' }, `Transaction ${shortTx(note.txid)}`));
          for (const { index, amount } of fit) row.append(h('p', { class: 'actions' }, tickButton(index, amount ? `Tick ${named(index)}` : `Tick ${named(index)} anyway`)));
        }
        results.append(row);
      }
      if (others.length) results.append(h('div', { class: 'note-match-choice' }, h('p', {}, h('strong', {}, 'Other payments to this key')), ...others.map(note => h('p', { class: 'note' }, `${zec(note.zatoshis)} · ${note.memo ? `“${note.memo}”` : 'no note'}`))));
      if (fits.length || others.length) results.append(h('p', { class: 'note' }, FINDER_LIMIT));
    } catch (error) {
      if (!current()) return;
      const reason = error instanceof Error ? error.message : '';
      status.textContent = reason.startsWith('viewing key') || reason.includes('Orchard')
        ? 'This viewing key could not be read. Copy it again from your wallet. No server was asked.'
        : FINDER_NO_SERVER;
    } finally {
      // A look that was ended has nothing left to tidy; one that left the page behind forgets its key.
      if (looking === mine) { end(); if (!element.isConnected) held = undefined; showHeld(); }
    }
  });
  const element = h('details', { class: 'pay-find' }, h('summary', {}, FINDER_HEADING), form);
  return { element, clear, dispose, useKey: (key: string): void => {
    if (!element.isConnected || looking || refuseKey(key, network)) return;
    input.value = key;
    element.open = true;
    input.focus();
  } };
}

async function loadFinder(network: Network): Promise<Finder> {
  const server = FINDER_SERVER[network];
  if (!server) throw new Error('server');
  // Loaded only now: the scanner and its WebAssembly module are not part of the page until this point.
  const [{ finder }, wasm] = await Promise.all([import('./find/wire.ts'), fetch(new URL('./find/ztab_scan.wasm', import.meta.url)).then(r => { if (!r.ok) throw new Error('server'); return r.arrayBuffer(); })]);
  return finder(server.url, wasm);
}
