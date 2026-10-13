// How smoothly the band scrubs: the page is scrolled through the span over a few seconds while every animation frame
// is timed; the frame intervals are reported (long frames are those over 20 ms). Chromium, with the GPU as a visitor
// has it on a Mac. A rough measure in a headless browser, not a benchmark.
// PLAYWRIGHT_MODULE=... TAB_ORIGIN=http://127.0.0.1:8799 node test/frames.mjs
import { pathToFileURL } from 'node:url';

const module = process.env.PLAYWRIGHT_MODULE;
const pw = await import(module ? (module.startsWith('/') ? pathToFileURL(module).href : module) : 'playwright');
const origin = (process.env.TAB_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const browser = await pw.chromium.launch(process.platform === 'darwin' ? { args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] } : {});
try {
  for (const [width, height] of [[1512, 860], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(`${origin}/?hud=0`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const stats = await page.evaluate(() => new Promise(done => {
      const track = document.getElementById('track');
      const top = track.getBoundingClientRect().top + scrollY;
      const len = track.offsetHeight - innerHeight;
      const gaps = [];
      let last = 0;
      const t0 = performance.now();
      const tick = now => {
        if (last) gaps.push(now - last);
        last = now;
        const t = Math.min(1, (now - t0) / 6000);
        scrollTo(0, top + len * t);
        if (t < 1) requestAnimationFrame(tick);
        else {
          gaps.sort((a, b) => a - b);
          const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
          done({ frames: gaps.length, mean: +mean.toFixed(2), p50: +gaps[Math.floor(gaps.length * 0.5)].toFixed(2), p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(2), max: +gaps[gaps.length - 1].toFixed(2), over20ms: gaps.filter(g => g > 20).length });
        }
      };
      scrollTo(0, top);
      requestAnimationFrame(tick);
    }));
    console.log(`${width}×${height}: ${stats.frames} frames in 6 s, mean ${stats.mean} ms, p50 ${stats.p50} ms, p95 ${stats.p95} ms, max ${stats.max} ms, ${stats.over20ms} frames over 20 ms`);
    await page.close();
  }
} finally {
  await browser.close();
}
