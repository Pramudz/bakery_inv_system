import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReplenishment, purchaseUnitSuggestion, resolveLeadTime, resolvePurchaseUnit, SupplierPurchaseUnit } from './replenishment-calculation';

const unit = (id: number, lead: number | null, preferred = false): SupplierPurchaseUnit => ({
  productSupplierUnitId: id, code: id === 1 ? 'CASE' : 'PALLET', conversionFactor: id === 1 ? '24' : '240',
  quantityPrecision: 0, leadTimeDays: lead, isDefaultPurchaseUnit: preferred, isBaseUnit: false, isActive: true,
});

test('consumption excludes stock returns but not no-stock refunds; recommendation includes open PO and incoming transit', () => {
  const demand = calculateReplenishment({ onHandQty: '90', averageCost: '125', openPoBaseQty: '0', incomingTransferQty: '0',
    soldQty: '300', returnToStockQty: '30', horizonDays: 30, targetCoverageDays: 14, leadTimeDays: 7 });
  assert.equal(demand.consumptionQty, '270.0000');
  assert.equal(demand.perDayRate, '9.0000');
  assert.equal(demand.daysOfSupply, '10.0000');
  assert.equal(demand.weeksOfSupply, '1.4286');
  const position = calculateReplenishment({ onHandQty: '80', averageCost: '125', openPoBaseQty: '30', incomingTransferQty: '20',
    soldQty: '300', returnToStockQty: '0', horizonDays: 30, targetCoverageDays: 14, leadTimeDays: 7 });
  assert.equal(position.targetStock, '210.0000');
  assert.equal(position.inventoryPositionQty, '130.0000');
  assert.equal(position.suggestedBaseQty, '80.0000');
  assert.equal(position.leadTimeDemand, '70.0000');
});

test('no demand and unknown lead time remain explicit', () => {
  const base = { onHandQty: '5', averageCost: '10', openPoBaseQty: '0', incomingTransferQty: '0',
    soldQty: '0', returnToStockQty: '0', horizonDays: 30, targetCoverageDays: 14 };
  const noDemand = calculateReplenishment({ ...base, leadTimeDays: null });
  assert.equal(noDemand.reorderStatus, 'NO_RECENT_DEMAND');
  assert.equal(noDemand.daysOfSupply, null);
  assert.equal(noDemand.suggestedBaseQty, '0.0000');
  const noLead = calculateReplenishment({ ...base, soldQty: '30', leadTimeDays: null });
  assert.equal(noLead.reorderStatus, 'NO_LEAD_TIME');
  assert.equal(noLead.leadTimeDemand, null);
  assert.equal(noLead.suggestedBaseQty, null);
});

test('lead time and purchase unit resolution refuse ambiguous units', () => {
  assert.deepEqual(resolveLeadTime(null, [unit(1, 7), unit(2, 21)]), { leadTimeDays: null, leadTimeSource: 'UNKNOWN' });
  assert.equal(resolveLeadTime(10, [unit(1, 7)]).leadTimeSource, 'SUPPLIER_BASELINE');
  assert.equal(resolveLeadTime(null, [unit(1, 7, true), unit(2, 21)]).leadTimeDays, 7);
  assert.equal(resolvePurchaseUnit([unit(1, 7), unit(2, 21)]), null);
  assert.deepEqual(purchaseUnitSuggestion('80', unit(1, 7)), { suggestedPurchaseUnit: 'CASE',
    suggestedPurchaseQty: '4.0000', suggestedConvertedBaseQty: '96.0000' });
  const fractional = { ...unit(1, 7, true), conversionFactor: '0.123456', quantityPrecision: 2 };
  assert.equal(resolvePurchaseUnit([fractional])?.code, 'CASE');
  const suggestion = purchaseUnitSuggestion('1', fractional);
  assert.equal(suggestion.suggestedPurchaseQty, '8.1100');
  assert.equal(suggestion.suggestedConvertedBaseQty, '1.0012');
});
