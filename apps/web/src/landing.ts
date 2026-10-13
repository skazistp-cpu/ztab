import './landing.css';
import { h } from './dom.ts';
import { bigMark, heroScene, ticker } from './landing-hero.ts';
import { street } from './landing-street.ts';
import { band, counts, ring } from './landing-sections.ts';
import { motionPaused, onMotionPause, setMotionPaused } from './landing-motion.ts';
import { maskReveal } from './landing-kit.ts';
import { scrub } from './landing-scroll.ts';

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
function settleAll(root: Element): void {
  for (const animation of root.getAnimations({ subtree: true })) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
}

/**
 * The opening, in Groww's rhythm: the header, the first screen (a ticker of example splits, the headline, the way in,
 * and the dinner coming alive), the bento of four cards, settling up, a band of night with the pay page, the ring of
 * link cards and the counts, the last band with the Z, and the foot with the example bills running slowly.
 * It is a white page inside the dark app: html.opening (set by index.html before the first paint) and html.cut-off
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
    h('h1', { id: 'landing-title' }, 'Each share is a ', h('span', { class: 'lz-key' }, 'link'), h('span', { class: 'lz-dot' }, '.')),
    h('p', { class: 'lz-lead' }, 'Ztab splits a restaurant bill and gives each friend a link to pay their share in Zcash, from their own wallet.'),
    h('div', { class: 'lz-actions' }, goldButton('Start a tab', start), sampleLine()),
  );
  // The first screen's words and its dinner open the street: one camera move from the table down five stations, ending
  // at night; the header turns to night glass with it.
  let nightfall = false;
  const road = street(hero, heroScene(), dark => { nightfall = dark; askHeader(); });
  const mark = bigMark();
  const cta = h(
    'section',
    { class: 'lz-cta', 'data-night': '', 'aria-labelledby': 'lz-cta-title' },
    mark,
    h('h2', { id: 'lz-cta-title' }, 'There is no account and no custody. The tab lives in the links.'),
    h('div', { class: 'lz-actions' }, goldButton('Start a tab now', start), sampleLine()),
  );
  // The foot: the same bills again, slower (read once, at the top), and what the amounts are.
  const strip = ticker();
  strip.setAttribute('aria-hidden', 'true');
  const foot = h('div', { class: 'lz-foot' }, strip, h('p', { class: 'lz-small' }, 'Amounts are examples.'));
  // The page's progress: a hairline of gold under the header, following the scroll.
  const progress = h('i', { class: 'lz-progress', 'aria-hidden': 'true' });
  const section = h('div', { class: 'landing' }, nav, progress, road.section, band(), ring(), counts(), cta, foot);
  maskReveal(cta.querySelector('h2') as HTMLElement);
  if (!calm()) {
    scrub({
      range: () => [0, Math.max(1, document.documentElement.scrollHeight - innerHeight)],
      apply: p => { progress.style.transform = `scaleX(${p.toFixed(4)})`; },
      follow: 0.2,
    });
  }

  // The ways in lean toward the pointer (a few pixels, where there is a mouse), as if drawn by it.
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  for (const button of [nav.querySelector<HTMLElement>('.lz-open'), ...section.querySelectorAll<HTMLElement>('.lz-pill')]) {
    if (!button) continue;
    const reset = (): void => { button.style.removeProperty('--mx'); button.style.removeProperty('--my'); };
    button.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !fine.matches || calm() || motionPaused()) { reset(); return; }
      const r = button.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      button.style.setProperty('--mx', `${(Math.max(-1, Math.min(1, dx)) * 6).toFixed(2)}px`);
      button.style.setProperty('--my', `${(Math.max(-1, Math.min(1, dy)) * 4).toFixed(2)}px`);
    });
    button.addEventListener('pointerleave', reset);
    onMotionPause(paused => { if (paused) reset(); });
  }

  // How it works: the street's first station.
  how.addEventListener('click', () => road.goTo(0));
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

  // The Z grows into its light as the last band comes up the screen (as Groww's orb does); held while paused.
  let growFrame = 0;
  let growNear = false;
  const grow = (): void => {
    growFrame = 0;
    const r = cta.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.85)));
    mark.style.setProperty('--lz-grow', (0.72 + 0.28 * (1 - Math.pow(1 - t, 2))).toFixed(4));
  };
  const askGrow = (): void => { if (!growFrame && growNear && !motionPaused() && !calm()) growFrame = requestAnimationFrame(grow); };
  if (!calm() && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { growNear = entries[entries.length - 1].isIntersecting; askGrow(); }, { rootMargin: '100px 0px' }).observe(cta);
    addEventListener('scroll', askGrow, { passive: true });
    onMotionPause(paused => { if (paused) { cancelAnimationFrame(growFrame); growFrame = 0; } else askGrow(); });
  }

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
    if (paused) settleAll(section);
    section.classList.toggle('lz-paused', paused);
    syncMotion();
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', syncMotion);
  syncMotion();

  // The header: a hairline once the page has moved, and night glass while a band of night is under it.
  const html = document.documentElement;
  const nights = [...section.querySelectorAll<HTMLElement>('[data-night]')];
  let headerFrame = 0;
  const header = (): void => {
    headerFrame = 0;
    const shown = section.isConnected && !section.hidden;
    const bar = nav.getBoundingClientRect().height || 72;
    html.classList.toggle('lz-moved', shown && scrollY > 4);
    // A band of night counts from where its ground has turned dark: past most of its top padding, the light's fade.
    html.classList.toggle('lz-night', shown && (nightfall && road.section.getBoundingClientRect().bottom > bar) || shown && nights.some(el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.top + parseFloat(cs.paddingTop) * 0.6 <= bar / 2 && r.bottom - parseFloat(cs.paddingBottom) * 0.6 > bar / 2;
    }));
  };
  const askHeader = (): void => { if (!headerFrame) headerFrame = requestAnimationFrame(header); };
  addEventListener('scroll', askHeader, { passive: true });
  addEventListener('resize', askHeader, { passive: true });

  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const darkTheme = theme?.content ?? '#101216';
  const shown = (): boolean => section.isConnected && !section.hidden;
  const syncTheme = (): void => {
    html.classList.toggle('cut-off', !shown());
    if (!shown()) html.classList.remove('lz-moved', 'lz-night');
    else askHeader();
    if (theme) theme.content = shown() && html.classList.contains('opening') ? '#FFFFFF' : darkTheme;
  };
  // The logo's light runs once across it on arrival (with motion, and not while paused).
  const glint = (): void => {
    const logo = document.querySelector<HTMLElement>('.brand a');
    if (!logo || calm() || motionPaused()) return;
    const light = h('i', { class: 'lz-logo-glint', 'aria-hidden': 'true' });
    logo.append(light);
    const run = light.animate([{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], { duration: 1300, delay: 450, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' });
    const done = (): void => light.remove();
    run.onfinish = done;
    run.oncancel = done;
    onMotionPause(paused => { if (paused && light.isConnected) run.finish(); });
  };
  const boot = (): void => {
    if (!section.isConnected) { requestAnimationFrame(boot); return; }
    glint();
    syncTheme();
    new MutationObserver(syncTheme).observe(section, { attributes: true, attributeFilter: ['hidden'] });
    addEventListener('hashchange', syncTheme);
  };
  boot();
  return section;
}
