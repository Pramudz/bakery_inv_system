import { InvoicePayment } from './invoice-payment.entity';

// Financial figures come only from the persisted payment, never today's invoice balance.
export function snapshotPaymentCollection(payment: InvoicePayment) {
  const invoice = payment.invoice;
  if (!invoice) throw new Error('A payment receipt requires its invoice relation');
  const customer = invoice.customer;
  const location = invoice.location;
  const staff = payment.createdByUser;
  return {
    documentType: 'PAYMENT_COLLECTION',
    paymentReceiptNumber: `PAY-${String(payment.invoicePaymentId).padStart(6, '0')}`,
    issuedAt: payment.paidAt,
    header: {
      companyName: invoice.tenant?.name ?? '',
      locationName: location?.name ?? '',
      locationCode: location?.code ?? invoice.printedLocationCode ?? '',
      locationAddress: location ? [location.addressLine1, location.addressLine2, location.city, location.stateProvince, location.postalCode].filter(Boolean) : [],
      locationPhone: location?.phone ?? null,
      cashierName: staff ? [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.username : '',
      timeZone: invoice.tenant?.timeZone ?? 'Asia/Colombo',
    },
    originalSale: {
      invoiceNumber: invoice.invoiceNumber,
      businessDate: invoice.businessDate,
      locationCode: invoice.printedLocationCode,
      registerCode: invoice.printedRegisterCode,
      billNo: invoice.billNo,
    },
    customer: customer ? { customerName: customer.customerName, phone: customer.mobile || customer.phone || null } : null,
    paymentMethod: { paymentMethodName: payment.paymentMethod?.paymentMethodName ?? 'Payment' },
    paymentChannel: payment.paymentChannelNameSnapshot || payment.paymentChannel?.name
      ? { name: payment.paymentChannelNameSnapshot ?? payment.paymentChannel?.name ?? '' } : null,
    referenceNumber: payment.referenceNumber,
    originalInvoiceTotal: invoice.grandTotal,
    balanceBefore: payment.balanceBefore,
    tenderedAmount: payment.tenderedAmount,
    amount: payment.amount,
    changeAmount: payment.changeAmount,
    balanceAfter: payment.balanceAfter,
  };
}
