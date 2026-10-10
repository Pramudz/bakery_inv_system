import assert from 'node:assert/strict';
import test from 'node:test';
import { clearRecoveryIntent, listRecoveryIntents, markRecoveryUncertain, newRecoveryIntent, readRecoveryIntent, recoveryStorageKey, saveRecoveryIntent } from '../transactionRecoveryStorage.ts';

const uuid = '9f0daa67-f2bd-4cd6-af61-c3ca8c562ef7';
function memory() {
  const rows = new Map();
  return { rows, storage: {
    get length() { return rows.size; },
    key: (index) => [...rows.keys()][index] ?? null,
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: (key) => rows.delete(key),
  } };
}

test('collection intent is saved before sending and restores its original UUID and payload after refresh', () => {
  const { storage } = memory();
  const payload = { collectionKey: uuid, amount: 2000, paymentMethodId: 3, paymentChannelId: 7, referenceNumber: 'CARD-ABC' };
  const intent = newRecoveryIntent('collection', 228, 9, 64, 4, payload);
  saveRecoveryIntent(storage, intent);
  markRecoveryUncertain(storage, intent);
  const restored = listRecoveryIntents(storage, 'collection', 228, 9)[0];
  assert.equal(restored.key, uuid);
  assert.deepEqual(restored.payload, payload);
  assert.equal(restored.status, 'uncertain');
  assert.equal(readRecoveryIntent(storage, 'collection', 228, 9, 64)?.key, uuid);
  assert.equal(listRecoveryIntents(storage, 'collection', 228, 10).length, 0);
  assert.equal(listRecoveryIntents(storage, 'refund', 228, 9).length, 0);
  assert.equal(listRecoveryIntents(storage, 'collection', 229, 9).length, 0);
});

test('unresolved requests cannot be overwritten; a genuinely new request is possible after confirmed resolution', () => {
  const { storage } = memory();
  const first = newRecoveryIntent('refund', 231, 9, 67, 5, { refundKey: uuid, invoiceId: 67, reason: 'Return', details: [{ invoiceDetailId: 79, quantity: 2, returnToStock: true }], payments: [] });
  saveRecoveryIntent(storage, first);
  assert.throws(() => saveRecoveryIntent(storage, newRecoveryIntent('refund', 231, 9, 67, 5, { ...first.payload, refundKey: '62e40d37-f61a-4df7-af31-3868a127d923' })), /unresolved/);
  assert.throws(() => saveRecoveryIntent(storage, newRecoveryIntent('refund', 231, 9, 67, 5, { ...first.payload, reason: 'Changed' })), /unresolved/);
  clearRecoveryIntent(storage, first);
  const separate = newRecoveryIntent('refund', 231, 9, 67, 5, { ...first.payload, refundKey: '62e40d37-f61a-4df7-af31-3868a127d923' });
  saveRecoveryIntent(storage, separate);
  assert.equal(readRecoveryIntent(storage, 'refund', 231, 9, 67)?.key, separate.key);
});

test('corrupted state is retained and blocks replacement until manually reconciled', () => {
  const { rows, storage } = memory();
  const key = recoveryStorageKey('collection', 1, 2, 3);
  rows.set(key, '{corrupted');
  assert.throws(() => listRecoveryIntents(storage, 'collection', 1, 2), /invalid/);
  assert.equal(rows.get(key), '{corrupted');
});

test('storage failure prevents a request from being considered durable', () => {
  const { storage } = memory();
  storage.setItem = () => { throw new Error('Storage unavailable'); };
  const intent = newRecoveryIntent('collection', 1, 2, 3, 4, { collectionKey: uuid, amount: 10, paymentMethodId: 1 });
  assert.throws(() => saveRecoveryIntent(storage, intent), /Storage unavailable/);
});

test('MySQL session IDs serialized as strings are normalized before the intent is saved', () => {
  const { storage } = memory();
  const intent = newRecoveryIntent('collection', '228', '9', '64', '4', { collectionKey: uuid, amount: 10, paymentMethodId: 1 }, { registerSessionId: '31', cashierSessionId: '32' });
  saveRecoveryIntent(storage, intent);
  const restored = readRecoveryIntent(storage, 'collection', 228, 9, 64);
  assert.equal(restored.invoiceId, 64);
  assert.equal(restored.locationId, 4);
  assert.equal(restored.registerSessionId, 31);
  assert.equal(restored.cashierSessionId, 32);
});
