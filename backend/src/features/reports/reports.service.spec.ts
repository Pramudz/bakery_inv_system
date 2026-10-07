import assert from 'node:assert/strict';
import test from 'node:test';
import { ReportsService } from './reports.service';

const user = { tenantId: 1, roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] } as any;

function fixture(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const source = {
    getRepository: () => ({ findOneBy: async () => ({ timeZone: 'Asia/Colombo' }) }),
    query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return rows; },
  };
  return { service: new ReportsService(source as any), calls };
}

test('sales report uses inclusive business dates for sale and refund events', async () => {
  const { service, calls } = fixture([
    { reportDate: '2026-10-06', eventType: 'SALE', invoice: 'I1', qty: '1', refundQty: 0, grossSales: '1000', discount: '100', refundValue: 0, saleCost: '500', returnCost: 0, billCount: 1, cogsMissing: 0 },
    { reportDate: '2026-10-06', eventType: 'REFUND', invoice: 'I0', qty: 0, refundQty: '1', grossSales: 0, discount: 0, refundValue: '300', saleCost: 0, returnCost: '150', billCount: 0, cogsMissing: 0 },
  ]);
  const result = await service.run('daily-sales', { from: '2026-10-06', to: '2026-10-06' }, user);
  assert.deepEqual(calls[0].params, [1, '2026-10-06', '2026-10-06', 1, '2026-10-06', '2026-10-06']);
  assert.equal(result.rows[0].reportDate, '2026-10-06');
  assert.equal(result.rows[0].netSales, 900);
  assert.equal(result.rows[1].netSales, -300);
  assert.equal(result.rows[1].cogs, -150);
  assert.match(calls[0].sql, /r\.status = 'COMPLETED'/);
});

test('credit report includes invoice sales and refunds but no collection rows', async () => {
  const { service, calls } = fixture();
  await service.run('credit-sales', { from: '2026-10-01', to: '2026-10-31' }, user);
  assert.equal((calls[0].sql.match(/i\.is_credit_sale = 1/g) ?? []).length, 2);
  assert.doesNotMatch(calls[0].sql, /tbl_invoice_payment/);
});

test('timestamp reports use Colombo day boundaries with exclusive next day', async () => {
  const { service, calls } = fixture([{ eventAt: new Date('2026-10-05T19:00:00Z'), paymentValue: '300' }]);
  const result = await service.run('payment-methods', { from: '2026-10-06', to: '2026-10-06' }, user);
  assert.equal((calls[0].params[1] as Date).toISOString(), '2026-10-05T18:30:00.000Z');
  assert.equal((calls[0].params[2] as Date).toISOString(), '2026-10-06T18:30:00.000Z');
  assert.match(calls[0].sql, /pay\.paid_at >= \? AND pay\.paid_at < \?/);
  assert.equal(result.rows[0].reportDate, '2026-10-06');
});
