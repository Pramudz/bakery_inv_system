import { Invoice } from '../invoices/invoice.entity';
import { InvoiceRefund } from './invoice-refund.entity';

export function snapshotRefundReceipt(refund: InvoiceRefund, invoice: Invoice, header: Record<string, unknown>) {
  const sale = invoice.receiptSnapshot;
  return {
    version: 1,
    documentType: 'REFUND',
    header,
    businessDate: refund.businessDate,
    refundNo: refund.refundNo,
    printedLocationCode: refund.printedLocationCode,
    printedRegisterCode: refund.printedRegisterCode,
    issuedAt: refund.issuedAt,
    reason: refund.reason,
    subtotal: refund.subtotal,
    itemDiscountTotal: refund.details ? refund.details.reduce((sum, line) => sum + Number(line.discountAmount), 0).toFixed(2) : refund.discountTotal,
    billDiscountTotal: (refund.details ?? []).reduce((sum, line) => sum + Number(line.billDiscountAllocated ?? 0), 0).toFixed(2),
    discountTotal: refund.discountTotal,
    refundTotal: refund.refundTotal,
    originalSale: invoice.billNo == null ? null : {
      businessDate: invoice.businessDate,
      locationCode: invoice.printedLocationCode,
      registerCode: invoice.printedRegisterCode,
      billNo: invoice.billNo,
      issuedAt: invoice.issuedAt,
    },
    customer: sale?.customer ?? null,
    details: [...(refund.details ?? [])].sort((a, b) => Number(a.invoiceRefundDetailId) - Number(b.invoiceRefundDetailId)).map((line) => ({
      lineNumber: line.lineNumber, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount, billDiscountAllocated: line.billDiscountAllocated ?? '0',
      refundAmount: line.refundAmount, product: { sku: line.product.sku, productName: line.product.productName },
    })),
    payments: (refund.payments ?? []).map((payment) => ({
      amount: payment.amount,
      referenceNumber: payment.referenceNumber,
      paymentMethod: { paymentMethodName: payment.paymentMethod?.paymentMethodName ?? payment.paymentMethodTypeSnapshot ?? 'Payment', paymentMethodType: payment.paymentMethodTypeSnapshot },
      paymentChannel: payment.paymentChannelId ? { name: payment.paymentChannelNameSnapshot, code: payment.paymentChannelCodeSnapshot } : null,
    })),
  };
}
