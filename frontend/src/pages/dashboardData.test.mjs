import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardTotals, dashboardDateRange, dailySalesSeries } from './dashboardData.ts';

test('dashboard totals retain decimal values and count invoices separately across locations', () => {
  const totals = dashboardTotals([
    { invoice: '001', location: 'A', netSales: '100.25', gp: '20.10' },
    { invoice: '001', location: 'A', netSales: '50.50', gp: '10.05' },
    { invoice: '001', location: 'B', netSales: '200', gp: '40' },
  ], [{ stockValue: '1200.50' }, { stockValue: '400.25' }]);
  assert.equal(totals.netSales, 350.75);
  assert.equal(totals.grossProfit, 70.15);
  assert.equal(totals.invoices, 2);
  assert.equal(totals.stockValue, 1600.75);
  assert.equal(dashboardTotals([], []).invoices, 0);
});
test('refund-only events reduce dashboard sales without counting another invoice', () => {
  const totals = dashboardTotals([
    { invoice: 'I1', location: 'A', billCount: 1, netSales: 900, gp: 400 },
    { invoice: 'I0', location: 'A', billCount: 0, netSales: -300, gp: -150 },
  ], []);
  assert.equal(totals.netSales, 600);
  assert.equal(totals.grossProfit, 250);
  assert.equal(totals.invoices, 1);
  assert.equal(dashboardTotals([{ invoice: 'I2', billCount: 1, netSales: 100, gp: null, cogsMissing: 1 }], []).grossProfit, null);
});
test('dashboard dates follow the tenant timezone at UTC day boundaries', () => {
  assert.deepEqual(dashboardDateRange(new Date('2026-10-05T20:00:00Z'), 'Asia/Colombo', 7), { from: '2026-09-30', to: '2026-10-06' });
});
test('daily sales series includes zero-sales dates without changing totals', () => {
  const series = dailySalesSeries([{ reportDate: '2026-10-01', netSales: 100 }, { reportDate: '2026-10-01', netSales: 50 }, { reportDate: '2026-10-03', netSales: 20 }], '2026-10-01', '2026-10-03');
  assert.deepEqual(series, [{ reportDate: '2026-10-01', netSales: 150 }, { reportDate: '2026-10-02', netSales: 0 }, { reportDate: '2026-10-03', netSales: 20 }]);
});
