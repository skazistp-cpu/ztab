import '../web/src/styles.css';
import './lab.css';
import { mountWalletBand, renderWalletBandStatic, type BandHandle } from '../web/src/landing-band/index.ts';

/*
 * The wallet band's lab: a tall scroll span with the band pinned in it, fed the span's progress; a HUD with the
 * progress, the frame rate, Pause and a reduced-motion switch (the still). Query: ?p=0.6 holds the band at a
 * progress (for stills), ?still=1 pauses it, ?static=1 shows the still, ?hud=0 hides the HUD. window.lab drives it
 * from a test.
 */

const q = new URLSearchParams(location.search);
const track = document.getElementById('track')!;
const host = document.getElementById('host')!;
const hud = document.getElementById('hud')!;
const stats = document.getElementById('stats')!;
const slider = document.getElementById('slider') as HTMLInputElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const calmBox = document.getElementById('calm') as HTMLInputElement;
if (q.get('hud') === '0') hud.hidden = true;

const fixed = q.get('p') === null ? undefined : Math.min(1, Math.max(0, Number(q.get('p'))));
let handle: BandHandle | undefined;
let paused = false;
let still = matchMedia('(prefers-reduced-motion: reduce)').matches || q.get('static') === '1';
calmBox.checked = still;

const progressOfScroll = (): number => {
  const top = track.getBoundingClientRect().top + scrollY;
  const len = track.offsetHeight - innerHeight;
  return Math.min(1, Math.max(0, (scrollY - top) / Math.max(1, len)));
};
const scrollTo = (p: number): void => {
  const top = track.getBoundingClientRect().top + scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight) });
};

function mount(): void {
  handle?.dispose();
  handle = undefined;
  host.replaceChildren();
  document.documentElement.classList.toggle('lab-static', still);
  if (still) { renderWalletBandStatic(host); return; }
  handle = mountWalletBand(host);
  handle.setProgress(fixed ?? progressOfScroll());
  if (paused) handle.setPaused(true);
}
mount();

addEventListener('scroll', () => { if (fixed === undefined) handle?.setProgress(progressOfScroll()); }, { passive: true });
addEventListener('resize', () => { if (fixed === undefined) handle?.setProgress(progressOfScroll()); }, { passive: true });
if (fixed !== undefined) {
  // Held at a progress: the page is scrolled there too, so the pinned stage is on the screen as it would be.
  const go = (): void => { scrollTo(fixed); handle?.setProgress(fixed); };
  go();
  void document.fonts?.ready.then(go);
  if (q.get('still') === '1') { paused = true; handle?.setPaused(true); pauseBtn.textContent = 'Play'; }
}

slider.addEventListener('input', () => { const p = Number(slider.value) / 1000; scrollTo(p); handle?.setProgress(p); });
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  handle?.setPaused(paused);
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
});
calmBox.addEventListener('change', () => { still = calmBox.checked; mount(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', event => { still = event.matches; calmBox.checked = still; mount(); });

// The HUD: progress and frames per second.
let frames = 0;
let t0 = performance.now();
let fps = 0;
const tick = (): void => {
  frames++;
  const now = performance.now();
  if (now - t0 > 500) { fps = (frames * 1000) / (now - t0); frames = 0; t0 = now; }
  const p = fixed ?? progressOfScroll();
  stats.textContent = `p ${p.toFixed(3)}  fps ${fps.toFixed(0)}  ${still ? 'still' : paused ? 'paused' : 'scrubbing'}`;
  if (!slider.matches(':active')) slider.value = String(Math.round(p * 1000));
  requestAnimationFrame(tick);
};
if (!hud.hidden) requestAnimationFrame(tick);

// For the tests.
declare global { interface Window { lab: { setProgress(p: number): void; setPaused(hold: boolean): void; still(on: boolean): void; progress(): number; scrollTo(p: number): void } } }
window.lab = {
  setProgress: (p: number): void => { handle?.setProgress(p); },
  setPaused: (hold: boolean): void => { paused = hold; handle?.setPaused(hold); pauseBtn.textContent = hold ? 'Play' : 'Pause'; },
  still: (on: boolean): void => { still = on; calmBox.checked = on; mount(); },
  progress: (): number => fixed ?? progressOfScroll(),
  scrollTo,
};
