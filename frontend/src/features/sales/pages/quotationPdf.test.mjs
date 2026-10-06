import assert from "node:assert/strict";
import test from "node:test";
import { downloadQuotationPdf } from "./quotationPdf.ts";

test("quotation PDF uses persisted snapshots and displays the final document state", async () => {
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const oldDocument = globalThis.document;
  const oldTimeout = globalThis.setTimeout;
  let blob;
  let download;
  URL.createObjectURL = (value) => {
    blob = value;
    return "blob:quotation-test";
  };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => ({
      href: "",
      download: "",
      click() {
        download = this.download;
      },
      remove() {},
    }),
  };
  globalThis.setTimeout = () => 0;
  try {
    downloadQuotationPdf(
      {
        quotationNumber: "QUO-1-2026-000001",
        quotationDate: "2026-10-06",
        validUntil: "2026-10-13",
        status: "ACCEPTED",
        effectiveStatus: "ACCEPTED",
        locationNameSnapshot: "Anuradhapura",
        locationCodeSnapshot: "ANU",
        customerCodeSnapshot: "CUS-001",
        customerNameSnapshot: "Sweet Delights Bakery",
        customerAddressSnapshot: "Main Street",
        customerPhoneSnapshot: "0771234567",
        customerEmailSnapshot: null,
        subtotal: "300.00",
        discountTotal: "30.00",
        grandTotal: "270.00",
        notes: "Deliver before noon",
        termsAndConditions: "Prices valid until the date above",
        createdByUser: { username: "kasun" },
        lines: [
          {
            productCodeSnapshot: "CB-001",
            productNameSnapshot: "Cake Box",
            quantity: "2.0000",
            unitPrice: "150.00",
            discountAmount: "30.00",
            netTotal: "270.00",
          },
        ],
      },
      "Test Bakery",
    );
    assert.equal(download, "QUO-1-2026-000001.pdf");
    assert.equal(blob.type, "application/pdf");
    const pdf = await blob.text();
    for (const value of [
      "%PDF-1.4",
      "QUOTATION",
      "ACCEPTED",
      "Sweet Delights Bakery",
      "Cake Box",
      "QUOTATION TOTAL: LKR 270.00",
      "not a tax invoice",
    ])
      assert.ok(pdf.includes(value), value);
  } finally {
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
    globalThis.document = oldDocument;
    globalThis.setTimeout = oldTimeout;
  }
});
