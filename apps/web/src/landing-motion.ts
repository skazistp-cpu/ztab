/*
 * The visitor's choice to pause the opening's motion (WCAG 2.2.2, Pause, Stop, Hide). It lives in memory for the visit
 * and is never written to storage. The opening's button sets it; each part that moves says here what to do when it
 * changes, and asks `motionPaused()` before it starts anything of its own.
 */

let held = false;
const hooks = new Set<(paused: boolean) => void>();

/** True while the visitor has paused the motion. */
export const motionPaused = (): boolean => held;

/** Runs `hook` each time the visitor pauses (true) or plays (false). */
export function onMotionPause(hook: (paused: boolean) => void): void {
  hooks.add(hook);
}

/** Pauses or plays everything that moves in the opening. */
export function setMotionPaused(paused: boolean): void {
  if (paused === held) return;
  held = paused;
  for (const hook of hooks) hook(paused);
}
