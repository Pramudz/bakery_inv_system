import assert from 'node:assert/strict';
import test from 'node:test';
import { effectivePriceStatus, periodsOverlap, priceDateEnd, priceDateOnly, priceDateStart, selectCurrentPrice } from './product-price-periods';

const now = new Date('2026-08-17T12:00:00Z');

test('classifies current, future, expired and inactive price history', () => {
  assert.equal(effectivePriceStatus({ isActive: true, effectiveFrom: '2026-01-01', effectiveTo: null }, now), 'CURRENT');
  assert.equal(effectivePriceStatus({ isActive: true, effectiveFrom: '2026-09-01', effectiveTo: null }, now), 'FUTURE');
  assert.equal(effectivePriceStatus({ isActive: true, effectiveFrom: '2026-01-01', effectiveTo: '2026-08-01' }, now), 'EXPIRED');
  assert.equal(effectivePriceStatus({ isActive: false, effectiveFrom: '2026-01-01', effectiveTo: null }, now), 'INACTIVE');
});

test('detects overlapping periods and permits adjacent closed periods', () => {
  assert.equal(periodsOverlap(new Date('2026-01-01'), new Date('2026-08-31'), new Date('2026-08-01'), null), true);
  assert.equal(periodsOverlap(new Date('2026-01-01'), new Date('2026-08-31'), new Date('2026-09-01'), null), false);
});

test('current selection ignores future, expired and inactive records', () => {
  const current = selectCurrentPrice([
    { id: 1, isActive: true, effectiveFrom: '2026-01-01', effectiveTo: '2026-08-01' },
    { id: 2, isActive: true, effectiveFrom: '2026-08-02', effectiveTo: null },
    { id: 3, isActive: true, effectiveFrom: '2026-09-01', effectiveTo: null },
    { id: 4, isActive: false, effectiveFrom: '2026-08-10', effectiveTo: null },
  ], now);
  assert.equal(current?.id, 2);
});

test('commercial contexts remain isolated by caller filtering', () => {
  const rows = [
    { supplierId: 1, productId: 10, unitId: 2, minimumQuantity: 1, isActive: true, effectiveFrom: '2026-01-01', effectiveTo: null },
    { supplierId: 2, productId: 10, unitId: 2, minimumQuantity: 1, isActive: true, effectiveFrom: '2026-01-01', effectiveTo: null },
  ];
  const context = rows.filter((row) => row.supplierId === 1 && row.productId === 10 && row.unitId === 2 && row.minimumQuantity === 1);
  assert.deepEqual(context.map((row) => row.supplierId), [1]);
});

test('price dates normalize to whole local calendar days without API date shifts', () => {
  const start = priceDateStart('2026-08-18');
  const end = priceDateEnd('2026-08-18');
  assert.equal(start.getHours(), 0);
  assert.equal(end.getHours(), 23);
  assert.equal(priceDateOnly(start), '2026-08-18');
  assert.equal(priceDateOnly(end), '2026-08-18');
});

test('overlap detection blocks nested and open-ended periods', () => {
  assert.equal(periodsOverlap(new Date('2026-01-01'), null, new Date('2026-06-01'), new Date('2026-07-01')), true);
  assert.equal(periodsOverlap(new Date('2026-01-01'), new Date('2026-05-31'), new Date('2026-06-01'), null), false);
});
