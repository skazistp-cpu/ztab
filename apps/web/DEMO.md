# Public testnet demo

`?demo` opens a sample dinner. The ordinary page loads no demo assets. Loading the sample fetches one same-origin JSON deployment artifact, but not the scanner or a chain server. “Use the public demo key” only fills the existing checker. Its “Look for payments” button remains the explicit opt-in to the named ChainSafe server.

The sample has steak 32.00 to Ana, salad 11.50 to Ben, wine 28.00 shared by Lena, Ana and Ben, and a 10% tip. Existing item arithmetic gives 78.65 total, Lena 10.28, Ana 45.46 and Ben 22.91. Its USD rate (1,000 per test ZEC) is an example, not a quote. Each session has a random 64-bit label in its note. Reload preserves the session and manual ticks in the fragment; no browser storage is used. After the receiver loads, its address digest is bound into the fragment. A receiver rotation refuses old sessions rather than silently changing their payment requests.

This is a **public testnet receiver**. Anyone with the published viewing key can read its incoming payments and notes. Never use either private testing wallet, a user's wallet, a mainnet wallet, a seed or a spending key. A match still does not prove who paid. Ticks are manual.

## Deployment prerequisite

Create a fresh disposable receiver expressly for public demo use. Keep its seed/spending key outside repositories and never publish them. Keep the deliberately public viewing-key JSON outside Git too. Its exact fields are:

- `version`: 1
- `network`: `test`
- `address`: an old-form testnet unified address
- `viewingKey`: the corresponding testnet unified full viewing key
- `birthday`: its creation height (metadata; the recent window searches from the session date, at most about two days)

After every build, run:

```sh
npm run build
node scripts/prepare-demo.ts /absolute/path/outside/repo/demo-receiver.json --public-testnet-demo
```

The helper validates the shape, refuses an in-repository source and mainnet/spending-key prefixes, writes `dist/demo-receiver.json`, and prints only its hash. Record that hash for the independent reviewer and include the file in deployment byte verification. **Every later deployment must repeat the injection**, since the build replaces `dist`. Without the asset, the demo reports unavailable and creates no payment request. Normal bills still work.

Before promotion: the reviewer must check the exact code commit and deployed asset hash, confirm that this receiver was deliberately made public, and see a payment from this demo session found with its corresponding key. Shape validation does not prove key/address correspondence. Keep test evidence honest: the browser regression uses a synthetic key and mocked receiver; it is not a completed payment.

## Tests

`npm test`, `npm run build`, and `test/browser/demo.mjs` in Chromium and WebKit cover sample arithmetic, session parsing, quiet loading, standard testnet requests, prefill without scanning, saved ticks, zero storage, receiver mismatch, unavailable receiver, navigation during receiver loading, and 320/390/1280 light/dark layout. The existing finder regression covers the actual scanner with its synthetic cryptographic vector, cancellation, key disposal and explicit ticks.

## Historical example and recent payments

For the public receiver made on 12 October 2026, one press of “Look for payments” scans two windows after the existing server disclosure:

1. **Block 4,491,326**, for transaction `d9b235dec4cce12888bf042d69bbfe22456c90ae0e906160bcfc0ba1fe21fa10`. This was independently read from ChainSafe’s transaction response. The real encrypted payment is fetched and decrypted each time; no amount or note is canned. The UI labels it “Example payment from 12 Oct 2026”, “our own example, not your payment”. It offers no tick button and is excluded from recent matches even when the windows overlap.
2. **The usual recent window**, from ten minutes before this demo session, capped at two days and 10,000 requested heights. A visitor’s payment can still propose a tick by the existing exact-note rule.

The combined bound is 10,001 heights, at most 21 block-range requests, one tip request and at most 200 transaction requests. Both windows share the transaction cap and abort signal. Each response remains bounded to 16 MB and 30 seconds. Malformed or failed responses produce an error, with no partial results. A missing example transaction is reported as not found; it is never replaced with saved text. Testnet server availability/history is still required; this is not a guarantee that an example can always be fetched.

The historical selector is tied to the public receiver’s address. A receiver rotation disables it and explicitly says only the recent window is available. Ordinary organiser checks pass no historical selector: their request window, limits and wording are unchanged. No engine, payment URI or WebAssembly code changes.

`test/find-wire.test.ts` covers a historical payment outside the recent window, overlap exclusion, combined block and transaction budgets, invalid heights and empty historical responses. `test/browser/demo-fixed-example.mjs` runs the real module against synthetic encrypted payments with a later clock/tip, checks both windows and labels, no automatic/historical tick, cancellation, server failure, no key in requests, empty storage, and 320/390/1280 light/dark layouts. These synthetic checks are distinct from the recorded live-server run with the intentionally public receiver.
