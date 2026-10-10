import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { InvoicesService } from './invoices.service';
import { Invoice } from './invoice.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { TenantPrincipal } from '../auth/auth.types';
import { Customer } from '../customers/customers.entity';
import { PaymentChannel } from '../payment-channels/payment-channel.entity';
import { ReceiveInvoicePaymentDto } from './dto/receive-invoice-payment.dto';
import { InvoicesController } from './invoices.controller';
import { REQUIRE_PERMISSION } from '../auth/require-permission.decorator';

const user = { tenantId: 1, userId: 2, accessScope: 'TENANT', assignedLocationIds: [] } as unknown as TenantPrincipal;
const request: ReceiveInvoicePaymentDto = { amount: 2000, paymentMethodId: 1, collectionKey: 'be49edbc-a597-4a38-8cde-5629c0fe2018' };
const activePosSession: any = { terminal: { posTerminalId: 21 }, registerSession: { posRegisterSessionId: 22 }, cashierSession: { posCashierSessionId: 23 } };

function fixture(overrides = {}, serializeTransactions = false) {
  let invoice: any = { invoiceId: 7, tenantId: 1, locationId: 3, customerId: 11, invoiceNumber: 'INV-7', grandTotal: '5000.00', paidAmount: '2000.00', tenderedAmount: '2000.00', changeAmount: '0.00', balanceAmount: '3000.00', paymentStatus: 'PARTIALLY_PAID', invoiceStatus: 'COMPLETED', ...overrides };
  const payments: any[] = [];
  let sessionOpen = true;
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
  const manager: any = { getRepository(entity: unknown) {
    if (entity === Invoice) return {
      findOneBy: async (where: any) => matches(invoice, where) ? { ...invoice } : null,
      findOne: async ({ where, lock }: any) => {
        if (lock) assert.equal(lock.mode, 'pessimistic_write');
        return matches(invoice, where) ? { ...invoice } : null;
      },
      save: async (row: any) => { invoice = { ...row }; return row; },
    };
    if (entity === InvoicePayment) return {
      findOneBy: async (where: any) => payments.find((row) => matches(row, where)) ?? null,
      findOne: async ({ where }: any) => payments.find((row) => row.collectionKey === where.collectionKey && (where.invoiceId === undefined || Number(row.invoiceId) === Number(where.invoiceId))) ?? null,
      create: (row: any) => row,
      save: async (row: any) => { const saved = { ...row, invoicePaymentId: payments.length + 1 }; payments.push(saved); return saved; },
    };
    if (entity === Customer) return { findOneBy: async (where: any) => Number(where.customerId) === 11 && Number(where.tenantId) === 1 ? { customerId: 11, tenantId: 1 } : null };
    if (entity === PaymentMethod) return { findOneBy: async (where: any) => {
      if (where.tenantId !== 1 || !where.isActive) return null;
      return ({
        1: { paymentMethodId: 1, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH },
        2: { paymentMethodId: 2, paymentMethodName: 'Card', paymentMethodType: PaymentMethodType.CARD },
        3: { paymentMethodId: 3, paymentMethodName: 'Cheque', paymentMethodType: PaymentMethodType.CHEQUE },
      } as Record<number, any>)[where.paymentMethodId] ?? null;
    } };
    if (entity === PaymentChannel) return { findOneBy: async (where: any) => Number(where.paymentChannelId) === 6 && Number(where.tenantId) === 1 && where.isActive ? { paymentChannelId: 6, tenantId: 1, code: 'BANK', name: 'Bank' } : null };
    throw new Error('Collection must not change stock or invoice lines.');
  } };
  let transactionQueue = Promise.resolve();
  const transaction = (fn: any) => {
    if (!serializeTransactions) return fn(manager);
    const result = transactionQueue.then(() => fn(manager));
    transactionQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const service = new InvoicesService({ transaction, getRepository: manager.getRepository } as any, {} as any, { requireCashierSession: async () => { if (!sessionOpen) throw new Error('Cashier session closed'); return activePosSession; } } as any);
  const receive = (data = request, principal = user) => (service as any).receivePayment(7, data, principal);
  return { receive, payments, invoice: () => invoice, service, closeSession: () => { sessionOpen = false; } };
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
  assert.equal(result.posTerminalId, 21);
  assert.equal(result.posRegisterSessionId, 22);
  assert.equal(result.posCashierSessionId, 23);
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

test('committed collection is recoverable after cashier session closure without reposting', async () => {
  const f = fixture();
  const first = await f.receive();
  f.closeSession();
  const outcome = await f.service.collectionOutcome(7, request.collectionKey, user);
  const retry = await f.receive();
  assert.equal(outcome.invoicePaymentId, first.invoicePaymentId);
  assert.equal(retry.invoicePaymentId, first.invoicePaymentId);
  assert.equal(f.payments.length, 1);
  await assert.rejects(f.receive({ ...request, collectionKey: '9c6fe6a0-9c0d-4c02-a019-a72421180734' }), /session closed/i);
});

test('collection outcome lookup enforces tenant and location scope', async () => {
  const f = fixture();
  await f.receive();
  await assert.rejects(f.service.collectionOutcome(7, request.collectionKey, { ...user, tenantId: 2 }), /not found/i);
  await assert.rejects(f.service.collectionOutcome(7, request.collectionKey, { ...user, accessScope: 'LOCATION', assignedLocationIds: [] }), /access/i);
  await assert.rejects(f.service.collectionOutcome(7, 'd7ae42ae-8198-48de-ad33-95f12fe646b9', user), /not found/i);
});

test('collection outcome endpoint requires collection permission', () => {
  assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, InvoicesController.prototype.collectionOutcome), 'SALES_PAYMENT_COLLECT');
});

test('collection key binds method, channel, reference, amount and user', async () => {
  const f = fixture();
  await f.receive();
  for (const changed of [
    { ...request, amount: 1999 }, { ...request, paymentMethodId: 3 },
    { ...request, paymentChannelId: 6 }, { ...request, referenceNumber: 'OTHER' },
  ]) await assert.rejects(f.receive(changed), /different payment data/i);
  await assert.rejects(f.receive(request, { ...user, userId: 9 }), /different payment data/i);
  assert.equal(f.payments.length, 1);
});

test('cash may be over-tendered with change, but an already settled invoice rejects collection', async () => {
  const open = fixture();
  const payment = await open.receive({ ...request, amount: 3001 });
  assert.equal(payment.amount, '3000.00');
  assert.equal(payment.tenderedAmount, '3001.00');
  assert.equal(payment.changeAmount, '1.00');
  const settled = fixture({ balanceAmount: '0.00', paymentStatus: 'PAID' });
  await assert.rejects(settled.receive({ ...request, amount: 1 }), /balance/i);
  assert.equal(settled.payments.length, 0);
});

test('later split cash, card and cheque collections reduce one receivable without changing the sale total', async () => {
  const f = fixture({ paidAmount: '0.00', tenderedAmount: '0.00', balanceAmount: '5000.00', paymentStatus: 'UNPAID' });
  await f.receive({ ...request, amount: 1000 });
  await f.receive({ ...request, paymentMethodId: 2, paymentChannelId: 6, referenceNumber: 'CARD-1', amount: 1500, collectionKey: 'c59fa253-a078-4225-ae35-ce9900b70fc7' });
  await f.receive({ ...request, paymentMethodId: 3, referenceNumber: 'CHQ-1', amount: 2500, collectionKey: '1ac51c81-e152-43a6-b1e7-049e35c3766e' });
  assert.equal(f.invoice().grandTotal, '5000.00');
  assert.equal(f.invoice().paidAmount, '5000.00');
  assert.equal(f.invoice().balanceAmount, '0.00');
  assert.equal(f.payments.length, 3);
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
  for (const invoiceStatus of ['FULLY_REFUNDED', 'CANCELLED']) {
    const f = fixture({ invoiceStatus });
    await assert.rejects(f.receive(), /cannot receive/i);
    assert.equal(f.payments.length, 0);
  }
});

test('allows collection after a partial refund and keeps historical anonymous debt read-only', async () => {
  const refunded = fixture({ invoiceStatus: 'PARTIALLY_REFUNDED' });
  await refunded.receive();
  assert.equal(refunded.invoice().balanceAmount, '1000.00');
  const anonymous = fixture({ customerId: null });
  await assert.rejects(anonymous.receive(), /customer-owned|anonymous/i);
  assert.equal(anonymous.payments.length, 0);
});

test('concurrent non-cash collections serialize on the invoice and cannot overpay it', async () => {
  const f = fixture({}, true);
  const results = await Promise.allSettled([
    f.receive({ ...request, paymentMethodId: 3, amount: 2000, collectionKey: '12c5d7f0-c29c-4ac9-9d43-72d9c6838404' }),
    f.receive({ ...request, paymentMethodId: 3, amount: 2000, collectionKey: '3c2b32ba-27c2-4335-bc4f-36276f965792' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.match(String((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason), /cannot exceed/i);
  assert.equal(f.invoice().paidAmount, '4000.00');
  assert.equal(f.invoice().balanceAmount, '1000.00');
  assert.equal(f.payments.length, 1);
});
