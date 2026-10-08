import type { Quotation } from "../api/quotationsApi";

// The existing sale receipt uses a small, dependency-free PDF writer. Quotations
// use the same PDF object approach with a wider page for the line table.
export function downloadQuotationPdf(
  q: Quotation,
  companyName: string,
  mode: "download" | "view" | "print" = "download",
  company?: {
    phone?: string | null;
    email?: string | null;
    addressLine1?: string | null;
    city?: string | null;
  },
) {
  const width = 595,
    height = Math.max(
      842,
      560 +
        q.lines.length * 24 +
        Math.ceil((q.notes?.length || 0) / 85) * 18 +
        Math.ceil((q.termsAndConditions?.length || 0) / 85) * 18,
    );
  let y = height - 46;
  const commands: string[] = [];
  const escaped = (s: string) =>
    s
      .replace(/[^\x20-\x7e]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  const line = (value: unknown, x = 42, size = 10, bold = false) =>
    commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escaped(String(value ?? ""))}) Tj ET`,
    );
  const row = (...parts: [unknown, number][]) => {
    for (const [value, x] of parts) line(value, x, 9);
    y -= 20;
  };
  const paragraph = (value: string) => {
    const words = value.split(/\s+/);
    let current = "";
    for (const word of words) {
      if (`${current} ${word}`.length > 85 && current) {
        row([current, 42]);
        current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    if (current) row([current, 42]);
  };
  const rule = () => {
    commands.push(`0.5 w 42 ${y} m 553 ${y} l S`);
    y -= 15;
  };
  const date = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
  const amount = (s: string | number) =>
    Number(s).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  line(companyName, 42, 16, true);
  y -= 28;
  if (company?.addressLine1 || company?.city)
    row([[company.addressLine1, company.city].filter(Boolean).join(", "), 42]);
  if (company?.phone || company?.email)
    row([[company.phone, company.email].filter(Boolean).join(" · "), 42]);
  line("QUOTATION", 42, 15, true);
  y -= 24;
  row(
    [`No: ${q.quotationNumber}`, 42],
    [`Date: ${date(q.quotationDate)}`, 310],
  );
  row(
    [`Valid Until: ${date(q.validUntil)}`, 42],
    [`Status: ${q.effectiveStatus || q.status}`, 310],
  );
  row([
    `Issuing Location: ${q.locationNameSnapshot} (${q.locationCodeSnapshot})`,
    42,
  ]);
  rule();
  line("Customer", 42, 11, true);
  y -= 18;
  row([`${q.customerCodeSnapshot} - ${q.customerNameSnapshot}`, 42]);
  if (q.customerAddressSnapshot)
    row([q.customerAddressSnapshot.slice(0, 85), 42]);
  if (q.customerPhoneSnapshot)
    row([`Telephone: ${q.customerPhoneSnapshot}`, 42]);
  if (q.customerEmailSnapshot) row([`Email: ${q.customerEmailSnapshot}`, 42]);
  y -= 6;
  rule();
  row(
    ["#", 42],
    ["Code", 65],
    ["Description", 135],
    ["Qty", 335],
    ["Price", 382],
    ["Discount", 442],
    ["Total", 510],
  );
  rule();
  q.lines.forEach((item, i) =>
    row(
      [i + 1, 42],
      [item.productCodeSnapshot.slice(0, 11), 65],
      [item.productNameSnapshot.slice(0, 32), 135],
      [Number(item.quantity), 335],
      [amount(item.unitPrice), 382],
      [amount(item.discountAmount), 442],
      [amount(item.netTotal), 510],
    ),
  );
  rule();
  row(["Subtotal", 405], [`LKR ${amount(q.subtotal)}`, 485]);
  row(["Discount", 405], [`LKR ${amount(q.discountTotal)}`, 485]);
  line(`QUOTATION TOTAL: LKR ${amount(q.grandTotal)}`, 310, 12, true);
  y -= 30;
  if (q.notes) {
    line("Notes", 42, 10, true);
    y -= 16;
    paragraph(q.notes);
  }
  if (q.termsAndConditions) {
    line("Terms & Conditions", 42, 10, true);
    y -= 16;
    paragraph(q.termsAndConditions);
  }
  y -= 10;
  row([
    `Prepared by: ${q.createdByUser?.firstName || q.createdByUser?.username || "—"}`,
    42,
  ]);
  line("This document is a quotation and not a tax invoice.", 42, 9);
  const content = commands.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });
  const xref = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => `${String(x).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  if (mode === "download") {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${q.quotationNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    const windowRef = window.open(url, "_blank");
    if (mode === "print" && windowRef)
      windowRef.addEventListener("load", () => windowRef.print(), {
        once: true,
      });
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
