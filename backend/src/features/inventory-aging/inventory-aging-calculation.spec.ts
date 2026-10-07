import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAgingRow, AgingInboundEvent } from './inventory-aging-calculation';

const event = (date: string | null, quantity: string, id: number): AgingInboundEvent => ({
  locationId: 1, productId: 2, agingDate: date, quantity, sourceType: 'GRN', sourceId: id, sourceLineId: id,
});

test('current QOH takes newest effective inbounds, leaves unknown, and values at WAVG', () => {
  const row = calculateAgingRow({ locationId: 1, productId: 2, quantityOnHand: '100', averageCost: '125' }, [
    event('2026-09-27', '20', 1), event('2026-08-28', '30', 2), event('2026-06-29', '40', 3),
  ], '2026-10-07');
  assert.deepEqual(row.composition.map(part => part.quantity), ['20.0000', '30.0000', '40.0000']);
  assert.equal(row.unknownQty, '10.0000');
  assert.equal(row.attributedQty, '90.0000');
  assert.equal(row.agingCoveragePercentage, '90.0000');
  assert.equal(row.inventoryValue, '12500.0000');
  assert.equal(row.averageAgeDays, '60.0000');
  assert.equal(row.oldestAgeDays, 100);
});

test('every bucket boundary and unknown reconcile to current QOH', () => {
  const ages = [0, 30, 31, 60, 61, 90, 91, 180, 181, 365, 366];
  const inbound = ages.map((days, index) => event(new Date(Date.UTC(2026, 9, 7 - days)).toISOString().slice(0, 10), '1', index));
  const row = calculateAgingRow({ locationId: 1, productId: 2, quantityOnHand: '12', averageCost: '2' }, inbound, '2026-10-07');
  assert.deepEqual([row.qty0to30, row.qty31to60, row.qty61to90, row.qty91to180, row.qty181to365, row.qty365plus, row.unknownQty],
    ['2.0000', '2.0000', '2.0000', '2.0000', '2.0000', '1.0000', '1.0000']);
  assert.equal(row.inventoryValue, '24.0000');
  assert.equal(calculateAgingRow({ locationId: 1, productId: 2, quantityOnHand: '0', averageCost: '2' }, inbound, '2026-10-07').attributedQty, '0.0000');
});

test('unknown transfer receipt retains unknown age without manufacturing a date', () => {
  const row = calculateAgingRow({ locationId: 1, productId: 2, quantityOnHand: '4', averageCost: '5' }, [event(null, '2', 1), event('2026-01-01', '2', 2)], '2026-10-07');
  assert.equal(row.unknownQty, '2.0000');
  assert.equal(row.qty181to365, '2.0000');
});
