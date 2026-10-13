import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveScreen, onLeave } from '../src/leave.ts';

test('the action runs once when the screen is left, and never again', () => {
  let ran = 0;
  onLeave(() => { ran++; });
  leaveScreen();
  leaveScreen();
  assert.equal(ran, 1);
});

test('only the screen now shown is left: a newer screen replaces the older action', () => {
  const ran: string[] = [];
  onLeave(() => ran.push('first'));
  leaveScreen();
  onLeave(() => ran.push('second'));
  leaveScreen();
  assert.deepEqual(ran, ['first', 'second']);
});

test('leaving a screen that holds nothing does nothing', () => {
  assert.doesNotThrow(leaveScreen);
});

test('an action may register the next one without being run twice', () => {
  const ran: string[] = [];
  onLeave(() => { ran.push('a'); onLeave(() => ran.push('b')); });
  leaveScreen();
  assert.deepEqual(ran, ['a']);
  leaveScreen();
  assert.deepEqual(ran, ['a', 'b']);
});
