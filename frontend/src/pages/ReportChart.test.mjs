import assert from 'node:assert/strict';
import test from 'node:test';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const filename = fileURLToPath(new URL('./ReportChart.tsx', import.meta.url));
const compiled = buildSync({ entryPoints: [filename], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] }).outputFiles[0].text;
const module = new Module(filename);
module.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)));
module._compile(compiled, filename);
const { ReportChart } = module.exports;

test('embedded dashboard charts omit duplicate headings while full reports retain them', () => {
  const props = { reportId: 'product-sales', rows: [{ product: 'Bread', netSales: 100 }], dimension: 'product', granularity: 'DAY' };
  const embedded = renderToStaticMarkup(createElement(ReportChart, { ...props, hideHeading: true }));
  const full = renderToStaticMarkup(createElement(ReportChart, props));
  assert.ok(!embedded.includes('Performance breakdown'));
  assert.ok(full.includes('Performance breakdown'));
  assert.ok(embedded.includes('Bread'));
});
test('payment breakdown includes all methods rather than silently dropping methods after eight', () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ paymentMethod: `Method ${i + 1}`, paymentValue: 10 }));
  const html = renderToStaticMarkup(createElement(ReportChart, { reportId: 'payment-methods', rows, dimension: 'paymentMethod', granularity: 'DAY' }));
  assert.ok(html.includes('Method 9'));
  assert.ok(html.includes('90'));
});

test('refund-only day remains negative in the sales chart', () => {
  const rows = [{ reportDate: '2026-10-06', netSales: -300 }];
  const html = renderToStaticMarkup(createElement(ReportChart, { reportId: 'daily-sales', rows, dimension: 'reportDate', granularity: 'DAY' }));
  assert.ok(html.includes('-300'));
  assert.ok(html.includes('06/10/2026'));
});

test('server ranked chart shows all ten products in database order with SKU labels', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ sku: `P-${i + 1}`, product: `Bread ${i + 1}`, netSales: 10 - i }));
  const html = renderToStaticMarkup(createElement(ReportChart, { reportId: 'sales-analysis', rows,
    dimension: 'product', granularity: 'AGGREGATED', serverRankedTopN: true }));
  assert.ok(html.includes('P-10 — Bread 10'));
  assert.ok(html.indexOf('P-1 — Bread 1') < html.indexOf('P-10 — Bread 10'));
  assert.ok(html.includes('Top 10 by Actual Net Sales'));
  assert.ok(!html.includes('of 10 groups'));
});
