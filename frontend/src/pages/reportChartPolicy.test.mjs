import assert from 'node:assert/strict';
import test from 'node:test';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const filename = fileURLToPath(new URL('./reportChartPolicy.ts', import.meta.url));
const compiled = buildSync({ entryPoints: [filename], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const module = new Module(filename);
module.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)));
module._compile(compiled, filename);
const { chartParameters, showAggregatedChart } = module.exports;

test('only aggregated summary groups request the breakdown chart', () => {
  assert.equal(showAggregatedChart('sales-analysis', 'SUMMARY', 'AGGREGATED', 'product'), true);
  for (const granularity of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
    assert.equal(showAggregatedChart('sales-analysis', 'SUMMARY', granularity, 'product'), false);
  for (const view of ['ITEM_DETAIL', 'DOCUMENT_DETAIL'])
    assert.equal(showAggregatedChart('sales-analysis', view, 'AGGREGATED', 'product'), false);
  assert.equal(showAggregatedChart('sales-analysis', 'SUMMARY', 'AGGREGATED', ''), false);
  assert.equal(showAggregatedChart('inventory-aging', 'SUMMARY', 'AGGREGATED', 'location'), false);
});

test('chart request retains active filters and is independent of table pagination and export', () => {
  const table = new URLSearchParams('from=2026-10-01&to=2026-10-08&sku=P-1&locationId=2&groupBy=product&page=4&pageSize=20&all=1');
  const chart = chartParameters(table);
  assert.equal(chart.get('sku'), 'P-1');
  assert.equal(chart.get('locationId'), '2');
  assert.equal(chart.get('chart'), '1');
  for (const key of ['page', 'pageSize', 'all']) assert.equal(chart.has(key), false);
  assert.equal(table.get('page'), '4');
  assert.equal(table.get('all'), '1');
});
