import test from 'node:test';
import assert from 'node:assert/strict';
import { addressBadge } from '../src/address-badge.ts';
import { canReceiveMemo, checkAddress } from '../../../packages/engine/src/index.ts';

const SAPLING_TEST = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const TRANSPARENT_TEST = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';

test('nothing is shown for an empty, unfinished or wrong address', () => {
  for (const text of ['', '   ', 'ztestsapling10yy2ex5', 'not an address', `${SAPLING_TEST}x`, 'zcRYvLiURno1LhXq95e8avXFcH2fKKToSFfhqaVKTy8mGH7i6SJbfuWcm4h9rEA6DvswrbxDhFGDQgpdDYV8zwUoHvwNvFX']) {
    assert.equal(addressBadge(text), undefined, text);
  }
});

test('a shielded Sapling address is named, with no line under it', () => {
  assert.deepEqual(addressBadge(` ${SAPLING_TEST} `), { tone: 'shielded', label: 'Shielded address', detail: '' });
});

test('a transparent address is named, with the sentence the results already give', () => {
  assert.deepEqual(addressBadge(TRANSPARENT_TEST), {
    tone: 'public',
    label: 'Transparent address',
    detail: 'This address is public. Anyone who sees a payment to it can see the amount.',
  });
});

test('the badge agrees with the engine on which addresses can receive a note', () => {
  for (const address of [SAPLING_TEST, TRANSPARENT_TEST]) {
    const checked = checkAddress(address);
    assert.equal(checked.kind, 'address');
    if (checked.kind !== 'address') continue;
    assert.equal(addressBadge(address)?.tone === 'shielded', canReceiveMemo(checked.addressKind), address);
  }
});

test('no badge promises that a payment is private', () => {
  for (const address of [SAPLING_TEST, TRANSPARENT_TEST]) {
    const badge = addressBadge(address);
    assert.doesNotMatch(`${badge?.label} ${badge?.detail}`, /private|anonymous|untraceable|nobody can see|shielded payment/i);
  }
});
