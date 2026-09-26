import type {
  AllocationMethod,
  ConversionMovementType,
  ConversionProductContext,
  ConversionProductUnit,
  InventoryConversion,
} from "./api/inventoryConversionsApi";

export interface ConversionFormLine {
  key: string;
  movementType: ConversionMovementType;
  productId: number;
  sku: string;
  productName: string;
  baseUnitLabel: string;
  productUnits: ConversionProductUnit[];
  productUnitId: string;
  quantity: string;
  currentStock: string;
  currentWavg: string | null;
  hasInventoryBalance: boolean;
  allocationPercent: string;
  allocationWeight: string;
  allocationWeightOverridden?: boolean;
  remarks: string;
  postedBaseQuantity?: string;
  postedQuantityBefore?: string | null;
  postedQuantityAfter?: string | null;
  postedWavgBefore?: string | null;
  postedWavgAfter?: string | null;
  postedUnitCost?: string | null;
  postedValue?: string | null;
  postedAllocationBasis?: string | null;
  postedAllocatedValue?: string | null;
}

export interface ConversionForm {
  locationId: string;
  allocationMethod: AllocationMethod;
  remarks: string;
  avalLines: ConversionFormLine[];
  avinLines: ConversionFormLine[];
}

export interface AllocationPreview {
  valid: boolean;
  basis: number;
  percent: number;
  allocatedValue: number;
  transactionUnitCost: number;
  resultingStock: number;
  resultingWavg: number | null;
}

export const blankConversionForm = (locationId = ""): ConversionForm => ({
  locationId,
  allocationMethod: "MANUAL_PERCENT",
  remarks: "",
  avalLines: [],
  avinLines: [],
});

export const money = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const quantity = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-LK", { maximumFractionDigits: 4 });
export const statusLabel = (value: string) =>
  value ? value.slice(0, 1) + value.slice(1).toLowerCase() : "Draft";
export const allocationMethodLabel = (value: string) =>
  ({
    MANUAL_PERCENT: "Manual Percent",
    BY_EXISTING_WAVG: "By Existing WAVG",
    BY_WEIGHT: "By Weight",
  })[value] ?? value;

export function defaultProductUnit(product: ConversionProductContext) {
  const explicit = product.productUnits.filter((unit) => unit.isBaseUnit);
  if (explicit.length === 1) return explicit[0];
  if (explicit.length > 1) return undefined;
  const canonical = product.productUnits.filter(
    (unit) => Number(unit.unitId) === Number(product.baseUnit.unitId),
  );
  if (canonical.length === 1) return canonical[0];
  if (canonical.length > 1) return undefined;
  return product.productUnits.length === 1
    ? product.productUnits[0]
    : undefined;
}

export function selectedUnit(line: ConversionFormLine) {
  return line.productUnits.find(
    (unit) => String(unit.productUnitId) === line.productUnitId,
  );
}

export function baseQuantity(line: ConversionFormLine) {
  return round4(
    Number(line.quantity || 0) *
      Number(selectedUnit(line)?.conversionFactor ?? 0),
  );
}

export function avalEstimatedValue(line: ConversionFormLine) {
  return round4(baseQuantity(line) * Number(line.currentWavg ?? 0));
}

export function totalAvalValue(form: ConversionForm) {
  return round4(
    form.avalLines.reduce((sum, line) => sum + avalEstimatedValue(line), 0),
  );
}

export function allocationPreviews(form: ConversionForm) {
  const total = totalAvalValue(form);
  const bases = form.avinLines.map((line) => {
    if (form.allocationMethod === "MANUAL_PERCENT")
      return Number(line.allocationPercent || 0);
    if (form.allocationMethod === "BY_WEIGHT")
      return Number(line.allocationWeight || 0);
    return round4(baseQuantity(line) * Number(line.currentWavg ?? 0));
  });
  const basisTotal = bases.reduce((sum, value) => sum + value, 0);
  let assigned = 0;
  return form.avinLines.map((line, index): AllocationPreview => {
    const baseQty = baseQuantity(line);
    const existingQty = Number(line.currentStock || 0);
    const existingWavg = Number(line.currentWavg ?? 0);
    const positiveExistingStockValid = existingQty <= 0 || existingWavg > 0;
    const methodValid =
      bases[index] > 0 &&
      basisTotal > 0 &&
      (form.allocationMethod !== "BY_EXISTING_WAVG" ||
        (line.hasInventoryBalance && existingWavg > 0));
    const valid =
      methodValid && positiveExistingStockValid && baseQty > 0 && total > 0;
    const allocated = valid
      ? index === form.avinLines.length - 1
        ? round4(total - assigned)
        : round4((total * bases[index]) / basisTotal)
      : 0;
    assigned = round4(assigned + allocated);
    const transactionUnitCost = baseQty > 0 ? round4(allocated / baseQty) : 0;
    const resultingStock = round4(existingQty + baseQty);
    const resultingWavg = !valid || resultingStock <= 0
      ? null
      : existingQty <= 0
        ? transactionUnitCost
        : round4(
            (existingQty * existingWavg + allocated) / resultingStock,
          );
    return {
      valid,
      basis: round4(bases[index]),
      percent: basisTotal > 0 ? round4((bases[index] / basisTotal) * 100) : 0,
      allocatedValue: allocated,
      transactionUnitCost,
      resultingStock,
      resultingWavg,
    };
  });
}

export function formFromConversion(
  conversion: InventoryConversion,
  contexts: Map<number, ConversionProductContext>,
): ConversionForm {
  const rows = (conversion.lines ?? []).map((line): ConversionFormLine => {
    const context = contexts.get(Number(line.productId));
    return {
      key: String(line.inventoryConversionLineId),
      movementType: line.movementType,
      productId: Number(line.productId),
      sku: line.product?.sku ?? context?.sku ?? "",
      productName: line.product?.productName ?? context?.productName ?? "Product",
      baseUnitLabel:
        line.product?.baseUnit?.symbol ??
        line.product?.baseUnit?.code ??
        context?.baseUnit.symbol ??
        context?.baseUnit.code ??
        "Base",
      productUnits:
        context?.productUnits ?? (line.productUnit ? [line.productUnit] : []),
      productUnitId: String(line.productUnitId),
      quantity: line.quantity,
      currentStock: context?.quantityOnHand ?? "0.0000",
      currentWavg: context?.averageCost ?? null,
      hasInventoryBalance: context?.hasInventoryBalance ?? false,
      allocationPercent: line.allocationPercent ?? "",
      allocationWeight: line.allocationWeight ?? "",
      allocationWeightOverridden:
        line.allocationWeight != null &&
        Number(line.allocationWeight) !== Number(line.quantity),
      remarks: line.remarks ?? "",
      postedBaseQuantity: line.baseQuantity,
      postedQuantityBefore: line.quantityBefore,
      postedQuantityAfter: line.quantityAfter,
      postedWavgBefore: line.wavgBefore,
      postedWavgAfter: line.wavgAfter,
      postedUnitCost: line.postedUnitCost,
      postedValue: line.postedValue,
      postedAllocationBasis: line.allocationBasisValue,
      postedAllocatedValue: line.allocatedValue,
    };
  });
  return {
    locationId: String(conversion.locationId),
    allocationMethod: conversion.allocationMethod,
    remarks: conversion.remarks ?? "",
    avalLines: rows.filter((line) => line.movementType === "AVAL"),
    avinLines: rows.filter((line) => line.movementType === "AVIN"),
  };
}

export function normalizeConversionForm(form: ConversionForm): ConversionForm {
  return {
    ...form,
    avinLines: form.avinLines.map((line) => ({
      ...line,
      allocationWeightOverridden:
        typeof line.allocationWeightOverridden === "boolean"
          ? line.allocationWeightOverridden
          : Boolean(line.allocationWeight) &&
            Number(line.allocationWeight) !== Number(line.quantity),
    })),
  };
}

export const round4 = (value: number) =>
  Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 10_000) / 10_000 : 0;
