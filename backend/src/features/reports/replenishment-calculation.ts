import { baseQuantity, checked, divide4, multiply, units } from '../../common/inventory-decimal';

export interface SupplierPurchaseUnit {
  productSupplierUnitId: number;
  code: string;
  conversionFactor: string;
  quantityPrecision: number;
  leadTimeDays: number | null;
  isDefaultPurchaseUnit: boolean;
  isBaseUnit: boolean;
  isActive: boolean;
}

export function resolveLeadTime(baseline: number | null, purchaseUnits: SupplierPurchaseUnit[]) {
  const valid = (value: number | null): value is number => value !== null && Number.isInteger(value) && value >= 0;
  if (valid(baseline)) return { leadTimeDays: baseline, leadTimeSource: 'SUPPLIER_BASELINE' as const };
  const active = purchaseUnits.filter(unit => unit.isActive);
  const designated = active.filter(unit => (unit.isDefaultPurchaseUnit || unit.isBaseUnit) && valid(unit.leadTimeDays));
  if (designated.length === 1) return { leadTimeDays: designated[0].leadTimeDays!, leadTimeSource: 'BASE_PURCHASE_UNIT' as const };
  const withLead = active.filter(unit => valid(unit.leadTimeDays));
  if (withLead.length === 1) return { leadTimeDays: withLead[0].leadTimeDays!, leadTimeSource: 'ONLY_AVAILABLE_PURCHASE_UNIT' as const };
  return { leadTimeDays: null, leadTimeSource: 'UNKNOWN' as const };
}

export function resolvePurchaseUnit(purchaseUnits: SupplierPurchaseUnit[]) {
  const active = purchaseUnits.filter(unit => {
    if (!unit.isActive) return false;
    const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(unit.conversionFactor);
    return !!match && BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0')) > 0n;
  });
  const designated = active.filter(unit => unit.isDefaultPurchaseUnit || unit.isBaseUnit);
  if (designated.length === 1) return designated[0];
  return active.length === 1 ? active[0] : null;
}

function ceilDivide(value: bigint, divisor: bigint) {
  return (value + divisor - 1n) / divisor;
}

export function purchaseUnitSuggestion(baseQty: string | null, purchaseUnit: SupplierPurchaseUnit | null) {
  if (baseQty === null || !purchaseUnit || !Number.isInteger(purchaseUnit.quantityPrecision)
    || purchaseUnit.quantityPrecision < 0 || purchaseUnit.quantityPrecision > 4) return {
      suggestedPurchaseUnit: null, suggestedPurchaseQty: null, suggestedConvertedBaseQty: null,
    };
  const factor = purchaseUnit.conversionFactor;
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(factor);
  if (!match) return { suggestedPurchaseUnit: null, suggestedPurchaseQty: null, suggestedConvertedBaseQty: null };
  const factorScaled = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
  if (factorScaled <= 0n) return { suggestedPurchaseUnit: null, suggestedPurchaseQty: null, suggestedConvertedBaseQty: null };
  const precisionScale = 10n ** BigInt(purchaseUnit.quantityPrecision);
  let steps = ceilDivide(units(baseQty) * precisionScale * 1_000_000n, factorScaled * 10_000n);
  const asPurchaseQty = () => checked(steps * 10_000n / precisionScale);
  let converted = baseQuantity(asPurchaseQty(), factor);
  if (units(converted) < units(baseQty)) { steps += 1n; converted = baseQuantity(asPurchaseQty(), factor); }
  return { suggestedPurchaseUnit: purchaseUnit.code, suggestedPurchaseQty: asPurchaseQty(), suggestedConvertedBaseQty: converted };
}

export interface ReplenishmentInput {
  onHandQty: string;
  averageCost: string;
  openPoBaseQty: string;
  incomingTransferQty: string;
  soldQty: string;
  returnToStockQty: string;
  horizonDays: number;
  targetCoverageDays: number;
  leadTimeDays: number | null;
}

export function calculateReplenishment(input: ReplenishmentInput) {
  if (!Number.isInteger(input.horizonDays) || input.horizonDays <= 0 || !Number.isInteger(input.targetCoverageDays) || input.targetCoverageDays < 0)
    throw new Error('Invalid replenishment horizon or target coverage.');
  const consumption = units(input.soldQty) - units(input.returnToStockQty);
  const consumptionQty = checked(consumption > 0n ? consumption : 0n);
  const rate = checked((units(consumptionQty) + BigInt(Math.floor(input.horizonDays / 2))) / BigInt(input.horizonDays));
  const position = checked(units(input.onHandQty) + units(input.openPoBaseQty) + units(input.incomingTransferQty));
  const onHandValue = checked(multiply(units(input.onHandQty), units(input.averageCost)));
  const daysOfSupply = units(rate) > 0n ? divide4(units(input.onHandQty), units(rate)) : null;
  const weeksOfSupply = daysOfSupply === null ? null : divide4(units(daysOfSupply), units('7'));
  const leadTimeDemand = input.leadTimeDays === null ? null : checked(multiply(units(rate), units(String(input.leadTimeDays))));
  const targetStock = input.leadTimeDays === null ? null : checked(multiply(units(rate), units(String(input.leadTimeDays + input.targetCoverageDays))));
  const suggestedBaseQty = units(rate) <= 0n ? '0.0000' : targetStock === null ? null
    : checked(units(targetStock) > units(position) ? units(targetStock) - units(position) : 0n);
  const reorderStatus = units(rate) <= 0n ? 'NO_RECENT_DEMAND'
    : input.leadTimeDays === null ? 'NO_LEAD_TIME'
    : units(input.onHandQty) <= 0n ? 'OUT_OF_STOCK'
    : daysOfSupply !== null && units(daysOfSupply) < units(String(input.leadTimeDays)) ? 'CRITICAL'
    : suggestedBaseQty !== null && units(suggestedBaseQty) > 0n ? 'REORDER' : 'HEALTHY';
  return { consumptionQty, perDayRate: rate, onHandValue, inventoryPositionQty: position,
    daysOfSupply, weeksOfSupply, leadTimeDemand, targetStock, suggestedBaseQty, reorderStatus };
}
