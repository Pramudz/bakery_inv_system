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
import { PosCashMovement, PosCashMovementType } from '../pos-registers/pos-cash-movement.entity';

function fixture(paidAmount = '20') {
  const invoice = { invoiceId: '1', tenantId: 1, locationId: 3, invoiceStatus: 'PARTIALLY_REFUNDED', grandTotal: '50', paidAmount, tenderedAmount: paidAmount, changeAmount: '0', balanceAmount: '15', paymentStatus: Number(paidAmount) > 0 ? 'PARTIALLY_PAID' : 'UNPAID', details: [{
    invoiceDetailId: '12', quantity: '5', grossTotal: '50', discountAmount: '0',
    unitPrice: '10', discountPercentage: '0', productId: 8, product: { productName: 'Bread', isStockItem: false },
  }] };
  const refunds: any[] = [{ invoiceRefundId: 9, invoiceId: '1', tenantId: 1, status: 'COMPLETED', refundTotal: '20', payments: [{ amount: '5' }] }];
  const activePayments: any[] = Number(paidAmount) > 0 ? [{ invoicePaymentId: 4, invoiceId: '1', paymentMethodId: 1, paymentMethodTypeSnapshot: PaymentMethodType.CASH, paymentMethod: { paymentMethodType: PaymentMethodType.CASH }, amount: paidAmount, tenderedAmount: paidAmount, changeAmount: '0', isReversed: false, collectionKey: null }] : [];
  const cashMovements: any[] = [];
  const query: any = {};
  for (const method of ['innerJoin', 'select', 'addSelect', 'where', 'groupBy']) {
    query[method] = () => query;
  }
  query.getRawMany = async () => [{ invoiceDetailId: '12', quantity: '2' }];
  const manager = { getRepository: (entity: unknown) => entity === Invoice
    ? { findOne: async () => invoice, save: async (value: any) => Object.assign(invoice, value) }
    : entity === InvoiceRefund ? {
      find: async () => refunds,
      findOneBy: async ({ refundKey }: any) => refunds.find((row) => row.refundKey === refundKey) ?? null,
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
    : entity === InvoicePaymentReversal ? { findOne: async () => null, create: (value: any) => value, save: async (value: any) => ({ paymentReversalId: 50, ...value }) }
    : entity === PosCashMovement ? { create: (value: any) => value, save: async (value: any) => { const saved = { posCashMovementId: cashMovements.length + 1, ...value }; cashMovements.push(saved); return saved; } }
    : entity === InvoiceRefundPayment ? { create: (value: any) => value, save: async (value: any) => { refunds.find((row) => row.invoiceRefundId === value.invoiceRefundId)?.payments.push(value); return value; } }
    : entity === InvoiceRefundDetail ? { createQueryBuilder: () => query, create: (value: any) => value, save: async (value: any) => value }
    : entity === PaymentMethod ? { findOneBy: async () => ({ paymentMethodId: 1, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH }) }
    : { create: (value: any) => value, save: async (value: any) => value, findOneBy: async () => null } };
  const service = new InvoiceRefundsService({
    ...manager, manager, transaction: (run: any) => run(manager),
  } as any, { requireCashierSession: async () => ({ terminal: { posTerminalId: 21 }, registerSession: { posRegisterSessionId: 22 }, cashierSession: { posCashierSessionId: 23 } }) } as any);
  return { service, invoice, activePayments, cashMovements, refunds, user: { tenantId: 1, userId: 1, accessScope: 'TENANT', assignedLocationIds: [] } as any };
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
  const { service, invoice, cashMovements, refunds, user } = fixture();
  const refundKey = '11111111-1111-4111-8111-111111111111';
  await service.create({ refundKey, invoiceId: 1, reason: 'Partial return with payout',
    details: [{ invoiceDetailId: 12, quantity: 1, returnToStock: false }],
    payments: [{ paymentMethodId: 1, amount: 10 }],
  }, user);
  assert.equal(invoice.paidAmount, '20.00');
  assert.equal(invoice.balanceAmount, '15.00');
  assert.equal(cashMovements.length, 1);
  assert.equal(cashMovements[0].movementType, PosCashMovementType.REFUND_PAYOUT);
  assert.equal(cashMovements[0].amount, '10.00');
  assert.equal(cashMovements[0].posRegisterSessionId, 22);
  await service.create({ refundKey, invoiceId: 1, reason: 'Partial return with payout', details: [{ invoiceDetailId: 12, quantity: 1, returnToStock: false }], payments: [{ paymentMethodId: 1, amount: 10 }] }, user);
  assert.equal(cashMovements.length, 1, 'retry does not post a second payout');
  assert.equal(refunds.filter((row) => row.refundKey === refundKey).length, 1);
  await assert.rejects(service.create({ refundKey, invoiceId: 1, reason: 'Changed retry', details: [{ invoiceDetailId: 12, quantity: 1, returnToStock: false }], payments: [{ paymentMethodId: 1, amount: 10 }] }, user), /different refund data/i);
});

test('reversing a payment restores the accurate outstanding balance', async () => {
  const { service, invoice, cashMovements, user } = fixture();
  await service.reversePayment(1, 4, { reason: 'Wrong tender' }, user);
  assert.equal(invoice.paidAmount, '0.00');
  assert.equal(invoice.balanceAmount, '30.00');
  assert.equal(invoice.paymentStatus, 'UNPAID');
  assert.equal(cashMovements.length, 0, 'accounting reversal alone is not a physical payout');
});

test('cash payment reversal records a payout only when explicitly requested', async () => {
  const { service, cashMovements, user } = fixture();
  await service.reversePayment(1, 4, { reversalKey: '22222222-2222-4222-8222-222222222222', reason: 'Returned cash', cashPayout: true }, user);
  assert.equal(cashMovements.length, 1);
  assert.equal(cashMovements[0].movementType, PosCashMovementType.PAYMENT_REVERSAL_PAYOUT);
  assert.equal(cashMovements[0].amount, '20.00');
  assert.equal(cashMovements[0].posCashierSessionId, 23);
});

test('a replacement payment requires and records the receiving cashier session', async () => {
  const { service, activePayments, user } = fixture();
  await service.reversePayment(1, 4, { reason: 'Wrong tender', replacementPaymentMethodId: 1, replacementAmount: 20 }, user);
  const replacement = activePayments.at(-1);
  assert.equal(replacement.posTerminalId, 21);
  assert.equal(replacement.posRegisterSessionId, 22);
  assert.equal(replacement.posCashierSessionId, 23);

  const denied = fixture();
  (denied.service as any).posSessions = { requireCashierSession: async () => { throw new ForbiddenException('Active cashier session required.'); } };
  await assert.rejects(denied.service.reversePayment(1, 4, { reason: 'Wrong tender', replacementPaymentMethodId: 1, replacementAmount: 20 }, denied.user), /cashier session/i);
  assert.equal(denied.activePayments[0].isReversed, false);
});

test('refund preview rejects an invoice outside the authenticated location scope', async () => {
  const invoice = { invoiceId: 1, tenantId: 1, locationId: 8, details: [], payments: [] };
  const repository = { findOne: async () => invoice };
  const service = new InvoiceRefundsService({ getRepository: () => repository, manager: {} } as any, {} as any);
  const locationUser = { tenantId: 1, userId: 2, accessScope: 'LOCATION', assignedLocationIds: [3] } as any;
  await assert.rejects(service.refundableInvoice(1, locationUser), ForbiddenException);
});
