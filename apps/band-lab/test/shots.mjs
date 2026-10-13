// Stills of the wallet band's lab at a set of progresses, a contact sheet of them, and scroll recordings. One browser
// at a time, closed after use. Chromium and WebKit for the stills; the recordings in Chromium.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs TAB_ORIGIN=http://127.0.0.1:8799 SHOTS=out node test/shots.mjs
// SIZES=1512x860,390x844  PS=0.1,0.3,0.45,0.6,0.75,0.9,1  BROWSERS=chromium,webkit  VIDEO=0 skips the recordings  SCALE=2
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const out = resolve(process.env.SHOTS || 'out');
const sizes = (process.env.SIZES || '1512x860,390x844').split(',').map(s => s.split('x').map(Number));
const ps = (process.env.PS || '0.1,0.3,0.45,0.6,0.75,0.9,1').split(',').map(Number);
const engines = (process.env.BROWSERS || 'chromium,webkit').split(',');
const scale = Number(process.env.SCALE || 2);
const video = process.env.VIDEO !== '0';
mkdirSync(out, { recursive: true });

const settled = async page => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
};

const stills = [];
for (const engine of engines) {
  const browser = await pw[engine].launch();
  try {
    for (const [width, height] of sizes) {
      const phone = width < 760;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: 'no-preference', ...(phone ? { isMobile: engine !== 'webkit', hasTouch: true } : {}) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const p of ps) {
        await page.goto(`${origin}/?p=${p}&hud=0`);
        await settled(page);
        const file = join(out, `${engine}-${width}x${height}-p${p.toFixed(2)}.png`);
        await page.screenshot({ path: file });
        stills.push({ engine, width, height, p, file });
        process.stdout.write(`still ${engine} ${width}x${height} p=${p}\n`);
      }
      if (errors.length) console.error(`${engine} ${width}x${height} page errors:`, errors);
      await context.close();
    }
    if (video && engine === 'chromium') {
      for (const [width, height] of sizes) {
        const dir = join(out, 'video-tmp');
        const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir, size: { width, height } }, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        await page.goto(`${origin}/?hud=0`);
        await settled(page);
        // Down the span at a steady pace, 13 s, then a moment at the end.
        await page.evaluate(() => new Promise(done => {
          const track = document.getElementById('track');
          const top = track.getBoundingClientRect().top + scrollY;
          const len = track.offsetHeight - innerHeight;
          const t0 = performance.now();
          const tick = () => {
            const t = Math.min(1, (performance.now() - t0) / 13000);
            scrollTo(0, top - 120 + (len + 120) * t);
            if (t < 1) requestAnimationFrame(tick); else setTimeout(done, 1200);
          };
          scrollTo(0, top - 120);
          setTimeout(() => requestAnimationFrame(tick), 500);
        }));
        const path = await page.video().path();
        await context.close();
        renameSync(path, join(out, `scroll-${width}x${height}-${engine}.webm`));
        process.stdout.write(`video ${width}x${height}\n`);
      }
    }
  } finally {
    await browser.close();
  }
}

// The contact sheet: one row per browser and size, a column per progress.
const rows = [];
for (const engine of engines) for (const [width, height] of sizes) rows.push({ engine, width, height, shots: stills.filter(s => s.engine === engine && s.width === width && s.height === height) });
const cell = 300;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#15171c;color:#f2f5f7;font:13px/1.4 -apple-system,system-ui,sans-serif}
h1{font-size:16px;font-weight:600;margin:0 0 16px}h2{font-size:12px;font-weight:500;color:#aab;margin:18px 0 6px}
.row{display:flex;gap:10px}.c{width:${cell}px}.c img{width:100%;display:block;border-radius:6px;box-shadow:0 0 0 1px #000}
.c b{display:block;margin-top:4px;font-weight:500;color:#aab}</style>
<h1>Ztab wallet band · lab stills · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</h1>
${rows.map(r => `<h2>${r.engine} · ${r.width}×${r.height}</h2><div class="row">${r.shots.map(s => `<div class="c"><img src="${pathToFileURL(s.file).href}"><b>p = ${s.p}</b></div>`).join('')}</div>`).join('')}`;
const sheetPath = join(out, 'contact-sheet.html');
writeFileSync(sheetPath, html);
const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: cell * ps.length + 10 * (ps.length - 1) + 48, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(sheetPath).href);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, 'contact-sheet.png'), fullPage: true });
} finally {
  await browser.close();
}
console.log(`stills, contact sheet${video ? ' and recordings' : ''} in ${out}`);
