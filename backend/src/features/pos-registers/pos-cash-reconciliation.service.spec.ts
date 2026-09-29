import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvoiceRefund } from '../invoice-refunds/invoice-refund.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Invoice } from '../invoices/invoice.entity';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PosCashMovement, PosCashMovementDirection, PosCashMovementType } from './pos-cash-movement.entity';
import { PosCashReconciliation, PosCashReconciliationStatus } from './pos-cash-reconciliation.entity';
import { PosCashReconciliationService } from './pos-cash-reconciliation.service';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosRegisterMode } from './pos-location-config.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';

const cashier = { tenantId: 1, userId: 10, username: 'cashier', accessScope: 'TENANT', assignedLocationIds: [] } as any;
const verifier = { tenantId: 1, userId: 99, username: 'manager', accessScope: 'TENANT', assignedLocationIds: [] } as any;

function fixture(serializeTransactions = false) {
  const register: any = { posCashRegisterId: 1, tenantId: 1, locationId: 11, posTerminalId: 21, registerMode: PosRegisterMode.TERMINAL_REGISTER, displayName: 'Front register', isActive: true };
  const registerSession: any = { posRegisterSessionId: 2, posCashRegisterId: 1, tenantId: 1, locationId: 11, businessDate: '2026-09-29', openingBalance: '100.00', openedByUserId: 10, openedAt: new Date(), status: PosRegisterSessionStatus.OPEN, closedAt: null, closedByUserId: null, register };
  const cashierSession: any = { posCashierSessionId: 3, posRegisterSessionId: 2, tenantId: 1, locationId: 11, cashierUserId: 10, posTerminalId: 21, startedAt: new Date(), endedAt: null, endedByUserId: null, status: PosCashierSessionStatus.ACTIVE, cashier: { userId: 10, username: 'cashier', firstName: 'Casey', lastName: null }, terminal: { terminalCode: 'POS-01', displayName: 'Front' }, registerSession };
  const payments: any[] = [
    { invoicePaymentId: 1, posRegisterSessionId: 2, posCashierSessionId: 3, paymentMethodTypeSnapshot: PaymentMethodType.CASH, amount: '100', tenderedAmount: '150', changeAmount: '50', collectionKey: null, isReversed: false },
    { invoicePaymentId: 2, posRegisterSessionId: 2, posCashierSessionId: 3, paymentMethodTypeSnapshot: PaymentMethodType.CARD, amount: '40', tenderedAmount: '40', changeAmount: '0', collectionKey: null, isReversed: false, paymentChannelNameSnapshot: 'Bank A' },
    { invoicePaymentId: 3, posRegisterSessionId: 2, posCashierSessionId: 3, paymentMethodTypeSnapshot: PaymentMethodType.CASH, amount: '30', tenderedAmount: '30', changeAmount: '0', collectionKey: 'collection', isReversed: false },
  ];
  const movements: any[] = [{ posCashMovementId: 1, posRegisterSessionId: 2, posCashierSessionId: 3, direction: PosCashMovementDirection.OUT, movementType: PosCashMovementType.REFUND_PAYOUT, amount: '20', sourceType: 'INVOICE_REFUND_PAYMENT', sourceId: 8, reason: 'Return', occurredAt: new Date() }];
  const refunds: any[] = [{ posRegisterSessionId: 2, posCashierSessionId: 3, refundTotal: '20', payments: [{ amount: '20' }] }];
  const invoices: any[] = [{ posRegisterSessionId: 2, posCashierSessionId: 3, isCreditSale: true, grandTotal: '200', balanceAmount: '70', payments: [{ collectionKey: null, isReversed: false, amount: '100' }] }];
  const reconciliations: any[] = [];
  const hydrate = (row: any) => Object.assign(row, { location: { locationId: 11, code: 'MAIN', name: 'Main' }, cashierSession, registerSession });
  const repo = (entity: unknown): any => {
    if (entity === InvoicePayment) return { find: async () => payments };
    if (entity === PosCashMovement) return { find: async () => movements };
    if (entity === InvoiceRefund) return { find: async () => refunds };
    if (entity === Invoice) return { find: async () => invoices };
    if (entity === PosRegisterSession) return { findOne: async ({ where }: any) => Number(where.posRegisterSessionId) === 2 && registerSession.status === where.status ? registerSession : null, save: async (row: any) => Object.assign(registerSession, row) };
    if (entity === PosCashierSession) return { findOne: async ({ where }: any) => Number(where.posCashierSessionId) === 3 && cashierSession.status === where.status ? cashierSession : null, save: async (row: any) => Object.assign(cashierSession, row) };
    if (entity === PosCashRegister) return { findOne: async () => register };
    if (entity === PosCashReconciliation) return {
      findOneBy: async (where: any) => reconciliations.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      findOne: async ({ where }: any) => {
        const row = reconciliations.find((candidate) => Object.entries(where).every(([key, value]) => candidate[key] === value));
        return row ? hydrate(row) : null;
      },
      findOneOrFail: async ({ where }: any) => hydrate(reconciliations.find((row) => row.posCashReconciliationId === where.posCashReconciliationId)),
      find: async ({ where }: any) => reconciliations.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value)).sort((a, b) => b.attemptNumber - a.attemptNumber).slice(0, 1),
      create: (row: any) => row,
      save: async (row: any) => {
        if (!row.posCashReconciliationId) { row.posCashReconciliationId = reconciliations.length + 1; reconciliations.push(row); }
        return hydrate(row);
      },
    };
    throw new Error(`Unexpected repository ${(entity as any)?.name}`);
  };
  const manager: any = { getRepository: repo };
  const active = { terminal: { posTerminalId: 21 }, pairing: {}, config: { registerMode: PosRegisterMode.TERMINAL_REGISTER }, register, registerSession, cashierSession };
  const posSessions: any = { requireTerminalClosingSession: async () => active };
  let transactionQueue = Promise.resolve();
  const transaction = async (work: any) => {
    if (!serializeTransactions) return work(manager);
    const result = transactionQueue.then(() => work(manager));
    transactionQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const dataSource: any = { manager, getRepository: repo, transaction };
  return { service: new PosCashReconciliationService(dataSource, posSessions), registerSession, cashierSession, reconciliations, payments, movements };
}

test('cash summary separates sale, collection, tender, change and noncash totals', async () => {
  const f = fixture();
  const result = await f.service.summary((f.service as any).dataSource.manager, f.registerSession, f.cashierSession);
  assert.deepEqual(result.cash.sales, { tendered: 150, applied: 100, change: 50, net: 100 });
  assert.deepEqual(result.cash.collections, { tendered: 30, applied: 30, change: 0, net: 30 });
  assert.equal(result.cardsByChannel[0].amount, 40);
  assert.equal(result.creditSales.originalCreditExtended, 100);
  assert.equal(result.creditSales.outstanding, 70);
  assert.equal(result.cash.paidOut, 20);
  assert.equal(result.expectedCash, 210, '100 opening + 130 net cash received - 20 explicit payout');
  f.payments[0].isReversed = true;
  const afterAccountingReversal = await f.service.summary((f.service as any).dataSource.manager, f.registerSession, f.cashierSession);
  assert.equal(afterAccountingReversal.expectedCash, 210, 'an accounting reversal alone does not remove physical cash');
});

test('a zero-cash shift reports exactly the opening balance without inventing card cash', async () => {
  const f = fixture();
  f.registerSession.openingBalance = '0.00';
  f.payments.splice(0, f.payments.length, { invoicePaymentId: 8, posRegisterSessionId: 2, posCashierSessionId: 3, paymentMethodTypeSnapshot: PaymentMethodType.CARD, amount: '75', tenderedAmount: '75', changeAmount: '0', collectionKey: null, isReversed: false, paymentChannelNameSnapshot: 'Bank A' });
  f.movements.length = 0;
  const result = await f.service.summary((f.service as any).dataSource.manager, f.registerSession, f.cashierSession);
  assert.equal(result.cash.received.net, 0);
  assert.equal(result.expectedCash, 0);
  assert.equal(result.cardsByChannel[0].amount, 75);
});

test('count submission snapshots a variance, blocks the session, and independent approval closes it', async () => {
  const f = fixture();
  const submitted = await f.service.submit({ submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 205 }, 'credential', cashier);
  assert.equal(submitted.cashierVariance, -5);
  assert.equal(f.cashierSession.status, PosCashierSessionStatus.PENDING_VERIFICATION);
  assert.equal(f.registerSession.status, PosRegisterSessionStatus.PENDING_VERIFICATION);
  await assert.rejects(f.service.verify(1, { verificationKey: '22222222-2222-4222-8222-222222222222', decision: 'APPROVE', verifiedCountedCash: 205 }, cashier), ForbiddenException);
  const closed = await f.service.verify(1, { verificationKey: '33333333-3333-4333-8333-333333333333', decision: 'APPROVE', verifiedCountedCash: 204 }, verifier);
  assert.equal(closed.verifiedVariance, -6);
  assert.equal(f.cashierSession.status, PosCashierSessionStatus.ENDED);
  assert.equal(f.registerSession.status, PosRegisterSessionStatus.CLOSED);
  assert.equal(f.registerSession.openingBalance, '100.00', 'variance never rewrites opening cash');
});

test('rejection retains the first count and permits a separately audited recount', async () => {
  const f = fixture();
  await f.service.submit({ submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 205 }, 'credential', cashier);
  await f.service.verify(1, { verificationKey: '22222222-2222-4222-8222-222222222222', decision: 'REJECT', verifiedCountedCash: 200, rejectionReason: 'Please recount each denomination.' }, verifier);
  assert.equal(f.reconciliations[0].status, PosCashReconciliationStatus.REJECTED);
  assert.equal(f.cashierSession.status, PosCashierSessionStatus.RECOUNT_REQUIRED);
  const recount = await f.service.submit({ submissionKey: '33333333-3333-4333-8333-333333333333', countedCash: 210 }, 'credential', cashier);
  assert.equal(recount.attemptNumber, 2);
  assert.equal(f.reconciliations.length, 2);
  assert.equal(f.reconciliations[0].countedCash, '205.00');
});

test('reconciliation detail enforces tenant and assigned-location isolation', async () => {
  const f = fixture();
  await f.service.submit({ submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 210 }, 'credential', cashier);
  await assert.rejects(f.service.get(1, { ...verifier, tenantId: 2 }), NotFoundException);
  await assert.rejects(f.service.get(1, { ...verifier, accessScope: 'LOCATION', assignedLocationIds: [12] }), ForbiddenException);
});

test('a concurrent checkout queued behind sign-off observes the pending state and is rejected', async () => {
  const f = fixture(true);
  const dataSource = (f.service as any).dataSource;
  const signOff = f.service.submit({ submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 210 }, 'credential', cashier);
  const checkout = dataSource.transaction(async () => {
    if (f.cashierSession.status !== PosCashierSessionStatus.ACTIVE || f.registerSession.status !== PosRegisterSessionStatus.OPEN) throw new ForbiddenException('Active cashier session required.');
    return 'accepted';
  });
  const [signOffResult, checkoutResult] = await Promise.allSettled([signOff, checkout]);
  assert.equal(signOffResult.status, 'fulfilled');
  assert.equal(checkoutResult.status, 'rejected');
});
