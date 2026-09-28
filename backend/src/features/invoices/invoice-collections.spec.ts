import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { InvoicesService } from './invoices.service';
import { Invoice } from './invoice.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { TenantPrincipal } from '../auth/auth.types';

const user = { tenantId: 1, userId: 2, accessScope: 'TENANT', assignedLocationIds: [] } as unknown as TenantPrincipal;
const request = { amount: 2000, paymentMethodId: 1, collectionKey: 'be49edbc-a597-4a38-8cde-5629c0fe2018' };

function fixture(overrides = {}) {
  let invoice: any = { invoiceId: 7, tenantId: 1, locationId: 3, invoiceNumber: 'INV-7', grandTotal: '5000.00', paidAmount: '2000.00', tenderedAmount: '2000.00', changeAmount: '0.00', balanceAmount: '3000.00', paymentStatus: 'PARTIALLY_PAID', invoiceStatus: 'COMPLETED', ...overrides };
  const payments: any[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
  const manager: any = { getRepository(entity: unknown) {
    if (entity === Invoice) return {
      findOne: async ({ where, lock }: any) => {
        if (lock) assert.equal(lock.mode, 'pessimistic_write');
        return matches(invoice, where) ? { ...invoice } : null;
      },
      save: async (row: any) => { invoice = { ...row }; return row; },
    };
    if (entity === InvoicePayment) return {
      findOneBy: async (where: any) => payments.find((row) => matches(row, where)) ?? null,
      create: (row: any) => row,
      save: async (row: any) => { const saved = { ...row, invoicePaymentId: payments.length + 1 }; payments.push(saved); return saved; },
    };
    if (entity === PaymentMethod) return { findOneBy: async (where: any) => where.paymentMethodId === 1 && where.tenantId === 1 && where.isActive ? { paymentMethodId: 1, paymentMethodName: 'Cash' } : null };
    throw new Error('Collection must not change stock or invoice lines.');
  } };
  const service = new InvoicesService({ transaction: (fn: any) => fn(manager) } as any, {} as any);
  const receive = (data = request, principal = user) => (service as any).receivePayment(7, data, principal);
  return { receive, payments, invoice: () => invoice };
}

test('later partial payment reduces balance and preserves invoice total', async () => {
  const f = fixture();
  const result = await f.receive();
  assert.equal(f.invoice().grandTotal, '5000.00');
  assert.equal(f.invoice().paidAmount, '4000.00');
  assert.equal(f.invoice().balanceAmount, '1000.00');
  assert.equal(f.invoice().paymentStatus, 'PARTIALLY_PAID');
  assert.equal(result.balanceBefore, '3000.00');
  assert.equal(result.balanceAfter, '1000.00');
  assert.equal(f.payments.length, 1);
});

test('settles an unpaid invoice in full', async () => {
  const f = fixture({ paidAmount: '0.00', tenderedAmount: '0.00', balanceAmount: '5000.00', paymentStatus: 'UNPAID' });
  await f.receive({ ...request, amount: 5000 });
  assert.equal(f.invoice().paidAmount, '5000.00');
  assert.equal(f.invoice().balanceAmount, '0.00');
  assert.equal(f.invoice().paymentStatus, 'PAID');
});

test('retries return the same receipt without collecting twice, including after full settlement', async () => {
  const f = fixture();
  const first = await f.receive({ ...request, amount: 3000 });
  const second = await f.receive({ ...request, amount: 3000 });
  assert.equal(first.invoicePaymentId, second.invoicePaymentId);
  assert.equal(f.payments.length, 1);
  assert.equal(f.invoice().paidAmount, '5000.00');
});

test('a retry key cannot be reused with a different amount', async () => {
  const f = fixture();
  await f.receive();
  await assert.rejects(f.receive({ ...request, amount: 1000 }), /different payment/i);
  assert.equal(f.payments.length, 1);
});

test('rejects overpayment and already settled invoices', async () => {
  for (const overrides of [{}, { balanceAmount: '0.00', paymentStatus: 'PAID' }]) {
    const f = fixture(overrides);
    await assert.rejects(f.receive({ ...request, amount: 3001 }), /balance|paid/i);
    assert.equal(f.payments.length, 0);
  }
});

test('rejects invalid monetary amounts before recording payment', async () => {
  for (const amount of [0, -1, NaN, Infinity, 0.001, 1.234]) {
    const f = fixture();
    await assert.rejects(f.receive({ ...request, amount }), /amount/i);
    assert.equal(f.payments.length, 0);
  }
});

test('rejects another tenant, unassigned location, and invalid payment method', async () => {
  await assert.rejects(fixture().receive(request, { ...user, tenantId: 9 }), /not found/i);
  await assert.rejects(fixture().receive(request, { ...user, accessScope: 'LOCATION', assignedLocationIds: [8] }), /access/i);
  await assert.rejects(fixture().receive({ ...request, paymentMethodId: 99 }), /method/i);
});

test('blocks collection against returned or cancelled invoices', async () => {
  for (const invoiceStatus of ['FULLY_REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED']) {
    const f = fixture({ invoiceStatus });
    await assert.rejects(f.receive(), /completed|refund/i);
    assert.equal(f.payments.length, 0);
  }
});
