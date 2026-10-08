import assert from 'node:assert/strict';
import test from 'node:test';
import { firstValueFrom, of } from 'rxjs';
import { PosCostVisibilityInterceptor } from './pos-cost-visibility.interceptor';

test('cashier document responses omit sale and refund cost snapshots, including nested original lines', async () => {
  const response = {
    details: [{ netTotal: '500.00', unitCostSnapshot: '125.2500', cogsAmount: '250.5000',
      invoiceDetail: { netTotal: '500.00', unitCostSnapshot: '125.2500', cogsAmount: '250.5000' },
      originalUnitCostSnapshot: '125.2500', cogsReversalAmount: '125.2500' }],
  };
  const output = await firstValueFrom(new PosCostVisibilityInterceptor().intercept({} as never, { handle: () => of(response) }));
  assert.deepEqual(output, { details: [{ netTotal: '500.00', invoiceDetail: { netTotal: '500.00' } }] });
  assert.equal(response.details[0].unitCostSnapshot, '125.2500', 'the service result is not mutated');
});
