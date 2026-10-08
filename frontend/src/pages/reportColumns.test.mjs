import assert from 'node:assert/strict';
import test from 'node:test';
import { columnsFor, ITEM_DIMENSIONS } from './reportColumns.ts';
import { LABELS } from './reportLabels.ts';
import { reportCsv, reportPdf } from './reportExport.ts';

const row = {
  periodKey: '2026-10-08', rateFrom: '2026-09-09', rateTo: '2026-10-08',
  sku: 'BREAD', product: 'Bread', brand: 'Bakery Brand', primarySupplier: 'Supplier',
  categoryLevel1: 'Baked goods', categoryLevel2: 'Bread', categoryLevel3: 'Loaves',
  location: 'Main', supplier: 'Receiving Supplier', qty: '2.0000', receivedQty: '1.0000',
  lineValue: '200.0000', refundValue: '30.0000', netSales: '170.0000',
  stockValue: '250.0000', unknownQty: '0.0000', rateHorizonDays: 30,
};

test('every product item view exposes the same ordered master dimensions to screen and exports', () => {
  for (const [id, dated, replenishment] of [
    ['sales-analysis', true, false], ['credit-sales', true, false],
    ['inventory-position', false, false], ['inventory-aging', false, false],
    ['stock-replenishment', true, true], ['refunds', true, false],
    ['purchase-orders', true, false], ['grn-report', true, false],
    ['supplier-purchases', true, false],
  ]) {
    const columns = columnsFor({ id, dated, replenishment }, 'ITEM_DETAIL', 'DAILY', '', [row]);
    const start = replenishment ? 2 : dated ? 1 : 0;
    assert.deepEqual(columns.slice(start, start + ITEM_DIMENSIONS.length), [...ITEM_DIMENSIONS], id);
    assert.ok(columns.includes('qty'), id);
  }
  const nullable = { ...row, brand: null, primarySupplier: null };
  const columns = columnsFor({ id: 'refunds', dated: true }, 'ITEM_DETAIL', 'DAILY', '', [nullable]);
  assert.ok(columns.includes('brand'));
  assert.ok(columns.includes('primarySupplier'));
});

test('CSV and PDF use the item table columns and normalized values', async () => {
  const columns = columnsFor({ id: 'sales-analysis', dated: true }, 'ITEM_DETAIL', 'DAILY', '', [row]);
  const headers = columns.map(field => LABELS[field] ?? field);
  const values = columns.map(field => row[field]);
  const csv = reportCsv(headers, [values]);
  for (const value of ['BREAD', 'Bakery Brand', 'Supplier', 'Baked goods', 'Bread', 'Loaves', 'Main'])
    assert.ok(csv.includes(`"${value}"`), `CSV contains ${value}`);
  const oldDocument = globalThis.document;
  const drawn = [];
  const canvas = { getContext: () => ({
    measureText: text => ({ width: [...text].length * 10 }),
    fillRect() {}, fillText(text) { drawn.push(text); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  }), toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement: () => canvas };
  try {
    const blob = await reportPdf({ title: 'Sales Analysis', metadata: [], headers,
      rows: [values.map(value => value == null ? '' : String(value))] });
    assert.equal(blob.type, 'application/pdf');
    for (const field of ITEM_DIMENSIONS) {
      assert.ok(drawn.includes(LABELS[field] ?? field), `PDF header ${field}`);
      assert.ok(drawn.includes(String(row[field])), `PDF value ${field}`);
    }
  } finally { globalThis.document = oldDocument; }
});
