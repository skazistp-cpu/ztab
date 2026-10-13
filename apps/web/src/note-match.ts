import { h } from './dom.ts';

export const NOTE_MATCH_LIMIT = 'A matching note helps you find a request. It does not prove which request was used, who sent the payment, or how much arrived; check the transaction in your wallet.';

/** A local comparison, never a receipt verifier. Candidate indices preserve duplicate names/notes. */
export function noteMatcher(
  people: { name: string; amount: string; memo?: string }[],
  marks: boolean[],
  tick: (index: number) => void,
): { element: HTMLElement; clear: () => void } {
  const input = h('textarea', { id: 'received-note', rows: '3', maxlength: '4096', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'note-match-limit note-match-local' });
  const status = h('p', { role: 'status', 'aria-atomic': 'true' });
  const choices = h('div', { class: 'note-match-result' });
  const clear = (): void => { choices.replaceChildren(); status.textContent = ''; };
  const form = h('form', { class: 'note-match' },
    h('h2', {}, 'Match a note'),
    h('p', { class: 'note', id: 'note-match-limit' }, NOTE_MATCH_LIMIT),
    h('label', { class: 'field', for: 'received-note' }, h('span', {}, 'Paste a note from a payment in your wallet')),
    input,
    h('p', { class: 'note', id: 'note-match-local' }, 'Compared on this page only, then cleared. The pasted text is never saved or sent.'),
    h('p', { class: 'actions' }, h('button', { type: 'submit', class: 'secondary' }, 'Find matching requests')),
    status, choices,
  );
  input.addEventListener('input', clear);
  form.addEventListener('submit', event => {
    event.preventDefault();
    clear();
    const text = input.value.trim();
    input.value = '';
    if (!text) { status.textContent = 'Paste a note to compare with this tab.'; return; }
    const matches = people.flatMap((person, index) => person.memo !== undefined && person.memo === text ? [index] : []);
    if (!matches.length) {
      // A familiar suffix is not evidence of provenance, so do not assert where an unmatched note came from.
      status.textContent = 'This note does not match a request in this tab.';
      return;
    }
    status.textContent = matches.length === 1
      ? `This note is the one in ${people[matches[0]].name}’s request.`
      : `This note matches ${matches.length} requests. Check the transaction in your wallet, then choose the person yourself.`;
    for (const index of matches) {
      const person = people[index];
      const name = matches.length > 1 ? `${person.name} (person ${index + 1})` : person.name;
      const row = h('div', { class: 'note-match-choice' }, h('p', {}, `${name} · ${person.amount}`));
      if (marks[index]) row.append(h('p', {}, `${name} is already ticked.`));
      else {
        const button = h('button', { type: 'button', class: 'secondary' }, `Tick ${name}`);
        button.addEventListener('click', () => {
          if (!marks[index]) tick(index);
          clear();
          status.textContent = `${name} is ticked. This is your mark, not a payment check.`;
          // The confirmation button is removed; return keyboard focus to the labelled input.
          input.focus();
        });
        row.append(button);
      }
      choices.append(row);
    }
  });
  return { element: form, clear };
}
