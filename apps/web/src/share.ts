import { h } from './dom.ts';

/** Offers the native share sheet when available; Copy remains alongside it. */
export function shareButton(text: () => string): HTMLElement | false {
  if (typeof navigator.share !== 'function') return false;
  const button = h('button', { type: 'button', class: 'secondary' }, 'Send');
  const status = h('span', { class: 'copy-status share-status', role: 'status' });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = '';
    try {
      // Invoke synchronously within the click's transient user activation.
      // Resolution means handoff, not proof the person sent or received it.
      await navigator.share({ text: text() });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        status.textContent = 'Could not open sharing. Use Copy link instead.';
      }
    } finally {
      button.disabled = false;
    }
  });
  return h('span', { class: 'copy' }, button, status);
}
