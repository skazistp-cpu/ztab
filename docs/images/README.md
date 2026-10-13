# Screenshot provenance

`tab-share.png` and `tab-pay.png` were captured by Maximus from the local production
build of `073abf9d146eed3fa48f17c11c5849a14c2dc05c` on 12 October 2026 at 13:21 UTC,
served on 127.0.0.1. This is the release candidate with the guided create flow and
the polished pay, table, organiser and demo screens. Playwright WebKit 26.5, light
appearance and reduced motion: `tab-share.png` is the Links ready screen at
1280×1000 and `tab-pay.png` is Ana's pay page at 390×844, each the first screen
without scrolling. The native share API was not replaced; WebKit exposes it, so
Send is present. No Send action was invoked.

The fixture is USD 98 “Večera, Friday”, organiser Miro, participants Ana and
Ben, and a manually entered example rate of USD 100 per ZEC, entered through the
guided steps. The recipient is the repository's public testnet Sapling fixture.
The testnet banner is intentional. No wallet was opened and no funds were sent.

Chromium 151.0.7922.34 and WebKit 26.5 both loaded only HTML and five local
assets (script, stylesheet and three fonts, including extended Latin) on each
screen. Local storage, session storage and cookies remained empty with Remember
off. No page errors. The images were recompressed losslessly: a fully opaque
alpha channel was dropped and no pixel changed.
The screenshots show a bill split by total; they do not illustrate all modes.
