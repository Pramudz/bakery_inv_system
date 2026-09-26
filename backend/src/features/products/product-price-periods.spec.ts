import assert from 'node:assert/strict';
import test from 'node:test';
import { effectivePriceStatus, periodsOverlap, priceDateEnd, priceDateOnly, priceDateStart, selectCurrentPrice , effectiveInstantStatus} from './product-price-periods';

const now = new Date('2026-08-17T12:00:00Z');
const timeZone = 'Asia/Colombo';

test('classifies current, future, expired and inactive price history', () => {
  assert.equal(effectivePriceStatus({ isActive: true, effectiveFrom: '2026-01-01', effectiveTo: null }, now, timeZone), 'CURRENT');
  assert.equal(effectivePriceStatus({ isActive: true, effectiveFrom: '2026-09-01', effectiveTo: null }, now, timeZone), 'FUTURE');
  assert.equal(effectivePriceStatus({ isActive: true, effectiveFrom: '2026-01-01', effectiveTo: '2026-08-01' }, now, timeZone), 'EXPIRED');
  assert.equal(effectivePriceStatus({ isActive: false, effectiveFrom: '2026-01-01', effectiveTo: null }, now, timeZone), 'INACTIVE');
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
  ], now, timeZone);
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

test('price dates normalize to whole tenant calendar days without API date shifts', () => {
  const start = priceDateStart('2026-08-18', timeZone);
  const end = priceDateEnd('2026-08-18', timeZone);
  assert.equal(start.toISOString(), '2026-08-17T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-08-18T18:29:59.999Z');
  assert.equal(priceDateOnly(start, timeZone), '2026-08-18');
  assert.equal(priceDateOnly(end, timeZone), '2026-08-18');
});

test('overlap detection blocks nested and open-ended periods', () => {
  assert.equal(periodsOverlap(new Date('2026-01-01'), null, new Date('2026-06-01'), new Date('2026-07-01')), true);
  assert.equal(periodsOverlap(new Date('2026-01-01'), new Date('2026-05-31'), new Date('2026-06-01'), null), false);
});

test("instant price is ended after its exact effective-to time", () => {
  const row = {
    isActive: true,
    effectiveFrom: new Date("2026-08-21T18:30:00.000Z"),
    effectiveTo: new Date("2026-08-25T17:39:00.000Z"),
  };

  const now = new Date("2026-08-25T17:40:00.000Z");

  assert.equal(
    effectiveInstantStatus(row, now),
    "EXPIRED",
  );
});

test("instant price remains current before its exact effective-to time", () => {
  const row = {
    isActive: true,
    effectiveFrom: new Date("2026-08-21T18:30:00.000Z"),
    effectiveTo: new Date("2026-08-25T17:39:00.000Z"),
  };

  const now = new Date("2026-08-25T17:38:00.000Z");

  assert.equal(
    effectiveInstantStatus(row, now),
    "CURRENT",
  );
});

test("instant price ending exactly now is still current", () => {
  const now = new Date("2026-08-25T17:39:00.000Z");

  const row = {
    isActive: true,
    effectiveFrom: new Date("2026-08-21T18:30:00.000Z"),
    effectiveTo: now,
  };

  assert.equal(
    effectiveInstantStatus(row, now),
    "CURRENT",
  );
});

