# Ztab — Cut ribbon

Selected by Miro from option 3 on 11 October 2026, with Ema directing the design. The original Z is a folded, cut ribbon: its gold top edge carries the app's thin gold signature line. It is not the Zcash logo and does not imply official affiliation.

## Assets

- `wordmark-dark.svg`: paper lettering for an ink ground.
- `wordmark-light.svg`: ink lettering for a paper or white ground.
- `icon.svg`, `icon-1024.png`: square app and Colosseum icon, with transparent rounded corners.
- `og-image.svg`: editable 1200 × 630 source; rendered output is `../public/og-image.png`.
- The app header embeds the dark wordmark. Its favicon embeds the icon as an SVG data URL. Neither makes another network request.

Ink `#101216`, paper `#FBF8F1`, gold `#F4B728`. The wordmark uses outlined Inter lettering; no font host or image dependency is needed. Preserve the mark's proportions and leave clear space around it. The square icon is the small-size mark; do not squeeze the full wordmark into 16 px.

The chat picture follows the Calm cards, with rounded corners and thin gold lines. Its illustrative amounts are unchanged from the reviewed artwork. Its QR opens **https://ztab.sebrona.com/**, not a payment request. The site serves the picture to preview clients; visiting the page does not load it.

## Rebuild the PNGs

Use an existing Playwright install and Chromium:

```sh
PLAYWRIGHT=/path/to/node_modules/playwright node apps/web/brand/render.mjs
```

The renderer embeds the repository's local fonts and makes no outside requests. SVGs are the source of truth. Review the icon at 16 and 32 px, the wordmark on both grounds, and the decoded QR after changing an asset.
