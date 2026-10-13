# Ztab — web app

A static site in TypeScript, built with Vite: no framework and no server.
See the [root README](../../README.md) for the user flow, privacy, test
results and engine documentation.

From the repository root:

```sh
npm ci --prefix packages/engine
npm ci --prefix apps/web
npm test --prefix apps/web
npm run build --prefix apps/web
npm run preview --prefix apps/web
```

The build output is `apps/web/dist`. Use `npm run dev --prefix apps/web` for
local development. No application server or credentials are needed.

## Screens

- **The opening**: what Ztab does in one line, Start a tab, the sample dinner
  link (`?demo`), a picture of a bill splitting into shares that the page draws
  itself (no image files; still with reduced motion), how it works, and what a
  tab does not need.
- **Make the tab**, one question at a time after Start a tab: the bill (the
  total and currency, or split by item; what it was for), the people (your
  name in your own row, the others' names and optional fixed amounts, with
  each share shown as the engine works it out), the items and tip when split
  by item, the rate (fetched from Coinbase on a press, or typed), and where
  you get paid (your address and Remember). Back, the browser's Back and the
  row of steps move between steps; an error is shown on the step of the field
  it is about. On a wide screen the tab so far stands beside the question.
- **Links ready**: what you will be paid back and Copy all, your own share,
  and for each other person their share, a link, Send, Preview and a QR code;
  then the table QR code and your own page to keep track, as quieter choices.
- **Pay my share** (a link ending in `#s3.…`; older `#s1.…` and `#s2.…` links
  still open): the share, the rate it was made with, the payee address in
  full, the memo, a QR code and a wallet link.

Currencies: USD, EUR, GBP, CZK, PLN or CHF. Send opens the device share sheet
where supported; Copy remains available. The table QR code (`#g2.…`) opens a
group name picker; its organiser route keeps manual ticks in the link. Anyone
with either group link can read the tab. A pay link carries one person's
request and display data, and the page shows the recipient and caution before
the wallet button. Older `#g1.…` table links still open too, and older links
keep their original Tab notes.

All amounts come from the engine's `split()`. Every request is built by the
engine and parsed back before it is shown.

The tab's state is retained while navigating within the visit. Optional
Remember storage saves only the organiser's address and names, never the
bill. The payment route does not access Remember storage.

## Network and deployment

A normal visit requests only Ztab's own files. Pressing "Fetch the rate from
Coinbase" makes one more request, a GET to
`https://api.coinbase.com/v2/prices/ZEC-USD/spot` (or the chosen currency),
sent without credentials or a referrer and carrying nothing about the bill.
With a typed rate there is no such request. The optional viewing-key check on
the organiser's page contacts a named public Zcash testnet server only after
Look for payments is pressed.

The static host still receives page requests and may configure browser
network-error reporting. A share URL's fragment is decoded in the browser, so
hosting needs no server routes for individual tabs. The fragment is readable
by anyone who has the link; it is not encryption or sender authentication.
