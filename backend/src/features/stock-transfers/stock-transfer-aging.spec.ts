import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAgingRow } from '../inventory-aging/inventory-aging-calculation';
import { StockTransferAgeAllocation } from './stock-transfer-age-allocation.entity';
import { allocateDispatchAge, allocateReceiptAge } from './stock-transfer-aging';

test('dispatch takes oldest age first, and partial receipts preserve that origin', () => {
  const aging = calculateAgingRow({ locationId: 1, productId: 1, quantityOnHand: '100', averageCost: '125' }, [
    { locationId: 1, productId: 1, agingDate: '2026-06-01', quantity: '20', sourceType: 'GRN', sourceId: 1, sourceLineId: 1 },
    { locationId: 1, productId: 1, agingDate: '2026-08-01', quantity: '30', sourceType: 'GRN', sourceId: 2, sourceLineId: 2 },
    { locationId: 1, productId: 1, agingDate: '2026-09-01', quantity: '50', sourceType: 'GRN', sourceId: 3, sourceLineId: 3 },
  ], '2026-10-07');
  const dispatch = allocateDispatchAge(aging, '40');
  assert.deepEqual(dispatch, [
    { originAgingDate: '2026-06-01', dispatchedQuantity: '20.0000' },
    { originAgingDate: '2026-08-01', dispatchedQuantity: '20.0000' },
  ]);
  const allocations = dispatch.map((part, index) => ({ stockTransferAgeAllocationId: index + 1, ...part, receivedQuantity: '0.0000' })) as StockTransferAgeAllocation[];
  const received = allocateReceiptAge(allocations, '10');
  assert.equal(received.length, 1);
  assert.equal(received[0].allocation.originAgingDate, '2026-06-01');
  assert.equal(received[0].receivedQuantity, '10.0000');
});

test('unattributed source stock dispatches as null origin date', () => {
  const aging = calculateAgingRow({ locationId: 1, productId: 1, quantityOnHand: '10', averageCost: '125' }, [], '2026-10-07');
  assert.deepEqual(allocateDispatchAge(aging, '4'), [{ originAgingDate: null, dispatchedQuantity: '4.0000' }]);
});

test('mixed dated and UNKNOWN stock allocates dates oldest-first, then UNKNOWN', () => {
  const aging = calculateAgingRow({ locationId: 1, productId: 1, quantityOnHand: '100', averageCost: '125' }, [
    { locationId: 1, productId: 1, agingDate: '2026-08-01', quantity: '30', sourceType: 'ADJI', sourceId: 1, sourceLineId: 1 },
    { locationId: 1, productId: 1, agingDate: '2026-09-01', quantity: '40', sourceType: 'AVIN', sourceId: 2, sourceLineId: 2 },
  ], '2026-10-07');
  assert.equal(aging.unknownQty, '30.0000');
  assert.deepEqual(allocateDispatchAge(aging, '50'), [
    { originAgingDate: '2026-08-01', dispatchedQuantity: '30.0000' },
    { originAgingDate: '2026-09-01', dispatchedQuantity: '20.0000' },
  ]);
  assert.deepEqual(allocateDispatchAge(aging, '80'), [
    { originAgingDate: '2026-08-01', dispatchedQuantity: '30.0000' },
    { originAgingDate: '2026-09-01', dispatchedQuantity: '40.0000' },
    { originAgingDate: null, dispatchedQuantity: '10.0000' },
  ]);
});
