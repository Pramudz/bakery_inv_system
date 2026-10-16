import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBillDiscount } from './bill-discount';

test('bill discount follows item discounts and reconciles header with lines', () => {
  const result = applyBillDiscount([450, 300, 200], { type: 'PERCENTAGE', value: 10 });
  assert.deepEqual(result, { base: 950, discount: 95, total: 855, allocation: [45, 30, 20] });
  assert.equal(result.allocation.reduce((sum, amount) => sum + amount, 0), result.discount);
});

test('fixed discounts allocate remaining cents in stable line order', () => {
  const result = applyBillDiscount([0.01, 0.01, 0.01, 0], { type: 'FIXED', value: 0.02 });
  assert.deepEqual(result.allocation, [0.01, 0.01, 0, 0]);
  assert.equal(result.total, 0.01);
});

test('zero and full discounts leave no negative revenue', () => {
  assert.deepEqual(applyBillDiscount([0, 0], undefined).allocation, [0, 0]);
  assert.equal(applyBillDiscount([1.11, 2.22], { type: 'PERCENTAGE', value: 100 }).total, 0);
});

test('invalid, excessive, and overprecise discounts are rejected', () => {
  for (const input of [
    { type: 'FIXED', value: -1 }, { type: 'FIXED', value: 1000 },
    { type: 'FIXED', value: 0.001 }, { type: 'PERCENTAGE', value: 100.01 },
    { type: 'PERCENTAGE', value: 1.00001 }, { type: 'PERCENTAGE', value: Number.NaN },
  ] as const) assert.throws(() => applyBillDiscount([10], input));
});
