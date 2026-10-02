import { invoiceReceiptModel } from './invoiceReceiptModel';

export function downloadInvoiceReceipt(invoice: Record<string, any>) {
    const { cart, paidTotal, total, outstandingBalance, subtotal, discount, method, paymentStatus, saleType, selectedCustomer, completedInvoice, receiptDate, unitPrice, lineNet } = invoiceReceiptModel(invoice);
    const paidAmount = paidTotal,
      change = Math.max(0, paidAmount - total);
    const escapePdf = (value: string) =>
      value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const pageWidth = 226.77,
      pageHeight = 500 + cart.length * 33;
    let y = pageHeight - 24;
    const commands: string[] = [];
    const text = (
      value: string,
      x: number,
      size = 6,
      bold = false,
      align: "left" | "center" | "right" = "left",
      color = "0 0 0",
    ) => {
      const width = value.length * size * 0.6;
      const drawX =
        align === "center"
          ? (pageWidth - width) / 2
          : align === "right"
            ? x - width
            : x;
      commands.push(
        `${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(value)}) Tj ET`,
      );
    };
    const rule = (strong = false) => {
      commands.push(
        `${strong ? "0.8" : "0.35"} w [${strong ? "" : "2 2"}] 0 d 14 ${y.toFixed(2)} m 212 ${y.toFixed(2)} l S [] 0 d`,
      );
    };
    text("ERP CORE BAKERY", 0, 13, true, "center");
    y -= 15;
    text("Main Bakery Outlet - Colombo, Sri Lanka", 0, 5.5, true, "center");
    y -= 8;
    text("Tel: 011 234 5678 - bakery@example.com", 0, 5, false, "center");
    y -= 7;
    text("Fresh bakery products made daily", 0, 5, false, "center");
    y -= 15;
    text("SALES INVOICE", 0, 10, true, "center");
    y -= 13;
    rule();
    y -= 12;
    text("Bill No", 14, 5);
    text(completedInvoice?.invoiceNumber ?? "NEW INVOICE", 105, 5.5, true, "right");
    text("Date", 119, 5);
    text(receiptDate, 212, 5.2, true, "right");
    y -= 11;
    text("Cashier", 14, 5);
    text("Counter User", 105, 5.5, true, "right");
    text("Customer", 119, 5);
    text(
      (selectedCustomer?.name ?? "No customer").slice(0, 18),
      212,
      5.2,
      true,
      "right",
    );
    y -= 11;
    text("Payment", 14, 5);
    text(method, 105, 5.5, true, "right");
    y -= 11;
    rule();
    y -= 12;
    text("CODE", 14, 6, true);
    text("ITEM NAME", 62, 6, true);
    y -= 10;
    text("QTY", 44, 6, true, "right");
    text("RATE", 104, 6, true, "right");
    text("DISCOUNT", 158, 5.5, true, "right");
    text("AMOUNT", 212, 5.5, true, "right");
    y -= 8;
    rule(true);
    y -= 13;
    cart.forEach((item) => {
      text(item.code, 14, 6, true);
      text(item.name.slice(0, 25), 62, 6, true);
      y -= 11;
      text(item.qty.toFixed(3), 44, 6, true, "right");
      text(unitPrice(item).toFixed(2), 104, 6, false, "right");
      text(item.discountRs.toFixed(2), 158, 6, false, "right");
      text(lineNet(item).toFixed(2), 212, 6, true, "right");
      y -= 10;
      rule();
      y -= 12;
    });
    const summary = (
      label: string,
      value: string,
      bold = false,
      color = "0 0 0",
    ) => {
      text(label, 14, bold ? 6.5 : 5.8, bold);
      text(value, 212, bold ? 7 : 6, bold, "right", color);
      y -= 14;
    };
    summary("Items count", String(cart.reduce((n, x) => n + x.qty, 0)));
    summary("Subtotal", `LKR ${subtotal.toFixed(2)}`);
    summary("Total discount", `- LKR ${discount.toFixed(2)}`);
    rule();
    y -= 13;
    summary("Original Total", `LKR ${total.toFixed(2)}`, true);
    rule();
    y -= 13;
    summary("Paid Amount", `LKR ${paidAmount.toFixed(2)}`);
    summary("Outstanding Balance", `LKR ${outstandingBalance.toFixed(2)}`);
    if (change > 0) summary("Change", `LKR ${change.toFixed(2)}`);
    summary("Payment method", method);
    summary(
      "Payment status",
      paymentStatus,
      true,
      paymentStatus === "Full Paid" ? "0.05 0.5 0.2" : "0.72 0.38 0.02",
    );
    rule();
    y -= 18;
    text("Thank you for shopping with us!", 0, 7, true, "center");
    y -= 10;
    text(
      "We appreciate your business and hope to see you again.",
      0,
      4.5,
      false,
      "center",
    );
    y -= 17;
    rule();
    y -= 12;
    text(
      "Software By: Prosinc - 07111111111",
      0,
      4.5,
      false,
      "center",
      "0.45 0.5 0.58",
    );
    const content = commands.join("\n").replace(/[^\x20-\x7E\n]/g, "?");
    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
      `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
      "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n",
    ];
    let pdf = "%PDF-1.4\n",
      offsets = [0];
    objects.forEach((object) => {
      offsets.push(pdf.length);
      pdf += object;
    });
    const xref = pdf.length;
    pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((x) => String(x).padStart(10, "0") + " 00000 n ")
      .join(
        "\n",
      )}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const url = URL.createObjectURL(
      new Blob([pdf], { type: "application/pdf" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${completedInvoice?.invoiceNumber ?? "invoice"}-receipt.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
