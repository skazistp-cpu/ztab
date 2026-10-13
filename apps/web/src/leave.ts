// What a screen must undo when the router replaces it. This app changes screens on `hashchange`, where no
// `pagehide` fires, so a screen that holds something (a look in flight, a key in memory) says here how to let go.
let leave: (() => void) | undefined;

/** The screen being built says what to do when it is left. One screen is shown at a time, so one is kept. */
export function onLeave(action: () => void): void {
  leave = action;
}

/** Called by the router before every new screen, and when the page itself is left. Runs the action once. */
export function leaveScreen(): void {
  const action = leave;
  leave = undefined;
  action?.();
}
