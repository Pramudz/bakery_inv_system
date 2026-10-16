import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

test('billing shortcut rankings use tenant/location scoped recent completed sales', async () => {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const service = new InvoicesService({
    getRepository: () => ({ findOneBy: async () => ({ locationId: 9 }) }),
    query: async (sql: string, params: any[]) => { calls.push({ sql, params }); return sql.includes('AS productId') ? [{ productId: '7' }, { productId: '2' }] : [{ category: 'Drinks' }]; },
  } as any, {} as any, {} as any);
  const result = await service.billingShortcuts(9, { tenantId: 4, accessScope: 'TENANT' } as any);
  assert.deepEqual(result, { productIds: [7, 2], categories: ['Drinks'], periodDays: 30 });
  assert.equal(calls.length, 2);
  for (const { sql, params } of calls) {
    assert.ok(sql.includes('invoice.tenant_id = ?'));
    assert.ok(sql.includes('invoice.location_id = ?'));
    assert.ok(sql.includes("'COMPLETED', 'PARTIALLY_REFUNDED'"));
    assert.ok(sql.includes('COUNT(DISTINCT invoice.invoice_id)'));
    assert.deepEqual(params.slice(0, 2), [4, 9]);
    assert.equal(params[3].getTime() - params[2].getTime(), 30 * 24 * 60 * 60 * 1000);
  }
  calls.length = 0;
  await assert.rejects(service.billingShortcuts(9, { tenantId: 4, accessScope: 'LOCATION', assignedLocationIds: [8] } as any), ForbiddenException);
  assert.equal(calls.length, 0);
});
