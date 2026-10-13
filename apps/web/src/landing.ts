import './landing.css';
import { h } from './dom.ts';
import { bigMark, centrepiece, ticker } from './landing-hero.ts';
import { motionPaused, onMotionPause, setMotionPaused } from './landing-motion.ts';
import { sections } from './landing-sections.ts';

/** The approved line for the sample dinner, after its link; the link opens the existing `?demo` route. */
export const SAMPLE_LINE = ' on Zcash’s test network, with test coins only.';

/** The sample dinner: its link, then the approved line. */
export const sampleLine = (): HTMLElement =>
  h('p', { class: 'lz-sample' }, h('a', { href: `${location.pathname}?demo` }, 'Try a sample dinner'), SAMPLE_LINE);

/** A way in: a gold pill. */
export function goldButton(label: string, start: () => void): HTMLButtonElement {
  const button = h('button', { type: 'button', class: 'lz-pill' }, label);
  button.addEventListener('click', start);
  return button;
}

const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Brings every animation that ends (an entrance, a press, a figure rolling) to its end at once, so a pause leaves no part half drawn. */
function settle(root: Element): void {
  for (const animation of root.getAnimations({ subtree: true })) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
}

/**
 * The opening: a ticker of example splits, the headline and the way in, the centrepiece, then the last band.
 * It is a paper page inside the dark app: html.opening (set by index.html before the first paint) and html.cut-off
 * (set here while the landing is hidden, when the steps are open) switch the page's ground, header and footer.
 */
export function landing(start: () => void): HTMLElement {
  const how = h('button', { type: 'button', class: 'lz-how' }, 'How it works');
  const open = h('button', { type: 'button', class: 'lz-open' }, 'Open Ztab');
  open.addEventListener('click', start);
  // WCAG 2.2.2: one button that pauses everything that moves in the opening, and plays it again. Its name says what
  // it will do (no aria-pressed: a name that flips and a pressed state together would be said twice).
  const motionLabel = h('span', { class: 'lz-motion-label' }, 'Pause motion');
  const motion = h('button', { type: 'button', class: 'lz-motion' }, motionLabel);
  const nav = h('nav', { class: 'lz-nav', 'aria-label': 'Opening' }, how, h('a', { href: `${location.pathname}?demo` }, 'Sample dinner'), motion, open);
  const hero = h(
    'div',
    { class: 'lz-hero' },
    ticker(),
    h('h1', { id: 'landing-title' }, 'Each share is a ', h('span', { class: 'lz-key' }, 'link'), '.'),
    h('p', { class: 'lz-lead' }, 'Ztab splits a restaurant bill and gives each friend a link to pay their share in Zcash, from their own wallet.'),
    h('div', { class: 'lz-actions' }, goldButton('Start a tab', start), sampleLine()),
    centrepiece(),
  );
  const cta = h(
    'section',
    { class: 'lz-cta', 'aria-labelledby': 'lz-cta-title' },
    bigMark(),
    h('h2', { id: 'lz-cta-title' }, 'There is no account and no custody. The tab lives in the links.'),
    h('div', { class: 'lz-actions' }, goldButton('Start a tab now', start), sampleLine()),
    // The same bills again, slower, as the page's last moving line (read once, at the top).
    (() => { const strip = ticker(); strip.setAttribute('aria-hidden', 'true'); return strip; })(),
    h('p', { class: 'lz-small' }, 'Amounts are examples.'),
  );
  const section = h('section', { class: 'landing', 'aria-labelledby': 'landing-title' }, nav, hero, sections(), cta);

  // How it works: the sections below the first screen, or the last band until they are there.
  how.addEventListener('click', () => {
    const target = section.querySelector<HTMLElement>('#how-it-works') ?? cta;
    target.scrollIntoView({ behavior: calm() || motionPaused() ? 'auto' : 'smooth', block: 'start' });
  });
  // The last band's Z comes together once, when it is first seen (not while the motion is paused: then when it is played).
  if (!calm() && 'IntersectionObserver' in window) {
    let inView = false;
    const arrive = (): void => {
      if (inView && !motionPaused()) { cta.classList.add('lz-in'); seen.disconnect(); }
    };
    const seen = new IntersectionObserver(entries => { inView = entries.some(e => e.isIntersecting); arrive(); }, { threshold: 0.35 });
    seen.observe(cta);
    onMotionPause(paused => { if (!paused) arrive(); });
  } else cta.classList.add('lz-in');

  // Pause motion. A pause holds every CSS animation where it is (the class), and each part that moves holds the rest
  // (see landing-motion.ts). With the system's reduce-motion setting the opening is already still, so there the button
  // only says so: it reads Play motion and is not available.
  const syncMotion = (): void => {
    const quiet = calm();
    const stopped = quiet || motionPaused();
    motion.classList.toggle('lz-play', stopped); // the picture: a triangle to play, two bars to pause
    motionLabel.textContent = stopped ? 'Play motion' : 'Pause motion';
    motion.disabled = quiet;
    // The words are on the button (or, on a phone, its name): only the reason it is not available needs saying.
    if (quiet) motion.title = 'Your device is set to reduce motion, so the page stays still.';
    else motion.removeAttribute('title');
  };
  motion.addEventListener('click', () => setMotionPaused(!motionPaused()));
  onMotionPause(paused => {
    if (paused) settle(section);
    section.classList.toggle('lz-paused', paused);
    syncMotion();
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', syncMotion);
  syncMotion();

  const html = document.documentElement;
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const darkTheme = theme?.content ?? '#101216';
  const shown = (): boolean => section.isConnected && !section.hidden;
  const syncTheme = (): void => {
    html.classList.toggle('cut-off', !shown());
    if (theme) theme.content = shown() && html.classList.contains('opening') ? '#FBF8F1' : darkTheme;
  };
  const boot = (): void => {
    if (!section.isConnected) { requestAnimationFrame(boot); return; }
    syncTheme();
    new MutationObserver(syncTheme).observe(section, { attributes: true, attributeFilter: ['hidden'] });
    addEventListener('hashchange', syncTheme);
  };
  boot();
  return section;
}
