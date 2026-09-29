import { Invoice } from './invoice.entity';

export function snapshotInvoiceReceipt(invoice: Invoice) {
  return {
    version: 1,
    invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, saleType: invoice.saleType,
    subtotal: invoice.subtotal, discountTotal: invoice.discountTotal, grandTotal: invoice.grandTotal,
    tenderedAmount: invoice.tenderedAmount, paidAmount: invoice.paidAmount, balanceAmount: invoice.balanceAmount,
    changeAmount: invoice.changeAmount, paymentStatus: invoice.paymentStatus,
    customer: invoice.customer ? { customerName: invoice.customer.customerName } : null,
    details: [...invoice.details].sort((a, b) => Number(a.invoiceDetailId) - Number(b.invoiceDetailId)).map((line) => ({
      invoiceDetailId: line.invoiceDetailId, quantity: line.quantity, unitPrice: line.unitPrice,
      discountAmount: line.discountAmount, netTotal: line.netTotal,
      pricingSnapshot: (line as typeof line & { pricingSnapshot?: Record<string, unknown> }).pricingSnapshot ?? null,
      product: { sku: line.product.sku, productName: line.product.productName },
    })),
    payments: invoice.payments.map((payment) => ({
      amount: payment.amount, tenderedAmount: payment.tenderedAmount, changeAmount: payment.changeAmount,
      referenceNumber: payment.referenceNumber, source: payment.collectionKey ? 'COLLECTION' : 'NEW_SALE',
      paymentMethod: { paymentMethodName: payment.paymentMethod.paymentMethodName, paymentMethodType: payment.paymentMethodTypeSnapshot ?? payment.paymentMethod.paymentMethodType },
      paymentChannel: payment.paymentChannelId ? { paymentChannelId: payment.paymentChannelId, code: payment.paymentChannelCodeSnapshot ?? payment.paymentChannel?.code, name: payment.paymentChannelNameSnapshot ?? payment.paymentChannel?.name } : null,
    })),
  };
}
