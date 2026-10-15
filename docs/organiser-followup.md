# Organiser follow-up

Post-submission product work, built on public `a0197f4` on 15 October 2026.
This branch adds a closed **Follow up on unticked shares** section to the
organiser page. Deployment is a separate step; this document does not claim
it was part of the hackathon submission or is live.

The organiser reviews a read-only message, then copies it or selects the
text if the clipboard is unavailable. It includes only unticked shares,
with names, amounts and individual payment links. A share's original
position distinguishes repeated names. The organiser link and its marks
are never included. Anyone receiving the message can read all the names,
amounts and individual links in that message.

An unticked share may already have been paid. Both the page and the copied
message explain that the marks do not check payments; someone who already
paid should check with the organiser before paying again. Testnet and
regtest messages retain their network warnings.

Ticking or unticking updates the preview. Once every share is ticked, the
section is hidden and its text is emptied. Reloading rebuilds the message
from the marks in the link. This includes ticks made through the existing
note matcher or payment finder. No message is sent automatically, and no
request, key, account or browser storage is added.

Verification: `organiser-followup.test.ts` checks message selection and URL
privacy; `test/browser/organiser-followup.mjs` checks the real organiser UI,
clipboard failure, unchanged wallet requests, reload, matcher ticks and
320/390/1280 px in light and dark, in Chromium and Playwright WebKit.
