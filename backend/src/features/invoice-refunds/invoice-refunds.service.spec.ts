import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Invoice } from '../invoices/invoice.entity';
import { ForbiddenException } from '@nestjs/common';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceAdjustment } from './invoice-adjustment.entity';
import { InvoiceRefundsService } from './invoice-refunds.service';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { InvoicePaymentReversal } from './invoice-payment-reversal.entity';

function fixture(paidAmount = '20') {
  const invoice = { invoiceId: '1', tenantId: 1, locationId: 3, invoiceStatus: 'PARTIALLY_REFUNDED', grandTotal: '50', paidAmount, tenderedAmount: paidAmount, changeAmount: '0', balanceAmount: '15', paymentStatus: Number(paidAmount) > 0 ? 'PARTIALLY_PAID' : 'UNPAID', details: [{
    invoiceDetailId: '12', quantity: '5', grossTotal: '50', discountAmount: '0',
    unitPrice: '10', discountPercentage: '0', productId: 8, product: { productName: 'Bread', isStockItem: false },
  }] };
  const refunds: any[] = [{ invoiceRefundId: 9, invoiceId: '1', tenantId: 1, status: 'COMPLETED', refundTotal: '20', payments: [{ amount: '5' }] }];
  const activePayments: any[] = Number(paidAmount) > 0 ? [{ invoicePaymentId: 4, invoiceId: '1', paymentMethodId: 1, amount: paidAmount, tenderedAmount: paidAmount, changeAmount: '0', isReversed: false, collectionKey: null }] : [];
  const query: any = {};
  for (const method of ['innerJoin', 'select', 'addSelect', 'where', 'groupBy']) {
    query[method] = () => query;
  }
  query.getRawMany = async () => [{ invoiceDetailId: '12', quantity: '2' }];
  const manager = { getRepository: (entity: unknown) => entity === Invoice
    ? { findOne: async () => invoice, save: async (value: any) => Object.assign(invoice, value) }
    : entity === InvoiceRefund ? {
      find: async () => refunds,
      create: (value: any) => value,
      save: async (value: any) => {
        if (!value.invoiceRefundId) { value.invoiceRefundId = 10; value.payments = []; refunds.push(value); }
        return value;
      },
      findOne: async () => ({ invoiceRefundId: 10 }),
    }
    : entity === InvoiceAdjustment ? { find: async () => [] }
    : entity === InvoicePayment ? {
      findBy: async () => activePayments.filter((payment) => !payment.isReversed),
      findOne: async ({ where }: any) => activePayments.find((payment) => Number(payment.invoicePaymentId) === Number(where.invoicePaymentId) && Number(payment.invoiceId) === Number(where.invoiceId)) ?? null,
      create: (value: any) => value,
      save: async (value: any) => { const found = activePayments.find((payment) => payment.invoicePaymentId === value.invoicePaymentId); if (found) Object.assign(found, value); else activePayments.push(value); return value; },
    }
    : entity === InvoicePaymentReversal ? { create: (value: any) => value, save: async (value: any) => value }
    : entity === InvoiceRefundPayment ? { create: (value: any) => value, save: async (value: any) => { refunds.find((row) => row.invoiceRefundId === value.invoiceRefundId)?.payments.push(value); return value; } }
    : entity === InvoiceRefundDetail ? { createQueryBuilder: () => query, create: (value: any) => value, save: async (value: any) => value }
    : entity === PaymentMethod ? { findOneBy: async () => ({ paymentMethodId: 1, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH }) }
    : { create: (value: any) => value, save: async (value: any) => value, findOneBy: async () => null } };
  const service = new InvoiceRefundsService({
    ...manager, manager, transaction: (run: any) => run(manager),
  } as any);
  return { service, invoice, user: { tenantId: 1, userId: 1, accessScope: 'TENANT', assignedLocationIds: [] } as any };
}

test('refundable quantities include prior refunds when MySQL returns string IDs', async () => {
  const { service, user } = fixture();
  const result = await service.refundableInvoice(1, user);
  assert.equal(result.details[0].refundedQuantity, 2);
  assert.equal(result.details[0].refundableQuantity, 3);
});

test('numeric request IDs match MySQL string IDs and reach payment validation', async () => {
  const { service, user } = fixture();
  await assert.rejects(service.create({ invoiceId: 1, reason: 'Return',
    details: [{ invoiceDetailId: 12, quantity: 1 }],
    payments: [{ paymentMethodId: 1, amount: 11 }],
  }, user), /Refund payments cannot exceed the refund total/);
});

test('prior refunds limit the quantity allowed for string invoice line IDs', async () => {
  const { service, user } = fixture();
  await assert.rejects(service.create({ invoiceId: 1, reason: 'Return',
    details: [{ invoiceDetailId: 12, quantity: 4 }],
  }, user), /Refund quantity exceeds the available quantity/);
});

test('lines outside the invoice remain rejected', async () => {
  const { service, user } = fixture();
  await assert.rejects(service.create({ invoiceId: 1, reason: 'Return',
    details: [{ invoiceDetailId: 99, quantity: 1 }],
  }, user), /One or more invoice lines are invalid/);
});

 test('refund preview subtracts prior cash refunds from the amount paid', async () => {
  const { service, user } = fixture();
  const result = await service.refundableInvoice(1, user);
  assert.equal((result as any).refundablePaymentAmount, 15);
 });
 test('refund cannot pay out more than the remaining customer payment', async () => {
  const { service, user } = fixture();
  await assert.rejects(service.create({ invoiceId: 1, reason: 'Full return',
    details: [{ invoiceDetailId: 12, quantity: 3 }],
    payments: [{ paymentMethodId: 1, amount: 16 }],
  }, user), /remaining paid amount/);
 });

test('returning all remaining items marks the invoice fully refunded', async () => {
  const { service, invoice, user } = fixture();
  await service.create({ invoiceId: 1, reason: 'Full return',
    details: [{ invoiceDetailId: 12, quantity: 3, returnToStock: false }],
    payments: [{ paymentMethodId: 1, amount: 15 }],
  }, user);
  assert.equal(invoice.invoiceStatus, 'FULLY_REFUNDED');
});

test('returning only some remaining items keeps the invoice partially refunded', async () => {
  const { service, invoice, user } = fixture();
  await service.create({ invoiceId: 1, reason: 'Partial return',
    details: [{ invoiceDetailId: 12, quantity: 1, returnToStock: false }],
  }, user);
  assert.equal(invoice.invoiceStatus, 'PARTIALLY_REFUNDED');
  assert.equal(invoice.balanceAmount, '5.00');
});

test('an unpaid invoice can be fully returned without a cash payout', async () => {
  const { service, invoice, user } = fixture('0');
  const preview = await service.refundableInvoice(1, user);
  assert.equal(preview.refundablePaymentAmount, 0);
  await service.create({ invoiceId: 1, reason: 'Unpaid full return',
    details: [{ invoiceDetailId: 12, quantity: 3, returnToStock: false }],
  }, user);
  assert.equal(invoice.invoiceStatus, 'FULLY_REFUNDED');
  assert.equal(invoice.balanceAmount, '0.00');
});

test('cash refund payouts are reflected in the recalculated balance', async () => {
  const { service, invoice, user } = fixture();
  await service.create({ invoiceId: 1, reason: 'Partial return with payout',
    details: [{ invoiceDetailId: 12, quantity: 1, returnToStock: false }],
    payments: [{ paymentMethodId: 1, amount: 10 }],
  }, user);
  assert.equal(invoice.paidAmount, '20.00');
  assert.equal(invoice.balanceAmount, '15.00');
});

test('reversing a payment restores the accurate outstanding balance', async () => {
  const { service, invoice, user } = fixture();
  await service.reversePayment(1, 4, { reason: 'Wrong tender' }, user);
  assert.equal(invoice.paidAmount, '0.00');
  assert.equal(invoice.balanceAmount, '30.00');
  assert.equal(invoice.paymentStatus, 'UNPAID');
});

test('refund preview rejects an invoice outside the authenticated location scope', async () => {
  const invoice = { invoiceId: 1, tenantId: 1, locationId: 8, details: [], payments: [] };
  const repository = { findOne: async () => invoice };
  const service = new InvoiceRefundsService({ getRepository: () => repository, manager: {} } as any);
  const locationUser = { tenantId: 1, userId: 2, accessScope: 'LOCATION', assignedLocationIds: [3] } as any;
  await assert.rejects(service.refundableInvoice(1, locationUser), ForbiddenException);
});
