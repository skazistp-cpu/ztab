# Screenshot provenance

`tab-share.png` and `tab-pay.png` were captured by Jarvis from
https://ztab.sebrona.com/ on 13 October 2026 at 07:35 UTC.
This was a documentation update after submission, using the submitted
release tree: public commit `df10bff51047978db5f753e47a2625ce624bd0cc`,
deployed as `703a5d5f464c94bbaeda3c7c77a277b3954f96d3`.

Playwright WebKit 26.5, light appearance, reduced motion and en-US locale:
Links ready at 1280×1000; Ana's pay page at 390×844. These are browser
viewport captures, not photographs of a physical laptop or phone. The
native share API was unchanged; Send was not pressed.

Fixture: USD 98 “Večera, Friday”, organiser Miro, participants Ana and Ben,
a manually entered example rate of USD 100 per ZEC, and the repository's
public testnet Sapling address. The testnet strip remains visible. No
wallet was opened and no payment was made.

Chromium 151.0.7922.34 repeated the same flow. The organiser visit loaded
HTML, the app script and stylesheet, three local fonts and one landing
image (seven requests). The pay visit loaded HTML, script, stylesheet and
three local fonts (six requests). All requests were to the site's own
origin; no Coinbase lookup or viewing-key scan was requested. Local storage,
session storage and cookies were empty. Neither engine reported a page error.

Images were recompressed losslessly, removing only a fully opaque alpha
channel. No UI text or pixels were retouched. The screenshots show splitting
by total and do not illustrate every supported mode.
