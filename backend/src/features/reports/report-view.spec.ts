import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeReport, ReportDataRow } from './report-view';
import { salesEventRow } from './sales-report';

const sale = (day: string, invoice: string, line: number, gross: number, discount: number, cost: number) =>
  salesEventRow({ reportDate: day, eventType: 'SALE', invoice, invoiceLineId: line, location: 'Main',
    locationId: 1, sku: 'CAKE', product: 'Cake', qty: '1', refundQty: 0, grossSales: gross,
    discount, refundValue: 0, saleCost: cost, returnCost: 0, billCount: 1, cogsMissing: 0 });

test('sales summary, item detail, document detail and full export reconcile from the same events', () => {
  const rows = [sale('2026-09-30', 'I1', 1, 100, 10, 40),
    sale('2026-09-30', 'I2', 2, 200, 20, 80),
    salesEventRow({ reportDate: '2026-10-01', eventType: 'REFUND', invoice: 'I1', refund: 'R1', location: 'Main',
      locationId: 1, sku: 'CAKE', product: 'Cake', qty: 0, refundQty: '1', grossSales: 0,
      discount: 0, refundValue: 90, saleCost: 0, returnCost: 40, billCount: 0, cogsMissing: 0 }),
  ] as ReportDataRow[];
  const total = (view: 'SUMMARY' | 'ITEM_DETAIL' | 'DOCUMENT_DETAIL', metric: string) => {
    const result = materializeReport(rows, 'sales-analysis', view, 'AGGREGATED', 'location', {}, 1, 1, true);
    return result.rows.reduce((sum, row) => sum + Number(row[metric] ?? 0), 0);
  };
  for (const metric of ['grossSales', 'discount', 'refundValue', 'netSales', 'cogs', 'gp', 'netQty'])
    assert.equal(total('SUMMARY', metric), total('ITEM_DETAIL', metric), `${metric} summary=item`);
  for (const metric of ['grossSales', 'discount', 'refundValue', 'netSales', 'cogs', 'gp', 'netQty'])
    assert.equal(total('ITEM_DETAIL', metric), total('DOCUMENT_DETAIL', metric), `${metric} item=document`);
  assert.equal(total('SUMMARY', 'grossSales'), 300);
  assert.equal(total('SUMMARY', 'discount'), 30);
  assert.equal(total('SUMMARY', 'netSales'), 180);
  assert.equal(total('SUMMARY', 'cogs'), 80);
  assert.equal(total('SUMMARY', 'gp'), 100);
  const monthly = materializeReport(rows, 'sales-analysis', 'SUMMARY', 'MONTHLY', 'location', {}, 1, 50);
  assert.deepEqual(monthly.rows.map(row => [row.periodKey, row.netSales]), [['2026-09', '270.0000'], ['2026-10', '-90.0000']]);
  const page = materializeReport(rows, 'sales-analysis', 'DOCUMENT_DETAIL', 'DAILY', '', {}, 1, 1);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rowCount, 3);
  assert.equal(materializeReport(rows, 'sales-analysis', 'DOCUMENT_DETAIL', 'DAILY', '', {}, 1, 1, true).rows.length, 3);
});

test('unavailable historical cost makes grouped COGS and GP unavailable', () => {
  const missing = salesEventRow({ reportDate: '2026-10-08', eventType: 'SALE', invoice: 'I3', location: 'Main',
    sku: 'CAKE', product: 'Cake', qty: 1, refundQty: 0, grossSales: 100, discount: 0,
    refundValue: 0, saleCost: null, returnCost: 0, billCount: 1, cogsMissing: 1 });
  const rows = materializeReport([missing], 'sales-analysis', 'SUMMARY', 'AGGREGATED', 'location', {}, 1, 50).rows;
  assert.equal(rows[0].cogs, null);
  assert.equal(rows[0].gp, null);
  assert.equal(rows[0].cogsMissing, 1);
});

test('card channels reconcile to CARD, and methods reconcile to applied payments', () => {
  const payments: ReportDataRow[] = [
    { reportDate: '2026-10-08', paymentId: 1, paymentMethod: 'Cash', paymentValue: '100', paymentCount: 1, channel: null, channelId: null },
    { reportDate: '2026-10-08', paymentId: 2, paymentMethod: 'Card', paymentValue: '200', paymentCount: 1, channel: 'A', channelId: 10 },
    { reportDate: '2026-10-08', paymentId: 3, paymentMethod: 'Card', paymentValue: '300', paymentCount: 1, channel: 'B', channelId: 11 },
    { reportDate: '2026-10-08', paymentId: 4, paymentMethod: 'Cheque', paymentValue: '50', paymentCount: 1, channel: null, channelId: null },
  ];
  const method = materializeReport(payments, 'payment-analysis', 'SUMMARY', 'AGGREGATED', 'paymentMethod', {}, 1, 50).rows;
  const channel = materializeReport(payments, 'payment-analysis', 'SUMMARY', 'AGGREGATED', 'channel', {}, 1, 50).rows;
  assert.equal(method.reduce((sum, row) => sum + Number(row.paymentValue), 0), 650);
  assert.equal(Number(method.find(row => row.paymentMethod === 'Card')?.paymentValue), 500);
  assert.equal(channel.filter(row => row.paymentMethod === 'Card').reduce((sum, row) => sum + Number(row.paymentValue), 0), 500);
  assert.deepEqual(channel.filter(row => row.paymentMethod === 'Card').map(row => row.channel), ['A', 'B']);
});

test('inventory position includes incoming transit once and aging preserves UNKNOWN', () => {
  const position = materializeReport([
    { location: 'Source', qty: '60', stockValue: '7500', incomingTransitValue: '0', outgoingTransitValue: '3750', companyOwnedValue: '7500' },
    { location: 'Destination', qty: '30', stockValue: '4250', incomingTransitValue: '3750', outgoingTransitValue: '0', companyOwnedValue: '8000' },
  ], 'inventory-position', 'SUMMARY', 'AGGREGATED', 'location', {}, 1, 50).rows;
  assert.equal(position.reduce((sum, row) => sum + Number(row.companyOwnedValue), 0), 15500);
  assert.equal(position.reduce((sum, row) => sum + Number(row.incomingTransitValue), 0), 3750);
  const aging = materializeReport([{ location: 'Main', qty: '100', stockValue: '12500',
    qty0to30: '20', qty31to60: '20', qty61to90: '20', qty91to180: '20', qty181to365: '10', qty365plus: '0',
    unknownQty: '10', attributedQty: '90', averageAgeDays: '58', oldestAgeDays: 300 }],
  'inventory-aging', 'SUMMARY', 'AGGREGATED', 'location', {}, 1, 50).rows;
  assert.equal(aging[0].unknownQty, '10.0000');
  assert.equal(aging[0].agingCoveragePercentage, '90.0000');
  assert.equal(['qty0to30', 'qty31to60', 'qty61to90', 'qty91to180', 'qty181to365', 'qty365plus', 'unknownQty']
    .reduce((sum, field) => sum + Number(aging[0][field]), 0), 100);
});

test('every time granularity preserves the same sales total across the ISO year boundary', () => {
  const rows = [sale('2026-12-31', 'I1', 1, 100, 0, 40),
    sale('2027-01-01', 'I2', 2, 200, 0, 80)];
  for (const granularity of ['AGGREGATED', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
    const result = materializeReport(rows, 'sales-analysis', 'SUMMARY', granularity, '', {}, 1, 50);
    assert.equal(result.rows.reduce((sum, row) => sum + Number(row.netSales), 0), 300, granularity);
    assert.equal(result.rows.reduce((sum, row) => sum + Number(row.gp), 0), 180, granularity);
    if (granularity === 'WEEKLY') {
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].periodKey, '2026-W53');
    }
  }
});

test('product summary groups by product identity even when current names match', () => {
  const rows = [
    { ...sale('2026-10-08', 'I1', 1, 100, 0, 40), productId: 1, sku: 'A', product: 'Same name' },
    { ...sale('2026-10-08', 'I2', 2, 200, 0, 80), productId: 2, sku: 'B', product: 'Same name' },
  ];
  const result = materializeReport(rows, 'sales-analysis', 'SUMMARY', 'AGGREGATED', 'product', {}, 1, 50);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map(row => row.netSales).sort(), ['100.0000', '200.0000']);
});

test('item detail retains product dimensions and keeps purchasing suppliers separate', () => {
  const base = { reportDate: '2026-10-08', location: 'Main', locationId: 1,
    productId: 1, sku: 'BREAD', product: 'Bread', brand: 'Bakery Brand',
    primarySupplier: 'Primary Supplier', categoryLevel1: 'Baked goods',
    categoryLevel2: 'Bread', categoryLevel3: 'Loaves', qty: '2', lineValue: '200' };
  const rows = materializeReport([{ ...base, supplier: 'A' }, { ...base, supplier: 'B' }],
    'supplier-purchases', 'ITEM_DETAIL', 'DAILY', '', {}, 1, 50).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.supplier), ['A', 'B']);
  for (const row of rows) assert.deepEqual([
    row.sku, row.product, row.brand, row.primarySupplier,
    row.categoryLevel1, row.categoryLevel2, row.categoryLevel3,
  ], ['BREAD', 'Bread', 'Bakery Brand', 'Primary Supplier', 'Baked goods', 'Bread', 'Loaves']);
  const refund = materializeReport([{ ...base, refundValue: '50' }],
    'refunds', 'ITEM_DETAIL', 'DAILY', '', {}, 1, 50).rows[0];
  assert.equal(refund.categoryLevel3, 'Loaves');
  assert.equal(refund.brand, 'Bakery Brand');
});
