import assert from 'node:assert/strict';
import test from 'node:test';
import { chartQuery, chartSupported } from './report-chart';

const source = `SELECT productId, sku, product, grossSales, discount, refundValue, location, categoryLevel1, brand FROM sales
  ORDER BY reportDate DESC`;

test('chart uses the same source and filters while ranking at most ten database groups', () => {
  const result = chartQuery('sales-analysis', source, 'product', { sku: 'P-1', brand: 'Bakery' },
    [3, '2026-10-01', '2026-10-08'], ['product', 'brand']);
  assert.match(result.sql, /FROM \(SELECT productId/);
  assert.match(result.sql, /SUM\(src\.grossSales - src\.discount - src\.refundValue\)/);
  assert.match(result.sql, /GROUP BY src\.productId/);
  assert.match(result.sql, /ORDER BY `netSales` DESC/);
  assert.match(result.sql, /LIMIT 10$/);
  assert.deepEqual(result.params, [3, '2026-10-01', '2026-10-08', 'P-1', 'Bakery']);
  assert.ok(!result.sql.includes('reportDate DESC'));
});

test('product identity keeps equal product names and separate dates in one SKU group', () => {
  const result = chartQuery('sales-analysis', source, 'product', {}, [], ['product']);
  assert.match(result.sql, /MIN\(src.sku\) AS sku, MIN\(src.product\) AS product/);
  assert.match(result.sql, /GROUP BY src\.productId/);
  assert.ok(!result.sql.includes('GROUP BY src.product, src.reportDate'));
});

test('chart support is limited to SQL backed report summaries', () => {
  assert.equal(chartSupported('sales-analysis'), true);
  assert.equal(chartSupported('inventory-aging'), false);
});
