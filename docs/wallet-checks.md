# Ztab wallet checks

These are observations of specific versions and entry paths, not a claim
of compatibility with every wallet. Android checks used an emulator.
The only payment sent was on testnet between two disposable wallets;
no real-user bill or mainnet payment is claimed.

The 10 October checks predate the rename and preserve their original Tab
notes. The 11 October checks below use the Ztab-branded memo.

## Android emulator

Checked on 10 October 2026 by Jarvis, using Android 14 (API 34), Google APIs
ARM64, Android emulator 37.2.12 on Apple silicon. These checks used official
release APKs, each matching its GitHub release asset SHA-256 digest, and
fresh disposable unfunded wallets. No recovery phrase was recorded; no
transaction was signed or sent. The temporary environment was deleted.

The request was actual Tab output from a four-person example: a public
mainnet-encoded unified-address test vector, **0.02 ZEC**, memo **Dinner · Ben**.
The complete address, numeric amount and decoded memo were checked in the
wallet's UI hierarchy, not inferred from truncated address screenshots.

| Official release | Entry path | Observed amount | Observed memo |
|---|---|---|---|
| [Zingo 2.0.24 (320)](https://github.com/zingolabs/zingo-mobile/releases/tag/zingo-2.0.24-320) | Android VIEW intent in Advanced mode, after device authentication | 0.02000000 | Dinner · Ben |
| [YWallet 1.15.3 (578)](https://github.com/hhanh00/zwallet/releases/tag/v1.15.3) | Android VIEW intent | 0.020 | Dinner · Ben |
| [Zkool 6.32.0 (2377)](https://github.com/hhanh00/zkool2/releases/tag/zkool-v6.32.0) | Paste the complete URI into Recipient address | 0.02000000 | Dinner · Ben |

All three displayed the complete expected address. This is a list of verified
paths, **not an exhaustive compatibility table or wallet recommendation**.
Zingo's basic mode was not verified. Zkool had no direct `zcash:` intent
handler in this build; its successful check was clipboard input, not the
wallet button or camera scan. YWallet's first-run notice says active
development has ended, with security and protocol updates continuing.

An Android VIEW intent supplies the wallet the same URI as Tab's wallet
button, but bypasses browser chooser behavior. These observations do not
establish physical-phone behavior, QR camera performance, iOS support,
or successful on-chain payment. The app therefore still tells payers that
their wallet may not show or send the note. URI conformance alone is not
wallet interoperability proof.

## Physical iPhone: organiser-reported Zodl check

On 10 October 2026, the organiser tested a shielded unified-address request
on the polish build `d65fef0`. The iPhone camera opened Zodl; the app then
asked for another scan inside Zodl. The organiser confirmed the address,
amount and short note appeared. After the fuller-note change at `6cf1c32`,
they scanned again and confirmed that note was correct too.

The Zodl version and exact notice text were not recorded. No reason for the
extra scan is inferred here. This is the operator's report, separate from
Jarvis's independently inspected Android emulator results above. It does not
establish the browser wallet-button path, successful payment, or whether
the recipient's wallet displays the memo when funds arrive. The formatter
correction at `f993383` adds thousands separators; that larger-share case
was not separately reported in this iPhone check.

## Android emulator: Ztab wallet button, 11 October

On build `950aa3a`, the pay page's **Open in my wallet** button handed a
request from Chrome on an Android 14 emulator to **Zingo 2.0.24 (320)** in
Advanced mode, after device authentication. The complete address, amount
**0.00811172 ZEC**, and note **Dinner, Sunday · Ana · $10.00 · 11 Oct 2026 · Ztab**
matched the generated request in the wallet's UI hierarchy.

This was a separate public mainnet-encoded test-address example. The wallet
was unfunded and displayed “Invalid Amount”; no payment was signed or sent.
The recording labels the emulator and the shortened interval in which
Android hides device authentication from screen recording. This verifies
the browser-to-wallet input path, not camera scanning or payment success.

## Zingo PC: one testnet payment, 11 October

A request made by live build `4d20ead` was pasted into **Zingo PC 2.0.26 (196)**
on Apple silicon. A disposable payer wallet sent **0.00804690 TAZ** to a
separate disposable receiver on testnet. The receiving wallet showed
**Received**, the exact amount, **7 confirmations**, and the full note:

> Testnet dinner · Ana · $10.00 · 11 Oct 2026 · Ztab

Transaction ID:
`0c4482a39513ed3ba0398eb968b1ae07816361ab00be4e7f765d355a9aa014c0`.
The transaction fee was 0.0001 TAZ, separate from the requested amount.
The official release download matched its published SHA-256 digest.
No recovery phrase, viewing key or wallet database is part of this repository.

This establishes one path where a Ztab request's note arrived with the
payment and was shown by the recipient's wallet. It is **not** a real-user
bill, a mainnet payment, an Android payment or a physical-phone test. It
does not show that every wallet sends or displays notes. A copied note or
identical names and shares can match more than one request; a note does not
prove who paid, which link was used, or how much arrived. Check the actual
transaction and amount in the wallet.

## Newer unified-address formats

On 11 October, live build `b06a9a6` was checked in Chromium and Playwright
WebKit with a valid `zutest1` vector generated using librustzcash commit
`f7b1cfb0b5bb1bdb10564079ac51b54aa18b07a1`. Both rejected it with the generic
address error and produced no payment links. This is an app compatibility
limit, not evidence that the supplied address was malformed.

A newly generated receiving address in Zingo PC 2.0.26 (196), checked in its
UI the same day, still used `utest1`. That observation concerns that release;
it does not establish what other wallets generate. The current engine
accepts original unified-address prefixes but has not implemented the newer
formats described in [ZIP 316](https://zips.z.cash/zip-0316), including their
must-understand and expiry rules. Newer address support remains future work.
