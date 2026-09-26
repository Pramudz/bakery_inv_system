import assert from 'node:assert/strict';
import test from 'node:test';
import { baseInventorySnapshot, productUnitSnapshot, purchaseOrderLineSnapshot } from '../../common/transaction-unit-snapshot';

test('PO snapshots product unit and conversion factor', () => {
  assert.deepEqual(productUnitSnapshot({ productUnitId: 44, unitId: 8, conversionFactor: '24.000000' }), {
    productUnitId: 44,
    unitId: 8,
    conversionFactorSnapshot: '24.000000',
  });
});

test('PO-based GRN copies PO snapshots rather than current Product Master values', () => {
  const poSnapshot = purchaseOrderLineSnapshot({
    productId: 10,
    productUnitId: 44,
    unitId: 8,
    conversionFactorSnapshot: '24.000000',
    unitCost: '240.0000',
    discountAmount: '10.0000',
    taxAmount: '5.0000',
    netUnitCost: '235.0000',
    sourceSupplierPriceId: 91,
  });
  const currentProductMasterConversion = '48.000000';
  assert.equal(poSnapshot.conversionFactorSnapshot, '24.000000');
  assert.notEqual(poSnapshot.conversionFactorSnapshot, currentProductMasterConversion);
  assert.equal(poSnapshot.sourceSupplierPriceId, 91);
  assert.equal(poSnapshot.netUnitCost, '235.0000');
});

test('inventory posting converts transaction quantity using the stored snapshot', () => {
  assert.deepEqual(baseInventorySnapshot(3, 240, 24), {
    baseQuantity: 72,
    baseUnitCost: 10,
    movementValue: 720,
  });
});

test('GRN conversion supports EACH, KG and LITRE base quantities', () => {
  assert.equal(baseInventorySnapshot(2, 240, 24).baseQuantity, 48);
  assert.equal(baseInventorySnapshot(0.75, 900, 1).baseQuantity, 0.75);
  assert.equal(baseInventorySnapshot(2.5, 600, 1).baseQuantity, 2.5);
});
