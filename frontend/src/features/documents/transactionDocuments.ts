import type { GoodsReceipt, PurchaseOrder } from "../purchasing/api/purchasingApi";
import type { InventoryAdjustment } from "../inventory-adjustments/api/inventoryAdjustmentsApi";
import type { InventoryConversion } from "../inventory-conversions/api/inventoryConversionsApi";
import type { DocumentField, DocumentHeader, DocumentUser, TransactionDocument } from "./documentTypes";

const number = (value: number | string | null | undefined) => Number(value ?? 0);
const total = (values: Array<number | string | null | undefined>) => values.reduce<number>((sum, value) => sum + number(value), 0);
const decimal = (value: number | string | null | undefined, minimumFractionDigits = 0) =>
  value == null ? "—" : number(value).toLocaleString("en-LK", { minimumFractionDigits, maximumFractionDigits: 4 });
const money = (value: number | string | null | undefined, currency = "LKR") =>
  value == null ? "—" : `${currency} ${decimal(value, 2)}`;
const date = (value: string | null | undefined) => value ? value.slice(0, 10) : "—";
const timestamp = (value: string | null | undefined, timeZone: string) =>
  value ? new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)) : "—";
const user = (value: DocumentUser | null | undefined) =>
  [value?.firstName, value?.lastName].filter(Boolean).join(" ") || value?.username || "—";
const optional = (label: string, value: string | null | undefined): DocumentField[] => value ? [{ label, value }] : [];
const header = (value: DocumentHeader | undefined): DocumentHeader => {
  if (!value?.company?.name || !value.location?.name) throw new Error("Document company or location details are unavailable. Refresh the document and try again.");
  return value;
};
const base = (value: DocumentHeader, title: string, numberValue: string, documentDate: string, status: string, timeZone: string): TransactionDocument => ({
  company: value.company,
  title,
  number: numberValue,
  date: date(documentDate),
  location: `${value.location.name} (${value.location.code})`,
  status,
  fields: [], sections: [], notes: [], audit: [], timeZone,
});

export function purchaseOrderDocument(po: PurchaseOrder, timeZone: string): TransactionDocument {
  const doc = base(header(po.documentHeader), "PURCHASE ORDER", po.poNumber || `Draft #${po.purchaseOrderId}`, po.orderDate, po.status, timeZone);
  const lines = po.lines ?? [];
  const currency = po.currencyCode || "LKR";
  doc.fields = [
    { label: "Supplier", value: `${po.supplier?.supplierCode ?? ""} ${po.supplier?.supplierName ?? "Unavailable"}`.trim() },
    ...optional("Supplier address", [po.supplier?.addressLine1, po.supplier?.addressLine2, po.supplier?.city].filter(Boolean).join(", ")),
    ...optional("Supplier phone", po.supplier?.phone), ...optional("Supplier email", po.supplier?.email),
    ...optional("Expected delivery", date(po.expectedDate) === "—" ? null : date(po.expectedDate)),
    { label: "Currency", value: currency },
  ];
  doc.sections = [{
    title: "Ordered items",
    columns: [
      { label: "#", weight: 0.35 }, { label: "SKU", weight: 0.85 }, { label: "Product", weight: 2.1 },
      { label: "Unit", weight: 0.9 }, { label: "Qty", weight: 0.75, numeric: true },
      { label: "Unit cost", weight: 1.05, numeric: true }, { label: "Discount/unit", weight: 1.1, numeric: true },
      { label: "Tax/unit", weight: 0.85, numeric: true }, { label: "Line total", weight: 1.15, numeric: true },
    ],
    rows: lines.map((line, index) => [
      String(index + 1), line.product?.sku ?? "—", line.product?.productName ?? "—",
      line.productUnit?.unit?.code ?? line.unit?.code ?? "—", decimal(line.orderedQty),
      money(line.unitCost, currency), money(line.discountAmount ?? 0, currency),
      money(line.taxAmount ?? 0, currency), money(line.lineTotal, currency),
    ]),
    totals: [
      { label: "Total quantity", value: decimal(total(lines.map(line => line.orderedQty))) },
      { label: "Subtotal", value: money(total(lines.map(line => number(line.orderedQty) * number(line.unitCost))), currency) },
      { label: "Discount", value: money(total(lines.map(line => number(line.orderedQty) * number(line.discountAmount))), currency) },
      { label: "Tax", value: money(total(lines.map(line => number(line.orderedQty) * number(line.taxAmount))), currency) },
      { label: "Grand total", value: money(total(lines.map(line => line.lineTotal)), currency) },
    ],
  }];
  doc.notes = [...optional("Notes", po.notes)];
  doc.audit = [
    { label: "Created by", value: user(po.createdByUser) }, { label: "Created at", value: timestamp(po.createdAt, timeZone) },
    ...(po.approvedAt ? [{ label: "Approved by", value: user(po.approvedByUser) }, { label: "Approved at", value: timestamp(po.approvedAt, timeZone) }] : []),
    ...(po.cancelledAt ? [{ label: "Cancelled by", value: user(po.cancelledByUser) }, { label: "Cancelled at", value: timestamp(po.cancelledAt, timeZone) }] : []),
  ];
  return doc;
}

export function goodsReceiptDocument(grn: GoodsReceipt, timeZone: string): TransactionDocument {
  const doc = base(header(grn.documentHeader), "GOODS RECEIPT NOTE", grn.grnNumber || `Draft #${grn.goodsReceiptId}`, grn.receiptDate, grn.status, timeZone);
  const lines = grn.lines ?? [];
  const currency = grn.currencyCode || "LKR";
  doc.fields = [
    { label: "Receipt type", value: grn.receiptType === "PO_BASED" ? "PO based" : "Direct" },
    { label: "Supplier", value: `${grn.supplier?.supplierCode ?? ""} ${grn.supplier?.supplierName ?? "Unavailable"}`.trim() },
    ...optional("Purchase order", grn.receiptType === "PO_BASED" ? grn.purchaseOrder?.poNumber : null),
    ...optional("Supplier invoice", grn.supplierInvoiceNumber),
    ...optional("Delivery note", grn.supplierDeliveryNoteNumber),
  ];
  doc.sections = [{
    title: "Received items",
    columns: [
      { label: "#", weight: 0.35 }, { label: "SKU", weight: 0.9 }, { label: "Product", weight: 2.5 },
      { label: "Unit", weight: 0.9 }, { label: "Received qty", weight: 1.05, numeric: true },
      { label: "Unit cost", weight: 1.15, numeric: true }, { label: "Line value", weight: 1.25, numeric: true },
    ],
    rows: lines.map((line, index) => [
      String(index + 1), line.product?.sku ?? "—", line.product?.productName ?? "—",
      line.productUnit?.unit?.code ?? line.unit?.code ?? "—", decimal(line.receivedQty),
      money(line.unitCost, currency), money(line.lineTotal, currency),
    ]),
    totals: [
      { label: "Total quantity", value: decimal(total(lines.map(line => line.receivedQty))) },
      { label: "Total value", value: money(total(lines.map(line => line.lineTotal)), currency) },
    ],
  }];
  doc.notes = [...optional("Notes", grn.notes), ...optional("Reversal reason", grn.reversalReason)];
  doc.audit = [
    { label: "Created by", value: user(grn.createdByUser) }, { label: "Created at", value: timestamp(grn.createdAt, timeZone) },
    ...(grn.postedAt ? [{ label: "Posted by", value: user(grn.postedByUser) }, { label: "Posted at", value: timestamp(grn.postedAt, timeZone) }] : []),
    ...(grn.cancelledAt ? [{ label: "Cancelled by", value: user(grn.cancelledByUser) }, { label: "Cancelled at", value: timestamp(grn.cancelledAt, timeZone) }] : []),
    ...(grn.reversedAt ? [{ label: "Reversed by", value: user(grn.reversedByUser) }, { label: "Reversed at", value: timestamp(grn.reversedAt, timeZone) }] : []),
  ];
  return doc;
}

export function inventoryAdjustmentDocument(adjustment: InventoryAdjustment, timeZone: string): TransactionDocument {
  const doc = base(header(adjustment.documentHeader), adjustment.movementType === "ADJI" ? "INVENTORY ADJUSTMENT IN" : "INVENTORY ADJUSTMENT OUT", adjustment.adjustmentNumber || `Draft #${adjustment.inventoryAdjustmentId}`, adjustment.adjustmentDate, adjustment.status, timeZone);
  const posted = adjustment.status === "POSTED";
  const lines = adjustment.lines ?? [];
  doc.fields = [
    { label: "Movement", value: adjustment.movementType === "ADJI" ? "ADJI - Stock in" : "ADJO - Stock out" },
    { label: "Reason", value: `${adjustment.reason?.code ?? ""} ${adjustment.reason?.name ?? "Unavailable"}`.trim() },
    ...optional("Reference", adjustment.referenceNumber),
  ];
  doc.sections = [{
    title: "Adjustment items",
    columns: [
      { label: "#", weight: 0.35 }, { label: "SKU", weight: 0.8 }, { label: "Product", weight: 1.9 },
      { label: "Unit", weight: 0.75 }, { label: "Qty before", weight: 0.95, numeric: true },
      { label: "Adjustment qty", weight: 1.1, numeric: true }, { label: "Qty after", weight: 0.95, numeric: true },
      { label: "Posted cost", weight: 1.05, numeric: true }, { label: "Posted value", weight: 1.15, numeric: true },
    ],
    rows: lines.map((line, index) => [
      String(index + 1), line.product?.sku ?? "—", line.product?.productName ?? "—",
      line.productUnit?.unit?.code ?? "—", posted ? decimal(line.quantityBefore) : "—",
      `${adjustment.movementType === "ADJO" ? "-" : "+"}${decimal(line.quantity)}`,
      posted ? decimal(line.quantityAfter) : "—", posted ? money(line.unitCost) : "—",
      posted ? money(line.inventoryValue) : "—",
    ]),
    totals: [
      { label: "Adjustment quantity", value: `${adjustment.movementType === "ADJO" ? "-" : "+"}${decimal(total(lines.map(line => line.quantity)))}` },
      { label: "Posted value", value: posted ? money(total(lines.map(line => line.inventoryValue))) : "—" },
    ],
  }];
  doc.notes = [...optional("Remarks", adjustment.remarks)];
  doc.audit = [
    { label: "Created by", value: user(adjustment.createdByUser) }, { label: "Created at", value: timestamp(adjustment.createdAt, timeZone) },
    ...(adjustment.postedAt ? [{ label: "Posted by", value: user(adjustment.postedByUser) }, { label: "Posted at", value: timestamp(adjustment.postedAt, timeZone) }] : []),
    ...(adjustment.cancelledAt ? [{ label: "Cancelled by", value: user(adjustment.cancelledByUser) }, { label: "Cancelled at", value: timestamp(adjustment.cancelledAt, timeZone) }] : []),
  ];
  return doc;
}

export function inventoryConversionDocument(conversion: InventoryConversion, timeZone: string): TransactionDocument {
  const doc = base(header(conversion.documentHeader), "INVENTORY CONVERSION", conversion.conversionNumber || `Draft #${conversion.inventoryConversionId}`, conversion.conversionDate, conversion.status, timeZone);
  const posted = conversion.status === "POSTED";
  doc.fields = [{ label: "Allocation method", value: conversion.allocationMethod.replaceAll("_", " ") }];
  doc.sections = (["AVAL", "AVIN"] as const).map(side => {
    const lines = (conversion.lines ?? []).filter(line => line.movementType === side);
    return {
      title: side === "AVAL" ? "AVAL - Source value out" : "AVIN - Allocated value in",
      columns: [
        { label: "#", weight: 0.35 }, { label: "SKU", weight: 0.8 }, { label: "Product", weight: 1.75 },
        { label: "Unit", weight: 0.65 }, { label: "Qty", weight: 0.7, numeric: true },
        { label: "Qty before", weight: 0.9, numeric: true }, { label: "Qty after", weight: 0.9, numeric: true },
        { label: "WAVG before", weight: 1, numeric: true }, { label: "Posted cost", weight: 1, numeric: true },
        { label: "Posted value", weight: 1.1, numeric: true },
      ],
      rows: lines.map((line, index) => [
        String(index + 1), line.product?.sku ?? "—", line.product?.productName ?? "—",
        line.productUnit?.unit?.code ?? "—", decimal(line.quantity),
        posted ? decimal(line.quantityBefore) : "—", posted ? decimal(line.quantityAfter) : "—",
        posted ? money(line.wavgBefore) : "—", posted ? money(line.postedUnitCost) : "—",
        posted ? money(line.postedValue) : "—",
      ]),
      totals: [{ label: `${side} posted value`, value: posted ? money(total(lines.map(line => line.postedValue))) : "—" }],
    };
  });
  doc.notes = [
    ...optional("Remarks", conversion.remarks),
    ...(posted ? [
      { label: "Total AVAL value", value: money(conversion.totalInputValue) },
      { label: "Total AVIN value", value: money(conversion.totalOutputValue) },
      { label: "Value variance", value: money(conversion.valueVariance) },
    ] : []),
  ];
  doc.audit = [
    { label: "Created by", value: user(conversion.createdByUser) }, { label: "Created at", value: timestamp(conversion.createdAt, timeZone) },
    ...(conversion.postedAt ? [{ label: "Posted by", value: user(conversion.postedByUser) }, { label: "Posted at", value: timestamp(conversion.postedAt, timeZone) }] : []),
    ...(conversion.cancelledAt ? [{ label: "Cancelled by", value: user(conversion.cancelledByUser) }, { label: "Cancelled at", value: timestamp(conversion.cancelledAt, timeZone) }] : []),
  ];
  return doc;
}

export function documentFilename(doc: TransactionDocument) {
  const source = doc.number.startsWith("Draft #") ? `${doc.title}-${doc.number}` : doc.number;
  const safe = source.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "document"}.pdf`;
}
