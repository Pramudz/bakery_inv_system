import assert from 'node:assert/strict';
import test from 'node:test';
import { parentCategoryOptions } from './categoryHierarchy.ts';

const rows = [
  { categoryId: 1, parentCategoryId: null, categoryName: 'Food' },
  { categoryId: 2, parentCategoryId: 1, categoryName: 'Beverages' },
  { categoryId: 3, parentCategoryId: 2, categoryName: 'Soft Drinks' },
  { categoryId: 4, parentCategoryId: null, categoryName: 'Other' },
];

test('parent choices display paths and exclude level three parents', () => {
  assert.deepEqual(parentCategoryOptions(rows).map(item => item.label), ['Food', 'Food > Beverages', 'Other']);
});

test('moving a subtree hides parents that would exceed level three or create a cycle', () => {
  assert.deepEqual(parentCategoryOptions(rows, 1).map(item => item.label), []);
  assert.deepEqual(parentCategoryOptions(rows, 2).map(item => item.label), ['Food', 'Other']);
});
