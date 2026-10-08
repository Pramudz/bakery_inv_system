import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';

test('original bill keeps checkout amounts and names after later changes', () => {
  const { snapshotInvoiceReceipt } = require('./invoice-receipt');
  const invoice: any = {
    invoiceNumber: 'INV-001', invoiceDate: new Date('2026-09-27T10:00:00Z'), saleType: 'RETAIL',
    subtotal: '5000.00', discountTotal: '500.00', grandTotal: '4500.00', tenderedAmount: '2000.00',
    paidAmount: '2000.00', balanceAmount: '2500.00', changeAmount: '0.00', paymentStatus: 'PARTIALLY_PAID',
    customer: { customerName: 'Kamal', email: 'private@example.com' },
    details: [{ invoiceDetailId: 1, lineNumber: 1, quantity: '2', unitPrice: '2500.00', discountAmount: '500.00', netTotal: '4500.00', product: { sku: 'B01', productName: 'Cake' } }],
    payments: [{ amount: '2000.00', tenderedAmount: '2000.00', paymentMethod: { paymentMethodName: 'Cash' } }],
  };
  const snapshot = snapshotInvoiceReceipt(invoice);
  invoice.paidAmount = '4500.00'; invoice.tenderedAmount = '4500.00'; invoice.balanceAmount = '0.00';
  invoice.customer.customerName = 'Changed'; invoice.details[0].product.productName = 'Changed';
  assert.equal(snapshot.tenderedAmount, '2000.00');
  assert.equal(snapshot.balanceAmount, '2500.00');
  assert.equal(snapshot.customer.customerName, 'Kamal');
  assert.equal(snapshot.details[0].product.productName, 'Cake');
  assert.equal(snapshot.details[0].lineNumber, 1);
  assert.equal(snapshot.payments[0].paymentMethod.paymentMethodName, 'Cash');
  assert.equal(snapshot.customer.email, undefined);
});
