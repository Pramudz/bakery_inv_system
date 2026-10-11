import assert from 'node:assert/strict';
import test from 'node:test';
import { clearMasterPayoutIntent, masterPayoutStorageKey, readMasterPayoutIntent, saveMasterPayoutIntent } from '../masterPayoutRecovery.ts';

function memory() {
  const rows = new Map();
  return { getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key), rows };
}
const original = { version: 1, tenantId: '228', userId: '9', kind: 'REFUND', sourceId: 88, createdAt: new Date().toISOString(),
  payload: { payoutKey: '9f0daa67-f2bd-4cd6-af61-c3ca8c562ef7', locationId: 4, posRegisterSessionId: 21, paymentMethodId: 3, amount: 20, reason: 'Customer refund', physicalPayerIdentity: 'Cashier A' } };

test('partial payout retains exact UUID and payload across refresh and tenant switch', () => {
  const storage = memory();
  saveMasterPayoutIntent(storage, original);
  assert.deepEqual(readMasterPayoutIntent(storage, 228, 9), original);
  assert.equal(readMasterPayoutIntent(storage, 229, 9), null);
  assert.equal(readMasterPayoutIntent(storage, 228, 10), null);
  assert.equal(storage.rows.has(masterPayoutStorageKey(228, 9)), true);
  assert.throws(() => saveMasterPayoutIntent(storage, { ...original, payload: { ...original.payload, payoutKey: 'b4083d69-7499-445b-8aa4-1f56d020d7fb' } }), /unresolved payout/i);
  clearMasterPayoutIntent(storage, original);
  assert.equal(readMasterPayoutIntent(storage, 228, 9), null);
});

test('malformed persisted payout blocks reuse without deleting evidence', () => {
  const storage = memory();
  storage.setItem(masterPayoutStorageKey(228, 9), '{broken');
  assert.throws(() => readMasterPayoutIntent(storage, 228, 9), /invalid/i);
  assert.equal(storage.getItem(masterPayoutStorageKey(228, 9)), '{broken');
});
