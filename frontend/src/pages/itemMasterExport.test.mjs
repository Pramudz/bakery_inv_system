import assert from 'node:assert/strict';
import test from 'node:test';
import { exportItemMasterCsv } from '../features/products/itemMasterExport.ts';

test('exports every matching page with filters and master fields', async () => {
  const calls = [];
  const csv = await exportItemMasterCsv(async params => {
    calls.push(params);
    return { items: [{ sku: `SKU${params.page}`, productName: 'Cake, "special"', category: { categoryName: 'Bakery' }, brand: null, baseUnit: { name: 'Piece' }, isActive: params.page === 1 }], totalPages: 2 };
  }, { search: 'Cake', status: '', categoryId: '3' });
  assert.deepEqual(calls, [1, 2].map(page => ({ page, limit: 100, search: 'Cake', status: '', categoryId: '3' })));
  assert.match(csv, /SKU1/);
  assert.match(csv, /SKU2/);
  assert.match(csv, /"Cake, ""special""","Bakery","","Piece","Active"/);
  assert.match(csv, /"Inactive"/);
});

test('empty results produce headers and failed pages reject the export', async () => {
  const csv = await exportItemMasterCsv(async () => ({ items: [], totalPages: 1 }), { search: '', status: '', categoryId: '' });
  assert.equal(csv, '\uFEFF"SKU","Item Name","Category","Brand","Base Unit","Status"');
  await assert.rejects(exportItemMasterCsv(async () => { throw new Error('Unavailable'); }, { search: '', status: '', categoryId: '' }), /Unavailable/);
});
