import assert from 'node:assert/strict';
import test from 'node:test';
import { filterPosProducts } from '../posProductSearch.ts';

const items = [
  { code: 'TEA', name: 'Ceylon Tea', category: 'Beverages' },
  { code: 'CAKE', name: 'Tea Cake', category: 'Bakery' },
];
test('category filter defaults to all and combines exact category with case-insensitive search', () => {
  assert.deepEqual(filterPosProducts(items, '', 'All categories'), items);
  assert.deepEqual(filterPosProducts(items, '', 'Bakery'), [items[1]]);
  assert.deepEqual(filterPosProducts(items, ' tea ', 'Beverages'), [items[0]]);
  assert.deepEqual(filterPosProducts(items, 'CAKE', 'Beverages'), []);
});
