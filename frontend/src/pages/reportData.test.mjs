import assert from 'node:assert/strict';
import test from 'node:test';
import { filterReportRows, formatReportDate, reportFilterOptions, reportSelectorOptions, groupRows } from './reportData.ts';
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

test('business dates remain calendar dates in daily grouping and display', () => {
  const day = [{ reportDate: '2026-10-06', invoice: 'I3', billCount: 1, netSales: 900 }];
  assert.equal(groupRows(day, 'reportDate', 'DAY')[0].reportDate, '2026-10-06');
  assert.equal(formatReportDate(day[0].reportDate), '06/10/2026');
  assert.equal(groupRows([{ ...day[0], reportDate: '2026-10-07' }, ...day], 'reportDate', 'MONTH')[0].reportDate, '2026-10');
});

test('refund events reduce quantities and revenue without increasing bill count', () => {
  const events = [
    { reportDate: '2026-10-01', invoice: 'I4', product: 'Cake', sku: 'SKU-25', categoryLevel1: 'Food', qty: 2, refundQty: 0, netQty: 2, netSales: 900, cogs: 500, gp: 400, billCount: 1 },
    { reportDate: '2026-10-06', invoice: 'I4', product: 'Cake', sku: 'SKU-25', categoryLevel1: 'Food', qty: 0, refundQty: 1, netQty: -1, netSales: -300, cogs: -150, gp: -150, billCount: 0 },
  ];
  const product = groupRows(events, 'product', 'DAY')[0];
  assert.equal(product.sku, 'SKU-25');
  assert.equal(product.categoryLevel1, 'Food');
  assert.equal(product.netSales, 600);
  assert.equal(product.cogs, 350);
  assert.equal(product.gp, 250);
  assert.equal(product.billCount, 1);
  assert.equal(product.netQty, 1);
  assert.equal(filterReportRows(events, { categoryLevel1: 'Food' }).length, 2);
  assert.equal(filterReportRows(events, { sku: 'SKU-25' }).length, 2);
});

test('bill count distinguishes the same invoice number at different locations', () => {
  const rows = [
    { reportDate: '2026-10-06', location: 'North', invoice: 'INV-1', billCount: 1, netSales: 100 },
    { reportDate: '2026-10-06', location: 'South', invoice: 'INV-1', billCount: 1, netSales: 200 },
  ];
  assert.equal(groupRows(rows, 'reportDate', 'DAY')[0].billCount, 2);
});

test('group with a missing sale cost does not show a false GP', () => {
  const grouped = groupRows([{ product: 'Cake', sku: 'SKU-25', invoice: 'I5', billCount: 1, netSales: 100, cogs: null, gp: null, cogsMissing: 1 }], 'product', 'DAY');
  assert.equal(grouped[0].cogs, null);
  assert.equal(grouped[0].gp, null);
});
test('SKU selector offers SKU and product name and filters the chosen product', () => {
  const products = [{ sku: 'SKU-000025', product: 'Astra Margarin 500G Tub' }, { sku: 'SKU-000026', product: 'Butter' }];
  assert.deepEqual(reportSelectorOptions(products, 'sku')[0], { value: 'SKU-000025', label: 'SKU-000025 — Astra Margarin 500G Tub' });
  assert.deepEqual(filterReportRows(products, { sku: 'SKU-000025' }), [products[0]]);
});
