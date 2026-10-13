// Making a tab the way a person does: from the opening, a step at a time, pressing only what is on the screen.
// Shared by the browser tests. Each step is reached by its button in the row of steps, as a person can.

/** The name of each step in the row of steps. */
export const STEP = { bill: 'Bill', people: 'People', items: 'Items', rate: 'Rate', payee: 'Get paid' };

/** The step each labelled box is on. */
const STEP_OF = [
  [/^(What was it for\?|Total|Currency)$/, STEP.bill],
  [/^(People besides you|Name of person \d+|Amount for person \d+|Your own amount|Your name)$/, STEP.people],
  [/^Rate: one ZEC in /, STEP.rate],
  [/^(Your Zcash address|Remember my address and names on this device)$/, STEP.payee],
];

/** Shows a step, from wherever the create screen is: the opening, another step, or the links. */
export async function openStep(page, name) {
  const screen = page.locator('#app .create');
  await screen.waitFor();
  const view = await screen.getAttribute('data-view');
  if (view === 'links') {
    const edit = page.getByRole('button', { name: 'Edit the bill', exact: true });
    await ((await edit.count()) ? edit : page.getByRole('button', { name: 'Back to the bill', exact: true })).click();
  } else if (view !== 'flow') {
    await page.getByRole('button', { name: 'Start a tab', exact: true }).click();
  }
  const button = page.locator('.flow-steps button').filter({ hasText: name });
  if ((await button.getAttribute('aria-current')) !== 'step') await button.click();
  await page.locator('.flow-steps button[aria-current="step"]').filter({ hasText: name }).waitFor();
}

/** The labelled box, on its own step, which is shown first. */
export async function box(page, label) {
  const step = STEP_OF.find(([pattern]) => pattern.test(label))?.[1];
  if (!step) throw new Error(`No step is known for “${label}”`);
  await openStep(page, step);
  // The rate's label names the chosen currency ("Rate: one ZEC in USD"); any currency is the same box.
  return /^Rate: one ZEC in /.test(label) ? page.getByLabel(/^Rate: one ZEC in [A-Z]{3}$/) : page.getByLabel(label, { exact: true });
}

/** Types into a labelled box, or chooses an option for Currency, on its own step. */
export async function fillIn(page, label, value) {
  const control = await box(page, label);
  if (label === 'Currency') await control.selectOption(value);
  else await control.fill(value);
  return control;
}

/** Goes to the last step and presses Make the links. */
export async function makeLinks(page) {
  await openStep(page, STEP.payee);
  await page.getByRole('button', { name: 'Make the links', exact: true }).click();
}

/** A whole tab in one go: each part typed on its own step, then the links made. */
export async function newTab(page, { name, label, total, currency, count, people = [], amounts = [], address, rate }) {
  if (label !== undefined) await fillIn(page, 'What was it for?', label);
  if (currency !== undefined) await fillIn(page, 'Currency', currency);
  if (total !== undefined) await fillIn(page, 'Total', total);
  if (count !== undefined) await fillIn(page, 'People besides you', String(count));
  for (const [i, person] of people.entries()) await fillIn(page, `Name of person ${i + 1}`, person);
  for (const [i, amount] of amounts.entries()) if (amount !== undefined) await fillIn(page, `Amount for person ${i + 1}`, amount);
  if (name !== undefined) await fillIn(page, 'Your name', name);
  if (rate !== undefined) await fillIn(page, 'Rate: one ZEC in that currency', rate);
  if (address !== undefined) await fillIn(page, 'Your Zcash address', address);
  await makeLinks(page);
}
