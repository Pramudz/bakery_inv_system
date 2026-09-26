import type { PurchaseOrder } from "./api/purchasingApi";
import type { Product } from "../products/api/productsApi";
import { purchaseUnits, supplierPrice } from "./purchasingProducts";

export type PurchaseOrderMode = "create" | "view" | "edit";
export type PoLine = {
  productId: string; productName: string; sku: string; productUnitId: string; unitId: string; unitLabel: string;
  orderedQty: string; unitCost: string; discountAmount: string; taxAmount: string;
  sourceSupplierPriceId?: number | string; baselineUnitCost?: string; costOverrideReason: string;
  manualCost: boolean; notes: string;
};
export type PoForm = {
  supplierId: string; locationId: string; orderDate: string; expectedDeliveryDate: string;
  currencyCode: string; notes: string; lines: PoLine[];
};
export type ProductAvailability = { productId: number | string; locationId: number | string; isActive: boolean; isPurchasable: boolean };
export const poStatuses = ["DRAFT", "APPROVED", "SENT", "PART_RECEIVED", "RECEIVED", "CANCELLED"];
export const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const money = (value: unknown) => numberValue(value).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const statusLabel = (value: string) => value.toLowerCase().split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
export const poNumber = (value?: string | null) => value?.trim() && !["null", "undefined"].includes(value.trim().toLowerCase()) ? value : "Number unavailable";

export function tenantBusinessDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
// Calendar arithmetic only: never interpret a business date in the browser's local timezone.
export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || !Number.isInteger(days) || days < 0) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function blankPoForm(timeZone: string, locationId = ""): PoForm {
  return { supplierId: "", locationId, orderDate: tenantBusinessDate(timeZone), expectedDeliveryDate: "", currencyCode: "LKR", notes: "", lines: [] };
}
export function formFromOrder(order: PurchaseOrder): PoForm {
  const lines = Array.isArray(order.lines) ? order.lines : [];
  return {
    supplierId: String(order.supplierId), locationId: String(order.locationId), orderDate: order.orderDate.slice(0, 10),
    expectedDeliveryDate: order.expectedDate?.slice(0, 10) ?? "", currencyCode: order.currencyCode, notes: order.notes ?? "",
    lines: lines.map(line => ({
      productId: String(line.productId), productName: line.product?.productName ?? "Product unavailable", sku: line.product?.sku ?? "",
      productUnitId: String(line.productUnitId ?? ""), unitId: String(line.unitId),
      unitLabel: line.productUnit?.unit?.name ?? line.productUnit?.unit?.code ?? "Unit unavailable",
      orderedQty: String(line.orderedQty), unitCost: String(line.unitCost), discountAmount: String(line.discountAmount ?? 0), taxAmount: String(line.taxAmount ?? 0),
      sourceSupplierPriceId: line.sourceSupplierPriceId ?? undefined, costOverrideReason: line.costOverrideReason ?? "",
      manualCost: true, notes: line.notes ?? "",
    })),
  };
}
export function eligibleProduct(product: Product | undefined, form: PoForm, availability: ProductAvailability[]) {
  return Boolean(product?.isActive && product.isPurchasable && purchaseUnits(product, form.supplierId).length &&
    availability.some(row => String(row.productId) === String(product.productId) && String(row.locationId) === form.locationId && row.isActive && row.isPurchasable));
}
export function refreshPoLine(line: PoLine, form: PoForm, products: Product[], preserveCost = line.manualCost): PoLine {
  const product = products.find(item => String(item.productId) === line.productId);
  const selection = purchaseUnits(product, form.supplierId).find(item => String(item.productUnit.productUnitId) === line.productUnitId);
  const candidate = supplierPrice(selection?.supplierUnit, form.orderDate, line.orderedQty, form.currencyCode.trim().toUpperCase());
  const price = candidate && numberValue(candidate.purchasePrice) > 0 ? candidate : undefined;
  return {
    ...line,
    unitId: selection ? String(selection.productUnit.unitId) : line.unitId,
    unitLabel: selection?.productUnit.unit?.name ?? selection?.productUnit.unit?.code ?? line.unitLabel,
    sourceSupplierPriceId: price?.productSupplierPriceId,
    baselineUnitCost: price ? String(price.purchasePrice) : undefined,
    unitCost: preserveCost ? line.unitCost : price ? String(price.purchasePrice) : "",
  };
}
export const overrideRequired = (line: PoLine) => !line.sourceSupplierPriceId || line.baselineUnitCost === undefined || numberValue(line.unitCost) !== numberValue(line.baselineUnitCost);
export const lineTotal = (line: PoLine) => numberValue(line.orderedQty) * (numberValue(line.unitCost) - numberValue(line.discountAmount) + numberValue(line.taxAmount));
export function poTotals(lines: PoLine[] | null | undefined) {
  return (Array.isArray(lines) ? lines : []).reduce((totals, line) => {
    const qty = numberValue(line.orderedQty);
    return { units: totals.units + qty, subtotal: totals.subtotal + qty * numberValue(line.unitCost), discount: totals.discount + qty * numberValue(line.discountAmount), tax: totals.tax + qty * numberValue(line.taxAmount), total: totals.total + lineTotal(line) };
  }, { units: 0, subtotal: 0, discount: 0, tax: 0, total: 0 });
}
export function requiredId(value: unknown, label: string) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`${label} must be a valid selection.`);
  return Number(value);
}
export function poPayload(form: PoForm, products: Product[], availability: ProductAvailability[]) {
  for (const [label, value] of [["Order Date", form.orderDate], ["Expected Delivery Date", form.expectedDeliveryDate]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || addCalendarDays(value, 0) !== value) throw new Error(`${label} is required and must be a valid date.`);
  }
  if (!/^[A-Z]{3}$/.test(form.currencyCode.trim().toUpperCase())) throw new Error("Enter a three-letter currency code.");
  if (!form.lines.length) throw new Error("Add at least one product.");
  const seen = new Set<string>();
  const lines = form.lines.map((original, index) => {
    const line = refreshPoLine(original, form, products, true);
    const label = `Line ${index + 1}`;
    const product = products.find(item => String(item.productId) === line.productId);
    if (!eligibleProduct(product, form, availability)) throw new Error(`${label}: product is not available for this supplier and receiving location.`);
    if (!purchaseUnits(product, form.supplierId).some(item => String(item.productUnit.productUnitId) === line.productUnitId)) throw new Error(`${label}: select an active supplier purchase unit.`);
    const key = `${line.productId}:${line.productUnitId}`;
    if (seen.has(key)) throw new Error(`${label}: this product and purchase unit are already included.`);
    seen.add(key);
    for (const [name, value] of [["quantity", line.orderedQty], ["unit cost", line.unitCost], ["discount", line.discountAmount], ["tax", line.taxAmount]]) {
      if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || (name === "quantity" && Number(value) < 0.0001)) throw new Error(`${label}: enter a valid ${name}${name === "quantity" ? " greater than zero" : ""}.`);
    }
    if (overrideRequired(line) && !line.costOverrideReason.trim()) throw new Error(`${label}: a cost override reason is required.`);
    if (line.costOverrideReason.trim().length > 500) throw new Error(`${label}: override reason must be at most 500 characters.`);
    return {
      productId: requiredId(line.productId, `${label} product`), productUnitId: requiredId(line.productUnitId, `${label} purchase unit`), unitId: requiredId(line.unitId, `${label} unit`),
      orderedQty: Number(line.orderedQty), unitCost: Number(line.unitCost), discountAmount: Number(line.discountAmount), taxAmount: Number(line.taxAmount),
      ...(line.sourceSupplierPriceId != null && String(line.sourceSupplierPriceId).trim() !== "" ? { sourceSupplierPriceId: requiredId(line.sourceSupplierPriceId, `${label} supplier price`) } : {}),
      costOverrideReason: line.costOverrideReason.trim(), notes: line.notes,
    };
  });
  return { supplierId: requiredId(form.supplierId, "Supplier"), locationId: requiredId(form.locationId, "Receiving Location"), orderDate: form.orderDate, expectedDate: form.expectedDeliveryDate, currencyCode: form.currencyCode.trim().toUpperCase(), notes: form.notes, lines };
}

export const PO_DRAFT_TTL = 24 * 60 * 60 * 1000;
export function readPoDraft(storage: Pick<Storage, "getItem" | "removeItem">, key: string, mode: PurchaseOrderMode, id: string, now = Date.now()): PoForm | undefined {
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const draft = JSON.parse(raw);
    const form = draft.form;
    const strings = ["supplierId", "locationId", "orderDate", "expectedDeliveryDate", "currencyCode", "notes"];
    const lineStrings = ["productId", "productName", "sku", "productUnitId", "unitId", "unitLabel", "orderedQty", "unitCost", "discountAmount", "taxAmount", "costOverrideReason", "notes"];
    if (draft.version === 1 && draft.mode === mode && draft.poId === id && Number.isFinite(draft.savedAt) && draft.savedAt <= now && now - draft.savedAt <= PO_DRAFT_TTL &&
      form && strings.every(key => typeof form[key] === "string") && Array.isArray(form.lines) && form.lines.every((line: Record<string, unknown>) => line && lineStrings.every(key => typeof line[key] === "string") && typeof line.manualCost === "boolean")) return form;
    storage.removeItem(key);
  } catch { try { storage.removeItem(key); } catch { /* Storage may be disabled. */ } }
}
