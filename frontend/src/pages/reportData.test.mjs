import assert from 'node:assert/strict';
import test from 'node:test';
import { filterReportRows, reportFilterOptions, groupRows } from './reportData.ts';
const rows = [
  { category: 'Bread', product: 'White', cashier: 'Ann', invoice: 'I1', qty: 2, netSales: 200, gp: 40, billCount: 1, reportDate: '2026-10-01' },
  { category: 'Bread', product: 'Brown', cashier: 'Ann', invoice: 'I1', qty: 1, netSales: 150, gp: 30, billCount: 1, reportDate: '2026-10-02' },
  { category: 'Cake', product: 'Chocolate', cashier: 'Ben', invoice: 'I2', qty: 1, netSales: 500, gp: 200, billCount: 1, reportDate: '2026-10-03' },
];
test('filters combine independently and clearing them restores all detail records', () => {
  assert.deepEqual(filterReportRows(rows, { category: 'Bread', product: 'White' }), [rows[0]]);
  assert.deepEqual(filterReportRows(rows, { category: 'Bread', cashier: 'Ben' }), []);
  assert.deepEqual(filterReportRows(rows, { category: '', product: '' }), rows);
});
test('filter choices are sorted, unique and omit missing values', () => {
  assert.deepEqual(reportFilterOptions([...rows, { category: null }, { category: '' }], 'category'), ['Bread', 'Cake']);
});
test('changing summary grouping preserves filtered totals and unique invoice counts', () => {
  const filtered = filterReportRows(rows, { cashier: 'Ann' });
  const summary = groupRows(filtered, 'category', 'DAY');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].qty, 3);
  assert.equal(summary[0].netSales, 350);
  assert.equal(summary[0].billCount, 1);
  assert.equal(summary[0].gpPercent, 20);
  assert.equal(groupRows(filtered, 'product', 'DAY').length, 2);
  assert.equal(groupRows(filtered, 'reportDate', 'MONTH')[0].reportDate, '2026-10');
});

test('pagination slices rows, clamps out-of-range pages and keeps the export dataset intact', async () => {
  const { paginateReportRows } = await import('./reportData.ts');
  const dataset = Array.from({ length: 45 }, (_, index) => ({ index }));
  const page = paginateReportRows(dataset, 2, 20);
  assert.equal(page.totalPages, 3);
  assert.equal(page.from, 21);
  assert.equal(page.to, 40);
  assert.deepEqual(page.rows, dataset.slice(20, 40));
  assert.equal(dataset.length, 45);
  assert.equal(paginateReportRows(dataset, 9, 20).page, 3);
  const empty = paginateReportRows([], 9, 20);
  assert.equal(empty.page, 1);
  assert.equal(empty.from, 0);
  assert.equal(empty.to, 0);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(paginateReportRows(Array.from({ length: 200 }, () => ({})), 5, 20).visiblePages, [1, 4, 5, 6, 10]);
});
