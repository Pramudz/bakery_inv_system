import assert from 'node:assert/strict';
import test from 'node:test';
import { billingDraftKey, readBillingDraft, removeBillingDraft, writeBillingDraft } from './billingDraftStorage.ts';

const memory = () => {
  const rows = new Map();
  return { rows, storage: { getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key) } };
};

test('billing drafts are isolated by tenant, user and location', () => {
  assert.notEqual(billingDraftKey(1, 2, 3), billingDraftKey(1, 9, 3));
  assert.notEqual(billingDraftKey(1, 2, 3), billingDraftKey(1, 2, 4));
  assert.notEqual(billingDraftKey(1, 2, 3), billingDraftKey(7, 2, 3));
});

test('an unfinished checkout keeps its retry key and completed checkout can be removed', () => {
  const { rows, storage } = memory();
  const key = billingDraftKey(1, 2, 3);
  writeBillingDraft(storage, key, { checkoutKey: 'same-retry-key', saleType: 'Retail', cart: [{ productId: 8, qty: 2 }], selectedCustomer: null, sellOnCredit: false, paymentEntries: [] });
  assert.equal(readBillingDraft(storage, key)?.checkoutKey, 'same-retry-key');
  removeBillingDraft(storage, key);
  assert.equal(rows.has(key), false);
  assert.equal(readBillingDraft(storage, key), null);
});

test('invalid stored data is discarded instead of becoming a reusable cart', () => {
  const { rows, storage } = memory();
  const key = billingDraftKey(1, 2, 3);
  rows.set(key, '{not-json');
  assert.equal(readBillingDraft(storage, key), null);
  assert.equal(rows.has(key), false);
});
