import type {
  AdjustmentCostingPolicy,
  AdjustmentMovementType,
  AdjustmentProductContext,
  AdjustmentReason,
  InventoryAdjustment,
} from "./api/inventoryAdjustmentsApi";

export interface AdjustmentFormLine {
  key: string;
  productId: number;
  sku: string;
  productName: string;
  baseUnitLabel: string;
  productUnits: AdjustmentProductContext["productUnits"];
  productUnitId: string;
  quantity: string;
  currentStock: string;
  currentWavg: string | null;
  hasInventoryBalance: boolean;
  unitCost: string;
  remarks: string;
  postedBaseQuantity?: string;
  postedInventoryValue?: string | null;
  postedQuantityBefore?: string | null;
  postedQuantityAfter?: string | null;
}

export interface AdjustmentForm {
  locationId: string;
  movementType: AdjustmentMovementType;
  reasonId: string;
  referenceNumber: string;
  remarks: string;
  lines: AdjustmentFormLine[];
}

export const blankAdjustmentForm = (locationId = ""): AdjustmentForm => ({
  locationId,
  movementType: "ADJI",
  reasonId: "",
  referenceNumber: "",
  remarks: "",
  lines: [],
});

export const movementLabel = (value: string) =>
  value === "ADJI"
    ? "Adjustment In"
    : value === "ADJO"
      ? "Adjustment Out"
      : value;
export const statusLabel = (value: string) =>
  value ? value.slice(0, 1) + value.slice(1).toLowerCase() : "Draft";
export const money = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const quantity = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-LK", { maximumFractionDigits: 4 });

export function compatibleReason(
  reason: AdjustmentReason,
  movementType: AdjustmentMovementType,
) {
  const direction = movementType === "ADJI" ? "IN" : "OUT";
  return (
    reason.isActive &&
    (reason.allowedDirection === direction ||
      reason.allowedDirection === "BOTH")
  );
}

export function selectedUnit(line: AdjustmentFormLine) {
  return line.productUnits.find(
    (unit) => String(unit.productUnitId) === line.productUnitId,
  );
}

export function defaultProductUnit(product: AdjustmentProductContext) {
  const explicitBases = product.productUnits.filter((unit) => unit.isBaseUnit);
  if (explicitBases.length === 1) return explicitBases[0];
  if (explicitBases.length > 1) return undefined;
  const canonicalBases = product.productUnits.filter(
    (unit) => Number(unit.unitId) === Number(product.baseUnit.unitId),
  );
  if (canonicalBases.length === 1) return canonicalBases[0];
  if (canonicalBases.length > 1) return undefined;
  return product.productUnits.length === 1
    ? product.productUnits[0]
    : undefined;
}

export function lineBaseQuantity(line: AdjustmentFormLine) {
  return (
    Number(line.quantity || 0) *
    Number(selectedUnit(line)?.conversionFactor ?? 0)
  );
}

export function lineCost(
  line: AdjustmentFormLine,
  policy: AdjustmentCostingPolicy,
) {
  return policy === "MANUAL_REQUIRED"
    ? Number(line.unitCost || 0)
    : Number(line.currentWavg ?? 0);
}

export function lineValue(
  line: AdjustmentFormLine,
  policy: AdjustmentCostingPolicy,
  movementType: AdjustmentMovementType,
) {
  const value = lineBaseQuantity(line) * lineCost(line, policy);
  return movementType === "ADJO" ? -value : value;
}

export function formFromAdjustment(
  adjustment: InventoryAdjustment,
  contexts: Map<number, AdjustmentProductContext>,
): AdjustmentForm {
  return {
    locationId: String(adjustment.locationId),
    movementType: adjustment.movementType,
    reasonId: String(adjustment.reasonId),
    referenceNumber: adjustment.referenceNumber ?? "",
    remarks: adjustment.remarks ?? "",
    lines: (adjustment.lines ?? []).map((line) => {
      const context = contexts.get(Number(line.productId));
      const fallbackUnit = line.productUnit ? [line.productUnit] : [];
      return {
        key: String(line.inventoryAdjustmentLineId),
        productId: Number(line.productId),
        sku: line.product?.sku ?? context?.sku ?? "",
        productName:
          line.product?.productName ?? context?.productName ?? "Product",
        baseUnitLabel:
          line.product?.baseUnit?.symbol ??
          line.product?.baseUnit?.code ??
          context?.baseUnit.symbol ??
          context?.baseUnit.code ??
          "Base",
        productUnits: context?.productUnits ?? fallbackUnit,
        productUnitId: String(line.productUnitId),
        quantity: line.quantity,
        currentStock: context?.quantityOnHand ?? "0.0000",
        currentWavg: context?.averageCost ?? null,
        hasInventoryBalance: context?.hasInventoryBalance ?? false,
        unitCost: line.unitCost ?? "",
        remarks: line.remarks ?? "",
        postedBaseQuantity: line.baseQuantity,
        postedInventoryValue: line.inventoryValue,
        postedQuantityBefore: line.quantityBefore,
        postedQuantityAfter: line.quantityAfter,
      };
    }),
  };
}
