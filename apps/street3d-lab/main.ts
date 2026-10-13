import { mountStreet } from '../web/src/street3d/index.ts';

const SAY = [
  'Split it equally or by item, with a tip.',
  'Each link opens one standard ZIP 321 payment request for one person.',
  'At the table, show one QR: each friend scans it and chooses their name.',
  'They pay from their own Zcash wallet.',
  'Ztab cannot see payments on its own, so tick people off on your own page as payments arrive in your wallet.',
];
const NAMES: Record<string, string> = { lena: 'Lena $56.00', ana: 'Ana $56.00', dragan: 'Dragan $56.00', tomas: 'Tomás $56.00', priya: 'Priya $56.00', jonas: 'Jonas $20.00' };

const q = new URLSearchParams(location.search);
const host = document.getElementById('host')!;
const section = document.getElementById('street')!;
const caption = document.getElementById('caption')!;
const tagsEl = document.getElementById('tags')!;
const hud = document.getElementById('hud')!;
const stats = document.getElementById('stats')!;
const slider = document.getElementById('slider') as HTMLInputElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
if (q.get('hud') === '0') hud.hidden = true;

const legend = document.getElementById('legend')!;
const rows = new Map<string, HTMLElement>();
for (const [id, label] of Object.entries(NAMES)) {
  const el = document.createElement('span');
  el.textContent = label;
  legend.append(el);
  rows.set(id, el);
}
const tags = new Map<string, HTMLElement>();
for (const [id, label] of Object.entries(NAMES)) {
  const el = document.createElement('span');
  el.className = 'tag';
  el.textContent = label;
  tagsEl.append(el);
  tags.set(id, el);
}

const progressOfScroll = (): number => {
  const top = section.getBoundingClientRect().top + scrollY;
  const len = section.offsetHeight - innerHeight;
  return Math.min(1, Math.max(0, (scrollY - top) / Math.max(1, len)));
};

mountStreet(host).then(street => {
  (window as unknown as { street: typeof street }).street = street;
  let paused = false;
  const fixed = q.get('p');
  if (q.get('t')) street.debug.time(Number(q.get('t')));
  if (fixed !== null) {
    street.debug.jump(Number(fixed));
    if (q.get('still') === '1') { street.setPaused(true); paused = true; }
  } else {
    street.setProgress(progressOfScroll());
    addEventListener('scroll', () => street.setProgress(progressOfScroll()), { passive: true });
  }
  slider.addEventListener('input', () => {
    const p = Number(slider.value) / 1000;
    const top = section.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + p * (section.offsetHeight - innerHeight) });
  });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    street.setPaused(paused);
    pauseBtn.textContent = paused ? 'Play motion' : 'Pause motion';
  });
  let frames = 0, t0 = performance.now(), fps = 0;
  const tick = (): void => {
    frames++;
    const now = performance.now();
    if (now - t0 > 500) { fps = (frames * 1000) / (now - t0); frames = 0; t0 = now; }
    const s = street.debug.stats();
    // As the landing will: fade the page from white to ink over the street's dusk span.
    const [d0, d1] = street.dusk;
    const dk = Math.min(1, Math.max(0, (s.progress - d0) / (d1 - d0)));
    const e = dk * dk * (3 - 2 * dk);
    const mixc = (a: number, b: number): number => Math.round(a + (b - a) * e);
    document.body.style.background = `rgb(${mixc(255, 11)}, ${mixc(255, 12)}, ${mixc(255, 15)})`;
    caption.style.color = e > 0.5 ? '#f2f5f7' : '';
    stats.textContent = `p ${s.progress.toFixed(3)}  fps ${fps.toFixed(0)}  dpr ${s.dpr}\ncalls ${s.calls}  tris ${(s.triangles / 1000).toFixed(1)}k`;
    stats.style.whiteSpace = 'pre';
    // Caption of the nearest station.
    const k = street.stations.reduce((best, c, i) => (Math.abs(c - s.progress) < Math.abs(street.stations[best] - s.progress) ? i : best), 0);
    const near = Math.abs(street.stations[k] - s.progress) < 0.08;
    caption.innerHTML = near && q.get('cap') !== '0' ? `<small>Step ${k + 1} of 5</small>${SAY[k]}` : '';
    for (const a of street.anchors()) {
      const el = tags.get(a.id)!;
      el.classList.toggle('on', a.visible && q.get('tags') !== '0');
      el.style.left = `${a.x}px`;
      el.style.top = `${a.y}px`;
    }
    // On a phone: a compact legend under the caption, each row lit while its card, phone or coin moves.
    const its = street.items();
    legend.classList.toggle('on', near && its.some(x => x.active || x.done));
    for (const it of its) {
      const el = rows.get(it.id)!;
      el.classList.toggle('active', it.active);
      el.classList.toggle('done', !it.active && it.done);
    }
    if (!slider.matches(':active')) slider.value = String(Math.round(progressOfScroll() * 1000));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}).catch(err => {
  host.textContent = `The 3D street could not start: ${String(err)}`;
});
