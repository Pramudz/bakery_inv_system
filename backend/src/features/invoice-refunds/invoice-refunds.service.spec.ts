import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Invoice } from '../invoices/invoice.entity';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceAdjustment } from './invoice-adjustment.entity';
import { InvoiceRefundsService } from './invoice-refunds.service';

function fixture(paidAmount = '20') {
  const invoice = { invoiceId: '1', invoiceStatus: 'PARTIALLY_REFUNDED', paidAmount, details: [{
    invoiceDetailId: '12', quantity: '5', grossTotal: '50', discountAmount: '0',
    product: { productName: 'Bread' },
  }] };
  const query: any = {};
  for (const method of ['innerJoin', 'select', 'addSelect', 'where', 'groupBy']) {
    query[method] = () => query;
  }
  query.getRawMany = async () => [{ invoiceDetailId: '12', quantity: '2' }];
  const manager = { getRepository: (entity: unknown) => entity === Invoice
    ? { findOne: async () => invoice, save: async (value: any) => value }
    : entity === InvoiceRefund ? { find: async () => [{ payments: [{ amount: '5' }] }], create: (value: any) => value, save: async (value: any) => ({ ...value, invoiceRefundId: 10 }), findOne: async () => ({ invoiceRefundId: 10 }) }
    : entity === InvoiceAdjustment ? { find: async () => [] }
    : { createQueryBuilder: () => query, create: (value: any) => value, save: async (value: any) => value, findOneBy: async () => ({}) } };
  const service = new InvoiceRefundsService({
    ...manager, manager, transaction: (run: any) => run(manager),
  } as any);
  return { service, invoice, user: { tenantId: 1, userId: 1 } as any };
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
});

test('an unpaid invoice can be fully returned without a cash payout', async () => {
  const { service, invoice, user } = fixture('0');
  const preview = await service.refundableInvoice(1, user);
  assert.equal(preview.refundablePaymentAmount, 0);
  await service.create({ invoiceId: 1, reason: 'Unpaid full return',
    details: [{ invoiceDetailId: 12, quantity: 3, returnToStock: false }],
  }, user);
  assert.equal(invoice.invoiceStatus, 'FULLY_REFUNDED');
});
