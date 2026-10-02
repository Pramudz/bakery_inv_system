type ReceiptLine = { code: string; name: string; qty: number; rate: number; discountRs: number; net: number };

export function invoiceReceiptModel(invoice: Record<string, any>) {
  const original = invoice.receiptSnapshot ?? invoice;
  const payments = original.payments ?? [];
  // Legacy invoices have no archived bill. Later collections are separate receipts.
  const initialPayments = invoice.receiptSnapshot ? payments : payments.filter((payment: any) => !payment.collectionKey);
  const paidTotal = invoice.receiptSnapshot ? Number(original.paidAmount) : initialPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
  const tenderedTotal = invoice.receiptSnapshot ? Number(original.tenderedAmount) : initialPayments.reduce((sum: number, payment: any) => sum + Number(payment.tenderedAmount ?? payment.amount), 0);
  const changeTotal = invoice.receiptSnapshot ? Number(original.changeAmount) : initialPayments.reduce((sum: number, payment: any) => sum + Number(payment.changeAmount ?? 0), 0);
  const total = Number(original.grandTotal);
  const names = [...new Set(initialPayments.map((payment: any) => payment.paymentMethod?.paymentMethodName ? `${payment.paymentMethod.paymentMethodName}${payment.paymentChannel?.name ? ` → ${payment.paymentChannel.name}` : ''}` : null).filter(Boolean))];
  const method = names.join(' + ') || 'Unpaid';
  const cart: ReceiptLine[] = [...(original.details ?? [])].sort((a: any, b: any) => Number(a.invoiceDetailId) - Number(b.invoiceDetailId)).map((line: any) => ({
    code: line.product?.sku ?? '', name: line.product?.productName ?? '', qty: Number(line.quantity), rate: Number(line.unitPrice), discountRs: Number(line.discountAmount), net: Number(line.netTotal),
  }));
  const date = new Date(original.invoiceDate);
  const receiptDate = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' });
  return { cart, paidTotal, tenderedTotal, changeTotal, total, outstandingBalance: Math.max(0, total - paidTotal), subtotal: Number(original.subtotal), discount: Number(original.discountTotal), method,
    paymentStatus: paidTotal >= total && total > 0 ? 'Full Paid' : paidTotal > 0 ? 'Partially Paid' : 'None Paid',
    saleType: original.saleType === 'WHOLESALE' ? 'Wholesale' : 'Retail',
    selectedCustomer: original.customer ? { name: original.customer.customerName } : null,
    completedInvoice: original, receiptDate, unitPrice: (line: ReceiptLine) => line.rate, lineNet: (line: ReceiptLine) => line.net,
  };
}

