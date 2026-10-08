import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceReceiptModel } from './invoiceReceiptModel.ts';
import { saleBillReference } from './saleBillReference.ts';

test('sale preview uses issued fields and payment breakdown from the archived receipt', () => {
  const snapshot = {
    businessDate: '2026-10-02', issuedAt: '2026-10-02T05:12:00.000Z',
    printedLocationCode: 'BANDA', printedRegisterCode: 'POS1', billNo: 1,
    header: { companyName: 'Original Bakery', locationAddress: ['12 Main Road'], cashierCode: 'C17', timeZone: 'Asia/Colombo' },
    grandTotal: '220.00', subtotal: '240.00', discountTotal: '20.00',
    paidAmount: '220.00', tenderedAmount: '250.00', changeAmount: '30.00', balanceAmount: '0.00',
    details: [{ invoiceDetailId: 1, quantity: '2', unitPrice: '120.00', discountAmount: '20.00', netTotal: '220.00', product: { sku: 'BRD', productName: 'Bread' } }],
    payments: [{ amount: '220.00', tenderedAmount: '250.00', changeAmount: '30.00', paymentMethod: { paymentMethodName: 'Cash' } }],
  };
  const model = invoiceReceiptModel({ receiptSnapshot: snapshot, grandTotal: '999.00', billNo: 99, payments: [{ amount: '999.00', collectionKey: 'later' }] });
  assert.equal(model.receiptDate, '02/10/2026 10:42');
  assert.equal(model.billNo, 1);
  assert.equal(model.locationCode, 'BANDA');
  assert.equal(model.registerCode, 'POS1');
  assert.equal(model.header.companyName, 'Original Bakery');
  assert.equal(model.cart[0].name, 'Bread');
  assert.equal(model.cart[0].lineNumber, 1);
  assert.equal(model.paidTotal, 220);
  assert.equal(model.tenderedTotal, 250);
  assert.equal(model.changeTotal, 30);
  assert.equal(model.outstandingBalance, 0);
  assert.equal(model.payments.length, 1);
  assert.equal(saleBillReference(snapshot), '02/10/2026 / BANDA / POS1 / 0001');
});

test('credit receipt shows the original outstanding balance', () => {
  const model = invoiceReceiptModel({ receiptSnapshot: {
    businessDate: '2026-10-02', issuedAt: '2026-10-02T06:00:00.000Z',
    printedLocationCode: 'ANU', printedRegisterCode: 'MASTER', billNo: 3,
    grandTotal: '100.00', subtotal: '100.00', discountTotal: '0.00', paidAmount: '25.00', tenderedAmount: '25.00', changeAmount: '0.00',
    customer: { customerName: 'Credit Customer' }, details: [], payments: [],
  } });
  assert.equal(model.outstandingBalance, 75);
  assert.equal(model.selectedCustomer.name, 'Credit Customer');
  assert.equal(saleBillReference({}), 'Legacy sale');
});
