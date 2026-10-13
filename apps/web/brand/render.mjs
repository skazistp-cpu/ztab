// Renders the brand PNGs from the SVGs in this folder, in Chromium, with the app's own fonts.
//   PLAYWRIGHT=/path/to/node_modules/playwright node apps/web/brand/render.mjs
// The PNGs are then reduced to a small palette (see README).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT ? path.join(process.env.PLAYWRIGHT, 'index.mjs') : 'playwright');
const font = f => `data:font/woff2;base64,${fs.readFileSync(path.join(here, '../src/fonts', f)).toString('base64')}`;
const faces = `
  @font-face { font-family: Inter; font-weight: 100 900; src: url(${font('inter-latin-wght-normal.woff2')}) format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 100 800; src: url(${font('jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); }`;

// [source, output, width, height, transparent corners]
const jobs = [['og-image.svg', '../public/og-image.png', 1200, 630, false], ['icon.svg', 'icon-1024.png', 1024, 1024, true]];

const browser = await chromium.launch();
for (const [src, out, w, h, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(here, src), 'utf8').replace(/<svg /, `<svg style="display:block;width:${w}px;height:${h}px" `);
  await page.setContent(`<!doctype html><style>${faces} html,body{margin:0;background:transparent}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(here, out), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log(out);
}
await browser.close();
