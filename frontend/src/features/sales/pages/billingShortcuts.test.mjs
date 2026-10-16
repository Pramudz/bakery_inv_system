import assert from 'node:assert/strict';
import test from 'node:test';
import { selectBillingShortcuts } from '../billingShortcuts.ts';

test('quick shortcuts follow sales ranking, ignore unavailable products, and cap both lists at five', () => {
  const products = Array.from({ length: 7 }, (_, i) => ({ productId: i + 1, name: `Item ${i + 1}`, category: `Category ${i + 1}` }));
  const selected = selectBillingShortcuts(products, { productIds: [99, 7, 6, 5, 4, 3, 2, 1], categories: ['Unknown', 'Category 7', 'Category 6', 'Category 5', 'Category 4', 'Category 3'] });
  assert.deepEqual(selected.items.map(item => item.productId), [7, 6, 5, 4, 3]);
  assert.deepEqual(selected.categories, ['Category 7', 'Category 6', 'Category 5', 'Category 4', 'Category 3']);
});

test('a location with no sales history gets available shortcuts without claiming popularity', () => {
  const selected = selectBillingShortcuts([{ productId: 1, name: 'Tea', category: 'Drinks' }]);
  assert.equal(selected.items.length, 1);
  assert.deepEqual(selected.categories, ['Drinks']);
  assert.equal(selected.hasHistory, false);
});
