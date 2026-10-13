import { readTableRoute } from './table-link.ts';
import { tablePicker, tableCodeScreen } from './table-screen.ts';
import { organiserScreen } from './organiser-screen.ts';
import { h } from './dom.ts';
import { decodeShare } from '../../../packages/engine/src/index.ts';
import { brokenLink, disagreeingLink, payScreen } from './pay.ts';
import { createScreen } from './create.ts';
import { leaveScreen } from './leave.ts';

const app = document.getElementById('app') as HTMLElement;
// Kept for the visit, so going back from a preview returns to the filled-in form and its links.
let create: HTMLElement | undefined;

let renderId = 0;
function render(): void {
  const mine = ++renderId;
  // The screen being replaced lets go of what it holds before the next one is built.
  leaveScreen();
  const fragment = location.hash.slice(1);
  // The opening is wide from the first paint (see index.html); every other screen keeps its own width.
  document.documentElement.classList.toggle('opening', fragment === '' && !new URLSearchParams(location.search).has('demo'));
  if (fragment === '' || fragment.startsWith('demo/')) document.documentElement.classList.remove('route-pay');
  if (fragment.startsWith('demo/') || (fragment === '' && new URLSearchParams(location.search).has('demo'))) {
    app.replaceChildren(h('p', {role:'status'}, 'Opening the testnet demo…'));
    void import('./demo-screen.ts').then(({ demoScreen }) => {
      if (renderId !== mine) return;
      app.replaceChildren(demoScreen(fragment));
      window.scrollTo(0, 0);
    }).catch(() => { if (renderId === mine) app.replaceChildren(brokenLink()); });
    return;
  }
  if (fragment === '') {
    create ??= createScreen();
    app.replaceChildren(create);
    return;
  }
  let screen: HTMLElement;
  try {
    if(fragment.startsWith('g')) {
      const route=readTableRoute(fragment);
      if(route.kind!=='table-route')screen=route.error==='amounts-disagree'?disagreeingLink():brokenLink();
      else if(route.view==='picker')screen=tablePicker(route.table,route.fragment);
      else if(route.view==='qr')screen=tableCodeScreen(route.table,route.fragment);
      else if(route.view==='mine')screen=organiserScreen(route.table,route.fragment,route.ticks);
      else screen=h('div',{},h('p',{},h('a',{class:'table-back',href:'#'+route.fragment},'Choose a different name')),payScreen(route.table.rows[route.view].share));
    } else {
    const decoded = decodeShare(fragment);
    screen =
      decoded.kind === 'share'
        ? payScreen(decoded.share)
        : decoded.error === 'amounts-disagree'
          ? disagreeingLink()
          : brokenLink();
    }
  } catch {
    screen = brokenLink();
  }
  app.replaceChildren(screen);
  // The pay page's width, set by index.html before the first paint for a link shaped like a pay link, stays for that
  // link even when it turns out broken, so nothing moves; flow.css keeps such a card at its usual width.
  document.documentElement.classList.toggle('route-pay', screen.querySelector('.pay') !== null || /^(s|g[^/]*\/\d+$)/.test(fragment));
  // A link opened from further down another screen would otherwise start part-way down this one.
  window.scrollTo(0, 0);
  if(fragment.startsWith('g')) {
    const heading=screen.querySelector('h1');
    heading?.setAttribute('tabindex','-1');
    heading?.focus({preventScroll:true});
  }
}

window.addEventListener('hashchange', render);
// Closing the tab or going to another site leaves the screen too, also when the page is kept for the back button.
window.addEventListener('pagehide', () => { ++renderId; leaveScreen(); });
// A page kept for the back button comes back as it was left, with its screen already told to let go.
// Build the screen again, so it starts empty and is registered to be left the next time.
window.addEventListener('pageshow', event => { if (event.persisted) render(); });
render();
