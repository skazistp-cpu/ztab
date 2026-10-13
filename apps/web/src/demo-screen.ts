import { h, hang, row, addressBlock } from './dom.ts';
import { demoFragment, makeDemo, readDemoReceiver, readDemoSession, type DemoSession } from './demo.ts';
import { copyButton, networkStrip, requestFor, brokenLink } from './pay.ts';
import { paymentFinder } from './payment-finder.ts';
import { formatFiat } from './money.ts';
import { qrSvg } from './qr.ts';
import { onLeave } from './leave.ts';
import './demo.css';

// Deliberately public demo receiver and its independently observed 12 October test payment.
// A receiver rotation disables this example; it must never show an unrelated historical payment.
const EXAMPLE_RECEIVER = 'utest1pe4m6k3sxddcsld5njyqzugh354lx2mm45e9833yteh9z8l4erchemv4ulnd9ls65gdws3ytvs6r9zu48g0ha649xz3df64tkqj9jn9z';
const EXAMPLE = { height: 4491326, txid: 'd9b235dec4cce12888bf042d69bbfe22456c90ae0e906160bcfc0ba1fe21fa10' };


/** The public receiver is loaded only after consent, from our own deployment. No personal key is invited. */
export function demoScreen(fragment: string): HTMLElement {
  let session: DemoSession | undefined = fragment ? readDemoSession(fragment) : undefined;
  if (fragment && !session) return brokenLink();
  session ??= { createdAt: new Date().toISOString(), id: [...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join(''), marks: [false,false] };
  const current = session;
  history.replaceState(null, '', `${location.pathname}?demo#${demoFragment(current)}`);
  const status = h('p', { role: 'status' });
  const load = h('button', {type:'button',class:'primary'}, 'Load sample dinner');
  const content = h('div', {class:'demo-content'});
  let active = true, controller: AbortController | undefined, finder: ReturnType<typeof paymentFinder>;
  let publicKey: string | undefined;
  onLeave(()=>{active=false;controller?.abort();finder?.dispose();publicKey=undefined;content.replaceChildren();});
  // The caution is read before the button, in full. What a payment needs (a testnet wallet, test coins) follows the
  // button, still before any payment can be made: the shares appear only after the sample is loaded.
  const root = h('div',{class:'demo-screen'},hang(h('section',{class:'card demo-intro'},
    networkStrip('test'),h('p',{class:'eyebrow'},'Try the whole loop'),h('h1',{},'A sample dinner. A test payment.'),
    h('p',{class:'lead'},'Explore a sample bill and find our example test payment from 12 October. You can also pay a sample share with test coins and look for its note.'),
    h('p',{class:'caution'},'This is a public testnet demo. Use test coins only. Anyone can read payments and notes sent to this sample receiver with its public viewing key. Do not send personal information.'),
    h('p',{class:'actions'},load),status,
    h('div',{class:'demo-needs'},
      h('p',{},'No wallet is needed to look for the example. To send your own test payment, you need a wallet that supports current Zcash testnet and some test coins. We tested Zingo PC 2.0.26; support in other wallets may differ.'),
      h('p',{},h('a',{href:'https://faucet.testnet.valargroup.dev/',target:'_blank',rel:'noopener noreferrer',class:'tap-link'},'Get test coins from the Valar faucet'), ' for your own testnet wallet. This opens another site.'),
    ),
    h('p',{class:'demo-nav'},h('a',{href:location.pathname,class:'tap-link'},'Make your own bill'),h('a',{href:location.pathname+'?demo',class:'tap-link'},'Start a new demo')),
  )),content);
  load.addEventListener('click',async()=>{
    if(controller)return;
    const mine=(controller=new AbortController());const timer=setTimeout(()=>mine.abort(),10000);
    load.disabled=true;status.textContent='Loading the public sample receiver…';
    try{
      const response=await fetch('/demo-receiver.json',{signal:mine.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
      if(!response.ok||!response.body)throw new Error('receiver');
      const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
      while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>8192){await reader.cancel();throw new Error('receiver');}parts.push(part.value);}
      const bytes=new Uint8Array(length);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
      const receiver=readDemoReceiver(JSON.parse(new TextDecoder().decode(bytes)));
      if(!receiver)throw new Error('receiver');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(receiver.address));
      const receiverId=[...new Uint8Array(digest)].slice(0,16).map(b=>b.toString(16).padStart(2,'0')).join('');
      if(!active||!root.isConnected)return;
      if(current.receiver && current.receiver!==receiverId){status.textContent='This demo used an older sample receiver. Start a new demo instead of changing its payment requests.';return;}
      current.receiver=receiverId;
      history.replaceState(null,'',`#${demoFragment(current)}`);
      const sample=makeDemo(receiver,current);publicKey=receiver.viewingKey;
      const people=sample.table.rows.map(({share})=>{const r=requestFor(share);if(r.kind!=='request')throw new Error('request');return{name:share.name,amount:formatFiat(share.fiatShare,'USD'),zatoshis:share.zatoshis,memo:r.memo};});
      const boxes:HTMLInputElement[]=[];
      const rows=sample.table.rows.map(({share},i)=>{
        const request=requestFor(share);if(request.kind!=='request')throw new Error('request');
        const box=h('input',{type:'checkbox','aria-label':`I checked ${share.name}’s test payment`});box.checked=current.marks[i];boxes.push(box);
        box.addEventListener('change',()=>{current.marks[i]=box.checked;history.replaceState(null,'',`#${demoFragment(current)}`);finder?.clear();});
        return h('details',{class:'demo-share'},h('summary',{},`${share.name} · ${formatFiat(share.fiatShare,'USD')} · ${request.zec} test ZEC`),
          h('p',{class:'caution'},'Check that your wallet is on testnet and keeps the amount and the full note below. This receiver is public. Test coins only.'),
          h('p',{class:'actions'},h('a',{class:'button primary',href:request.uri},`Pay ${share.name}’s test share`),copyButton('Copy payment request',()=>request.uri)),
          qrSvg(request.uri,`Testnet payment request for ${share.name}`),
          h('p',{class:'demo-memo'},request.memo),addressBlock(share.payee),
          h('label',{class:'demo-tick'},box,`I checked ${share.name}’s test payment`));
      });
      finder=paymentFinder('test',current.createdAt,people,current.marks,i=>{if(!boxes[i].checked)boxes[i].click();}, undefined, receiver.address===EXAMPLE_RECEIVER ? EXAMPLE : undefined);
      if(!finder)throw new Error('finder');
      const use=h('button',{type:'button',class:'secondary'},'Use the public demo key');
      use.addEventListener('click',()=>{if(active&&publicKey)finder?.useKey(publicKey);});
      content.replaceChildren(hang(h('section',{class:'card'},
        h('h2',{},'1. The sample bill'),row('Steak · Ana','$32.00'),row('Salad · Ben','$11.50'),row('Wine · all three','$28.00'),row('Tip · 10%','$7.15'),row('Total','$78.65'),
        h('p',{},'Lena covered $10.28. Ana owes $45.46 and Ben owes $22.91. Each item and the tip are split by the same rules as a bill you make yourself.'),
        h('p',{class:'note'},'Example rate: 1 test ZEC = $1,000. This is not a market rate. The amounts are fixed for this demo session.'),
        h('h2',{},'Pay a sample share'),h('p',{},'Open Ana or Ben below. Send from your testnet wallet, then come back to check. Keep this page open or copy its link.'),...rows,
        h('h2',{},'2. Look for test payments'),h('p',{class:'note'},receiver.address===EXAMPLE_RECEIVER ? 'The check reads the fixed block of our 12 Oct 2026 example, then the recent window for this demo session (up to about two days). The example is not your payment and cannot tick your shares. Both checks depend on the testnet server being available.' : 'The historical example is unavailable for this receiver. This check searches only the recent window for this demo session (up to about two days).'),h('p',{},'Use only the public demo key below; do not paste your own wallet’s key here. Read the server disclosure, then press Look for payments. Confirmation may take a few minutes; look again after a block confirms. A result proposes a tick. You choose whether to mark it.'),
        h('p',{class:'note'},'Each demo has its own note. A matching note and amount do not prove who sent the payment. Other payments to this public receiver may appear too.'),
        h('p',{class:'actions'},use),finder.element,
        h('p',{class:'note'},'The ticks are your own record, kept in this page’s link. They are not a payment check.'),
        h('p',{class:'actions'},copyButton('Copy this demo’s link',()=>location.href)),
      )));
      // Both shares are shown without hiding their cautions or the way back to the checker.
      content.querySelector('details.demo-share')?.setAttribute('open','');
      status.textContent='Sample ready. Testnet only.';load.hidden=true;
    }catch{if(active&&root.isConnected)status.textContent='The sample receiver is unavailable. Try again later.';}
    finally{clearTimeout(timer);if(controller===mine)controller=undefined;if(active)load.disabled=false;}
  });
  return root;
}
