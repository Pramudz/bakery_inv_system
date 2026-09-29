import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { InvoiceRefundPayment } from '../invoice-refunds/invoice-refund-payment.entity';
import { InvoicePaymentReversal } from '../invoice-refunds/invoice-payment-reversal.entity';
import { snapshotInvoiceReceipt } from '../invoices/invoice-receipt';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentMethodType } from './payment-methods.entity';
import { PaymentMethodsService } from './payment-methods.service';

test('receipt snapshot preserves cash tender/change and card channel approval history', () => {
  const invoice: any = {
    invoiceNumber: 'INV-1', invoiceDate: new Date(), saleType: 'RETAIL', subtotal: '100.00', discountTotal: '0.00', grandTotal: '100.00',
    tenderedAmount: '120.00', paidAmount: '100.00', balanceAmount: '0.00', changeAmount: '20.00', paymentStatus: 'PAID', customer: null, details: [],
    payments: [
      { amount: '60.00', tenderedAmount: '80.00', changeAmount: '20.00', referenceNumber: null, collectionKey: null, paymentMethodTypeSnapshot: PaymentMethodType.CASH, paymentMethod: { paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH }, paymentChannelId: null },
      { amount: '40.00', tenderedAmount: '40.00', changeAmount: '0.00', referenceNumber: 'APP-1', collectionKey: null,
        paymentMethodTypeSnapshot: PaymentMethodType.CARD, paymentMethod: { paymentMethodName: 'Card', paymentMethodType: PaymentMethodType.CARD },
        paymentChannelId: 9, paymentChannelCodeSnapshot: 'COMMERCIAL', paymentChannelNameSnapshot: 'Commercial', paymentChannel: { code: 'CHANGED', name: 'Changed' } },
    ],
  };
  const snapshot: any = snapshotInvoiceReceipt(invoice);
  assert.equal(snapshot.payments[0].changeAmount, '20.00');
  assert.equal(snapshot.payments[1].paymentMethod.paymentMethodType, 'CARD');
  assert.deepEqual(snapshot.payments[1].paymentChannel, { paymentChannelId: 9, code: 'COMMERCIAL', name: 'Commercial' });
  assert.equal(snapshot.payments[1].referenceNumber, 'APP-1');
  assert.equal(snapshot.payments[1].source, 'NEW_SALE');
});

test('refund payment snapshots channels and reversals retain their original payment reference', () => {
  const columns = getMetadataArgsStorage().columns.filter((column) => column.target === InvoiceRefundPayment).map((column) => column.options.name);
  for (const name of ['payment_method_type_snapshot', 'payment_channel_id', 'payment_channel_code_snapshot', 'payment_channel_name_snapshot']) assert.ok(columns.includes(name));
  assert.ok(!columns.includes('payment_channel_machine_snapshot'));
  const relation = getMetadataArgsStorage().relations.find((item) => item.target === InvoicePaymentReversal && item.propertyName === 'invoicePayment');
  assert.ok(relation, 'A reversal must reference the original invoice payment and its channel snapshot.');
});

test('a method type with transaction history cannot be reinterpreted', async () => {
  const current = { paymentMethodId: 1, tenantId: 1, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH, isActive: true };
  const repo: any = { findOne: async () => current, update: async () => undefined };
  const service = new PaymentMethodsService(repo, { query: async () => [{ transactionCount: 1 }] } as any);
  await assert.rejects(service.update(1, { paymentMethodType: PaymentMethodType.CARD }, 1), ConflictException);
});

test('payment breakdown keeps new-sale receipts separate from later collections', async () => {
  const rows: any[] = [
    { amount: '50', tenderedAmount: '60', changeAmount: '10', collectionKey: null, invoice: { locationId: 3, location: { name: 'Main' } }, paymentMethodTypeSnapshot: PaymentMethodType.CASH, paymentMethod: { paymentMethodType: PaymentMethodType.CASH }, paymentChannelId: null },
    { amount: '25', tenderedAmount: '25', changeAmount: '0', collectionKey: 'collection-key', invoice: { locationId: 3, location: { name: 'Main' } }, paymentMethodTypeSnapshot: PaymentMethodType.CARD, paymentMethod: { paymentMethodType: PaymentMethodType.CARD }, paymentChannelId: 9, paymentChannelCodeSnapshot: 'COMMERCIAL', paymentChannelNameSnapshot: 'Commercial' },
  ];
  const dataSource: any = { getRepository: (entity: unknown) => entity === InvoicePayment ? { find: async () => rows } : null };
  const breakdown = await new InvoicesService(dataSource, {} as any).paymentBreakdown({ tenantId: 1, accessScope: 'TENANT', assignedLocationIds: [] } as any);
  assert.deepEqual(breakdown.map((row) => [row.locationId, row.locationName, row.source, row.methodType, row.appliedAmount, row.netReceived]), [[3, 'Main', 'COLLECTION', 'CARD', 25, 25], [3, 'Main', 'NEW_SALE', 'CASH', 50, 50]]);
});
