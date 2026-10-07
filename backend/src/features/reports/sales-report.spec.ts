import assert from 'node:assert/strict';
import test from 'node:test';
import { reportBusinessDate, SALES_SQL, salesEventRow } from './sales-report';

test('business DATE stays on its calendar day at the Colombo UTC boundary', () => {
  assert.equal(reportBusinessDate('2026-10-06', 'Asia/Colombo'), '2026-10-06');
  assert.equal(reportBusinessDate(new Date('2026-10-05T19:00:00Z'), 'Asia/Colombo'), '2026-10-06');
  assert.match(SALES_SQL, /COALESCE\(i\.business_date, DATE\(i\.invoice_date\)\) BETWEEN \? AND \?/);
  assert.match(SALES_SQL, /COALESCE\(r\.business_date, DATE\(r\.refund_date\)\) BETWEEN \? AND \?/);
});

test('sale and stock-return refund produce realized revenue, COGS and GP', () => {
  const sale = salesEventRow({ eventType: 'SALE', qty: '2', refundQty: 0, grossSales: '1000', discount: '100', refundValue: 0, saleCost: '500', returnCost: 0, billCount: 1 });
  const refund = salesEventRow({ eventType: 'REFUND', qty: 0, refundQty: '1', grossSales: 0, discount: 0, refundValue: '300', saleCost: 0, returnCost: '150', billCount: 0 });
  assert.equal(Number(sale.netSales) + Number(refund.netSales), 600);
  assert.equal(Number(sale.cogs) + Number(refund.cogs), 350);
  assert.equal(Number(sale.gp) + Number(refund.gp), 250);
  assert.equal(Number(sale.netQty) + Number(refund.netQty), 1);
});

test('refund without stock return leaves historical sale COGS intact', () => {
  const refund = salesEventRow({ eventType: 'REFUND', qty: 0, refundQty: 1, grossSales: 0, discount: 0, refundValue: 300, saleCost: 0, returnCost: 0, billCount: 0 });
  assert.equal(refund.cogs, '0.0000');
  assert.equal(refund.gp, '-300.0000');
  assert.equal(refund.billCount, 0);
  assert.match(SALES_SQL, /ledger\.movement_type = 'SALE'/);
  assert.match(SALES_SQL, /return_ledger\.movement_type = 'SALE_RETURN'/);
  assert.doesNotMatch(SALES_SQL, /inventory_balance/);
  assert.doesNotMatch(SALES_SQL, /invoice_payment/);
});

test('financial calculations retain DECIMAL(18,4) precision and signed GP percentage', () => {
  const sale = salesEventRow({ eventType: 'SALE', qty: '1.0000', refundQty: 0,
    grossSales: '0.3000', discount: '0.1000', refundValue: 0,
    saleCost: '0.1000', returnCost: 0, billCount: 1 });
  assert.equal(sale.netSales, '0.2000');
  assert.equal(sale.gp, '0.1000');
  assert.equal(sale.gpPercent, '50.0000');
  const refund = salesEventRow({ eventType: 'REFUND', qty: 0, refundQty: 1,
    grossSales: 0, discount: 0, refundValue: '0.3000', saleCost: 0,
    returnCost: '0.1000', billCount: 0 });
  assert.equal(refund.gp, '-0.2000');
  assert.equal(refund.gpPercent, '66.6667');
});

test('missing stock ledger cost is marked unavailable instead of using current WAVG', () => {
  const sale = salesEventRow({ eventType: 'SALE', qty: 1, refundQty: 0, grossSales: 100, discount: 0, refundValue: 0, saleCost: 0, returnCost: 0, billCount: 1, cogsMissing: 1 });
  assert.equal(sale.cogs, null);
  assert.equal(sale.gp, null);
  assert.equal(sale.gpPercent, null);
});
