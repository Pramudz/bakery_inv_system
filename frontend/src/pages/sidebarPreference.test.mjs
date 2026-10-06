import assert from 'node:assert/strict';
import test from 'node:test';
import { readSidebarPreference, saveSidebarPreference } from '../app/sidebarPreference.ts';

test('sidebar defaults open and restores the last saved preference', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readSidebarPreference(storage), false);
  saveSidebarPreference(storage, true);
  assert.equal(readSidebarPreference(storage), true);
  saveSidebarPreference(storage, false);
  assert.equal(readSidebarPreference(storage), false);
});
test('blocked browser storage leaves sidebar controls usable', () => {
  const storage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  assert.equal(readSidebarPreference(storage), false);
  assert.doesNotThrow(() => saveSidebarPreference(storage, true));
});
