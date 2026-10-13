import {
  buildUri,
  expandMemo,
  tabMemoTemplate,
  canReceiveMemo,
  checkAddress,
  memoParam,
  parseUri,
  zatoshisToZec,
  type ShareLink,
} from '../../../packages/engine/src/index.ts';
import { addressBlock, fiatAmount, h, hang, zecFigure } from './dom.ts';
import { formatFiat, formatUtc } from './money.ts';
import { qrSvg } from './qr.ts';
import { sourceText } from './rate.ts';

export type Request =
  | { kind: 'request'; uri: string; zec: string; memo?: string; transparent: boolean }
  | { kind: 'error'; detail: string };

/** Builds the payment request for a share and parses it back before anyone sees it. */
export function requestFor(share: ShareLink): Request {
  const address = checkAddress(share.payee);
  if (address.kind === 'error') {
    return { kind: 'error', detail: address.reason };
  }
  const shielded = canReceiveMemo(address.addressKind);
  const memo = shielded
    ? share.createdAt === undefined
      ? [share.label, share.name].filter(Boolean).join(' · ') || undefined
      : expandMemo(tabMemoTemplate(share.label, share.memoBrand ?? 'Tab'), share.name, share.fiatShare, share.rate.fiat, share.createdAt)
    : undefined;
  if (shielded && share.createdAt !== undefined && memo === undefined) {
    return { kind: 'error', detail: 'invalid memo creation date' };
  }
  const built = buildUri({ address: share.payee, zatoshis: share.zatoshis, memo }, share.network);
  if (built.kind === 'error') {
    return { kind: 'error', detail: built.error };
  }
  const back = parseUri(built.uri, share.network);
  const memoBase64Url = memo === undefined ? undefined : memoParam(memo);
  if (
    back.kind !== 'request' ||
    back.payments.length !== 1 ||
    back.payments[0].address !== share.payee ||
    back.payments[0].zatoshis !== share.zatoshis ||
    back.payments[0].memoBase64Url !== memoBase64Url
  ) {
    return { kind: 'error', detail: 'the request did not read back as written' };
  }
  return {
    kind: 'request',
    uri: built.uri,
    zec: zatoshisToZec(BigInt(share.zatoshis)),
    memo,
    transparent: !shielded,
  };
}

const FUTURE_AFTER_MS = 60_000;

/** True when the rate's time is more than a minute ahead of this device's clock. */
export const fromTheFuture = (observedAt: string, now: number): boolean =>
  Date.parse(observedAt) - now > FUTURE_AFTER_MS;

export const COPY_FAILED = 'Could not copy. Select the text and copy it yourself.';

/** A copy button that says so when the browser refuses. */
export function copyButton(label: string, text: () => string, onFailure?: () => void): HTMLElement {
  const button = h('button', { type: 'button', class: 'secondary' }, label);
  const status = h('span', { class: 'copy-status', role: 'status' });
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text());
      // Held at its width, so the shorter word does not move what is beside it; let go if the screen changes size.
      const release = (): void => { button.style.minWidth = ''; };
      if (!button.classList.contains('done')) {
        button.style.minWidth = `${button.getBoundingClientRect().width}px`;
        window.addEventListener('resize', release, { once: true });
      }
      button.textContent = 'Copied';
      button.classList.add('done');
      // Said to a screen reader too; the word on the button is what is seen.
      status.classList.add('quiet');
      status.textContent = 'Copied';
      window.setTimeout(() => {
        button.textContent = label;
        button.classList.remove('done');
        release();
        window.removeEventListener('resize', release);
        if (status.classList.contains('quiet')) {
          status.textContent = '';
          status.classList.remove('quiet');
        }
      }, 2500);
    } catch {
      status.classList.remove('quiet');
      status.textContent = COPY_FAILED;
      onFailure?.();
    }
  });
  return h('span', { class: 'copy' }, button, status);
}

/** The dated wallet log, as the help below shows it: wallet · where, then what was seen. */
const WALLET_CHECKS: [string, string][] = [
  ['Zodl · iPhone', '10 Oct · our own report from an iPhone. Camera, then second scan in the app; address, amount and note shown. Version not recorded.'],
  ['Zingo 2.0.24 · Android emulator', '11 Oct · Open in my wallet, Advanced mode and device authentication. Address, amount and Ztab note shown. No payment sent.'],
  ['YWallet 1.15.3 · Android emulator', '10 Oct · Android URI intent. Address, amount and earlier note shown. No payment sent.'],
  ['Zkool 6.32.0 · Android emulator', '10 Oct · full request pasted into Recipient. Address, amount and earlier note shown. No payment sent.'],
  ['Zingo PC 2.0.26 · desktop', '11 Oct · testnet between our own wallets. A payment was sent and received with its amount and Ztab note.'],
];

/**
 * Which wallet, answered before the help is opened. This is the claims review's wording of 12 Oct 2026, word for
 * word; every wallet it names is a row of the dated log above (test/browser/screens-polish.mjs holds them together).
 */
const WALLETS_TRIED: [string, string][] = [
  ['iPhone', 'Zodl (our own report)'],
  ['Android emulator', 'Zingo 2.0.24, YWallet 1.15.3, Zkool 6.32.0'],
  ['Desktop', 'Zingo PC 2.0.26 (testnet)'],
];

function walletsChecked(): HTMLElement {
  return h('div', { class: 'wallets-checked' },
    h('p', { class: 'wallets-lead' }, h('strong', {}, 'Which wallet?'), ' We have tried these, 10–11 October 2026:'),
    h('ul', {}, ...WALLETS_TRIED.map(([place, wallets]) => h('li', {}, h('span', {}, `${place}:`), ' ', wallets))),
    h('p', { class: 'note' }, 'Each result and its limits are in the help below.'),
  );
}

/** Guidance is user-selected; it does not detect wallets or change the request. */
function walletHelp(uri: string): HTMLElement {
  const hints: Record<string, string> = {
    ios: 'On iPhone, Ztab\'s developer reported on 10 October 2026 that the camera opened Zodl, then Zodl asked for a second scan inside the app. If the button does not open your wallet, use its scanner with this QR code on another screen. With one phone, press Copy payment request and paste it into a wallet that accepts it. The Zodl version was not recorded.',
    android: 'On an Android emulator, Open in my wallet opened Zingo 2.0.24 in Advanced mode on 11 October 2026. If Android offers an app chooser, select your Zcash wallet. If nothing opens, copy the payment request and use a wallet that accepts it, or scan from another screen.',
    desktop: 'Using a wallet on another device? Open its scanner and scan this QR code. On this device, the button asks the system to open a wallet; Ztab cannot tell whether one is installed. If nothing opens, copy the request into a wallet that accepts payment requests.',
  };
  const select = h('select', {id:'wallet-platform'},
    h('option',{value:'desktop'},'Desktop or another device'),
    h('option',{value:'ios'},'iPhone or iPad'),
    h('option',{value:'android'},'Android'));
  const hint = h('p',{class:'wallet-platform-hint',role:'status'},hints.desktop);
  select.addEventListener('change',()=>{hint.textContent=hints[select.value] ?? hints.desktop;});
  const requestText = h('textarea',{id:'wallet-request',readonly:'',rows:'4',spellcheck:'false',autocapitalize:'off'},uri);
  const selectText = h('button',{type:'button',class:'secondary'},'Select request text');
  selectText.addEventListener('click',()=>{requestText.focus();requestText.select();});
  return h('details',{class:'wallet-help'},
    h('summary',{},'Wallet checks and opening help'),
    h('p',{},'The button hands over a request. It does not confirm that a wallet opened or that you paid. Check the address, amount and note in your wallet before confirming.'),
    h('label',{for:'wallet-platform'},'Opening help for'),select,hint,
    h('label',{for:'wallet-request'},'Payment request to copy'),requestText,
    h('p',{class:'actions'},selectText),
    h('p',{class:'note'},'The full request includes the amount and, when the address supports it, the note. If you enter only the address and amount by hand, the note is not included. Never paste a recovery phrase or spending key here.'),
    h('table',{class:'wallet-checks',role:'table'},
      h('caption',{},'Wallet checks, 10–11 October 2026'),
      h('tbody',{role:'rowgroup'},...WALLET_CHECKS.map(([wallet,result])=>h('tr',{role:'row'},h('th',{scope:'row',role:'rowheader'},wallet),h('td',{role:'cell'},result))))),
    h('p',{class:'note'},'These are specific versions and entry paths, not a promise about every wallet or network. Only the Zingo PC check above sent a payment, and it was testnet. Testnet requests need a wallet on testnet.'),
  );
}

export function payScreen(share: ShareLink): HTMLElement {
  const request = requestFor(share);
  if (request.kind === 'error') {
    return brokenLink();
  }
  const who = share.from || 'the person who sent it';
  const fiat = formatFiat(share.fiatShare, share.rate.fiat);
  const copy = copyButton('Copy address and amount', () => `${share.payee}\n${request.zec} ZEC`);
  const help = walletHelp(request.uri);
  const requestCopy = copyButton('Copy payment request', () => request.uri, () => {
    help.setAttribute('open', '');
    const text = help.querySelector('textarea');
    text?.focus();
    text?.select();
  });

  return hang(h(
    'section',
    { class: 'card pay' },
    networkStrip(share.network),
    // What the tab was for stands above, as on the other screens of a tab; the heading is whose share and how much.
    share.label && h('p', { class: 'eyebrow' }, share.label),
    h(
      'h1',
      { class: 'owed' },
      h('span', {}, `${share.name ? `${share.name}, your` : 'Your'} share is`),
      ' ',
      fiatAmount(fiat),
    ),
    // The rate, its source and its time are said once, in the line under the code.
    h('p', { class: 'lead' }, 'That is ', zecFigure(request.zec), '.'),
    fromTheFuture(share.rate.observedAt, Date.now()) &&
      h(
        'p',
        { class: 'warning' },
        `The rate's time is later than this device's clock. The clock of ${who} or of this device may be wrong.`,
      ),
    // The caution is the payer's only protection, so it is read before the button is reached.
    // The two ends of the address beside the name; the whole address is under the button.
    h(
      'h2',
      { class: 'pays' },
      `Pays ${share.from || 'this address'}`,
      share.payee.length > 24 &&
        h('span', { class: 'ends', 'aria-hidden': 'true' }, `${share.payee.slice(0, 8)}…${share.payee.slice(-8)}`),
    ),
    h(
      'p',
      { class: 'caution' },
      `Pay only if ${who} sent you this link. Check the address with them if you are unsure.`,
    ),
    h('a', { class: 'button primary', href: request.uri }, 'Open in my wallet'),
    addressBlock(share.payee),
    h('p', { class: 'actions' }, h('span',{class:'request-copy'},requestCopy), copy),
    // Which copy to use: only the whole request carries the note.
    request.memo !== undefined && h('p', { class: 'note copy-which' }, 'Copy payment request keeps the note. Copy address and amount leaves it out.'),
    walletsChecked(),
    help,
    request.transparent &&
      h(
        'p',
        { class: 'warning' },
        'This address is public. Anyone who sees a payment to it can see the amount.',
      ),
    request.memo !== undefined && h('p', { class: 'memo' }, `Note in the request: “${request.memo}”. Your wallet may not show or send it.`),
    // On a wide screen this part stands beside the rest of the card.
    h(
      'div',
      { class: 'stub' },
      h('p', { class: 'scan' }, 'Scan with your Zcash wallet'),
      qrSvg(request.uri, `Payment request for ${request.zec} ZEC`, 16) ??
        h('p', { class: 'warning' }, 'This request is too long for a QR code. Use Open in my wallet or Copy payment request.'),
      h('p', { class: 'note' }, 'No wallet on this device? Scan the QR code with your phone.'),
    ),
    h(
      'p',
      { class: 'rate ruled' },
      `1 ZEC = ${formatFiat(share.rate.fiatPerZec, share.rate.fiat)} · ${sourceText(share.rate.source)} · ${formatUtc(share.rate.observedAt)}`,
    ),
    h('p', { class: 'fixed' }, 'Amount fixed when this tab was made; the exchange rate may have changed.'),
    h(
      'p',
      { class: 'note' },
      `This page cannot see whether you paid. Ask ${who} to check their wallet.`,
    ),
  ));
}

/** A strip that says when a page is about test money. Nothing on mainnet. */
export function networkStrip(network: ShareLink['network']): HTMLElement | false {
  if (network === 'main') {
    return false;
  }
  return h(
    'p',
    { class: 'testnet' },
    network === 'test' ? 'Testnet: not real ZEC' : 'Regtest: a local test chain, not real ZEC',
  );
}

export function disagreeingLink(): HTMLElement {
  return hang(h(
    'section',
    { class: 'card' },
    h('p', { class: 'stamp stamp-void' }, 'VOID'),
    h('h1', {}, 'The amounts in this link do not agree'),
    h('p', {}, 'The ZEC amount is not the share at the rate the link states. Do not pay from it. Ask the person who sent it to make the tab again.'),
  ));
}

export function brokenLink(): HTMLElement {
  return hang(h(
    'section',
    { class: 'card' },
    h('h1', {}, 'This link is incomplete'),
    h('p', {}, 'Ask the person who sent it to copy it again.'),
  ));
}
