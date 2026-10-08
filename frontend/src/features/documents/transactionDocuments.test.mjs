import assert from "node:assert/strict";
import test from "node:test";
import {
  documentFilename,
  goodsReceiptDocument,
  inventoryAdjustmentDocument,
  inventoryConversionDocument,
  purchaseOrderDocument,
} from "./transactionDocuments.ts";
import { documentPages, transactionDocumentPdf } from "./transactionDocumentPdf.ts";

const header = {
  company: { name: "Test Bakery", phone: "0112345678" },
  location: { name: "Anuradhapura", code: "ANU" },
};
const person = { firstName: "Kasun", lastName: "Perera", username: "kasun" };
const product = { sku: "CB-001", productName: "Cake Box" };
const unit = { unit: { code: "BOX" } };
const zone = "Asia/Colombo";

test("PO document keeps saved cost, discount, tax and cancelled audit", () => {
  const doc = purchaseOrderDocument({
    purchaseOrderId: 2, poNumber: "PO-1-2026-000002", orderDate: "2026-10-06",
    status: "CANCELLED", currencyCode: "LKR", documentHeader: header,
    supplier: { supplierCode: "SUP-01", supplierName: "Foods Ltd", addressLine1: "Main Street" },
    createdByUser: person, cancelledByUser: person, cancelledAt: "2026-10-06T10:00:00Z",
    lines: [{ product, productUnit: unit, orderedQty: "2.0000", unitCost: "100.0000", discountAmount: "5.0000", taxAmount: "2.0000", lineTotal: "194.0000" }],
  }, zone);
  assert.equal(doc.status, "CANCELLED");
  assert.ok(doc.fields.some(row => row.value.includes("Foods Ltd")));
  assert.equal(doc.sections[0].rows[0].at(-1), "LKR 194.00");
  assert.equal(doc.sections[0].totals.at(-1).value, "LKR 194.00");
  assert.ok(doc.audit.some(row => row.label === "Cancelled by" && row.value === "Kasun Perera"));
  assert.equal(documentFilename(doc), "PO-1-2026-000002.pdf");
});

test("direct and PO based GRNs keep receipt totals and reversal status", () => {
  const base = {
    goodsReceiptId: 3, grnNumber: "GRN-3", receiptDate: "2026-10-06", status: "POSTED",
    currencyCode: "LKR", documentHeader: header, supplier: { supplierCode: "SUP-01", supplierName: "Foods Ltd" },
    createdByUser: person, postedByUser: person, postedAt: "2026-10-06T08:00:00Z",
    lines: [{ product, productUnit: unit, receivedQty: "3.0000", unitCost: "25.0000", lineTotal: "75.0000" }],
  };
  const direct = goodsReceiptDocument({ ...base, receiptType: "DIRECT" }, zone);
  assert.equal(direct.fields[0].value, "Direct");
  assert.equal(direct.sections[0].totals.at(-1).value, "LKR 75.00");
  assert.ok(direct.audit.some(row => row.label === "Posted by" && row.value === "Kasun Perera"));
  const reversed = goodsReceiptDocument({ ...base, receiptType: "PO_BASED", purchaseOrder: { poNumber: "PO-9" }, status: "REVERSED", reversalReason: "Damaged", reversedByUser: person, reversedAt: "2026-10-07T08:00:00Z" }, zone);
  assert.equal(reversed.status, "REVERSED");
  assert.ok(reversed.fields.some(row => row.value === "PO-9"));
  assert.ok(reversed.notes.some(row => row.label === "Reversal reason" && row.value === "Damaged"));
  assert.equal(reversed.sections[0].rows[0].at(-1), "LKR 75.00");
});

test("ADJI and ADJO use posted quantity and value snapshots with clear direction", () => {
  const base = {
    inventoryAdjustmentId: 4, adjustmentNumber: "ADJI-4", adjustmentDate: "2026-10-06",
    status: "POSTED", documentHeader: header, reason: { code: "COUNT", name: "Stock count" },
    createdByUser: person, postedByUser: person, postedAt: "2026-10-06T08:00:00Z",
    lines: [{ product, productUnit: unit, quantity: "5.0000", quantityBefore: "10.0000", quantityAfter: "15.0000", unitCost: "8.0000", inventoryValue: "40.0000" }],
  };
  const incoming = inventoryAdjustmentDocument({ ...base, movementType: "ADJI" }, zone);
  assert.equal(incoming.sections[0].rows[0][5], "+5");
  assert.equal(incoming.sections[0].rows[0][8], "LKR 40.00");
  const outgoing = inventoryAdjustmentDocument({ ...base, movementType: "ADJO", adjustmentNumber: "ADJO-4", lines: [{ ...base.lines[0], quantityAfter: "5.0000" }] }, zone);
  assert.equal(outgoing.sections[0].rows[0][5], "-5");
  assert.equal(outgoing.sections[0].rows[0][6], "5");
  const draft = inventoryAdjustmentDocument({ ...base, movementType: "ADJI", status: "DRAFT" }, zone);
  assert.equal(draft.sections[0].rows[0][8], "—");
});

test("one inventory conversion document shows AVAL and AVIN posted snapshots", () => {
  const doc = inventoryConversionDocument({
    inventoryConversionId: 5, conversionNumber: "CONV-5", conversionDate: "2026-10-06",
    status: "POSTED", allocationMethod: "BY_EXISTING_WAVG", documentHeader: header,
    totalInputValue: "60.0000", totalOutputValue: "60.0000", valueVariance: "0.0000",
    createdByUser: person, postedByUser: person, postedAt: "2026-10-06T08:00:00Z",
    lines: [
      { movementType: "AVAL", product, productUnit: unit, quantity: "2.0000", quantityBefore: "10.0000", quantityAfter: "8.0000", wavgBefore: "30.0000", postedUnitCost: "30.0000", postedValue: "60.0000" },
      { movementType: "AVIN", product, productUnit: unit, quantity: "3.0000", quantityBefore: "0.0000", quantityAfter: "3.0000", wavgBefore: null, postedUnitCost: "20.0000", postedValue: "60.0000" },
    ],
  }, zone);
  assert.equal(doc.sections.length, 2);
  assert.equal(doc.sections[0].rows[0].at(-1), "LKR 60.00");
  assert.equal(doc.sections[1].rows[0].at(-1), "LKR 60.00");
  assert.ok(doc.notes.some(row => row.label === "Value variance" && row.value === "LKR 0.00"));
});

test("PDF page plan keeps 1, 10, and 55 line documents below the footer", () => {
  const base = purchaseOrderDocument({
    purchaseOrderId: 2, poNumber: "PO-2", orderDate: "2026-10-06", status: "DRAFT",
    currencyCode: "LKR", documentHeader: header,
    lines: [],
  }, zone);
  for (const count of [1, 10, 55]) {
    const doc = { ...base, sections: [{ ...base.sections[0], rows: Array.from({ length: count }, (_, i) => [String(i + 1), "CB-001", "Cake Box", "BOX", "2", "LKR 10.00", "LKR 0.00", "LKR 0.00", "LKR 20.00"]) }] };
    const pages = documentPages(doc);
    assert.equal(pages.flatMap(page => page.blocks).filter(block => block.kind === "row").length, count);
    assert.ok(pages.every(page => page.blocks.every(block => block.y < 1090)));
    assert.ok(count < 55 || pages.length > 1);
  }
});

test("shared document renderer emits one paginated PDF with visible status and page numbers", async () => {
  const oldDocument = globalThis.document;
  const drawn = [];
  const context = {
    fillRect() {}, fillText(value) { drawn.push(value); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const canvas = { getContext: () => context, toDataURL: () => "data:image/jpeg;base64,/9j/2Q==" };
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement: () => canvas };
  try {
    const doc = purchaseOrderDocument({ purchaseOrderId: 1, poNumber: "PO-1", orderDate: "2026-10-06", status: "CANCELLED", currencyCode: "LKR", documentHeader: header, lines: Array.from({ length: 55 }, () => ({ product, productUnit: unit, orderedQty: "1", unitCost: "10", lineTotal: "10" })) }, zone);
    const blob = await transactionDocumentPdf(doc);
    const pdf = await blob.text();
    assert.ok(Number(pdf.match(/\/Count (\d+)/)[1]) > 1);
    assert.ok(drawn.includes("CANCELLED"));
    assert.ok(drawn.some(value => /^Page 1 of \d+$/.test(value)));
    assert.ok(drawn.includes("LKR 550.00"));
  } finally { globalThis.document = oldDocument; }
});
