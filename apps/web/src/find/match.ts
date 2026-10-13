/** A payment found for the organiser's viewing key: what arrived, and the note that came with it. */
export type FoundNote = { txid: string; zatoshis: string; memo: string | null };

export type Asked = { name: string; zatoshis: string; memo?: string };

/** One found payment and the people whose request carries its note; `amount` says whether their share is what arrived. */
export type Fit = { note: FoundNote; people: { index: number; amount: boolean }[] };

/**
 * Sorts found payments into those that carry the note of a request in this tab and the others.
 * The rule for the note is the matcher's: exact equality. People with the same note stay separate,
 * by position. A request without a note is never matched by amount alone.
 */
export function sortFound(asked: Asked[], notes: FoundNote[]): { fits: Fit[]; others: FoundNote[] } {
  const fits: Fit[] = [], others: FoundNote[] = [];
  for (const note of notes) {
    const people = note.memo === null ? [] : asked.flatMap((person, index) =>
      person.memo !== undefined && person.memo === note.memo ? [{ index, amount: person.zatoshis === note.zatoshis }] : []);
    if (people.length) fits.push({ note, people }); else others.push(note);
  }
  return { fits, others };
}
