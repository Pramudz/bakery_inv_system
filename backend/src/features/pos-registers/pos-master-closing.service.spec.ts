import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PosCashMovement, PosCashMovementDirection, PosCashFundingSource, PosCashMovementType } from './pos-cash-movement.entity';
import { PosCashReconciliationPayment, PosReconciliationCoverageStatus } from './pos-cash-reconciliation-payment.entity';
import { PosCashReconciliation, PosCashReconciliationStatus, PosCashReconciliationType } from './pos-cash-reconciliation.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosRegisterMode } from './pos-location-config.entity';
import { PosMasterClosingService } from './pos-master-closing.service';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';

const submitter = { tenantId: 1, userId: 90, username: 'closer', accessScope: 'TENANT', assignedLocationIds: [] } as any;
const verifier = { tenantId: 1, userId: 99, username: 'verifier', accessScope: 'TENANT', assignedLocationIds: [] } as any;

function fixture(serialize = false) {
  const register = { posCashRegisterId: 1, registerMode: PosRegisterMode.MASTER_REGISTER, displayName: 'Master', isActive: true };
  const registerSession: any = { posRegisterSessionId: 10, posCashRegisterId: 1, tenantId: 1, locationId: 3, businessDate: '2026-09-30', openingBalance: '100.00', status: PosRegisterSessionStatus.OPEN, closedAt: null, closedByUserId: null, register };
  const cashierSessions: any[] = [
    { posCashierSessionId: 21, tenantId: 1, posRegisterSessionId: 10, status: PosCashierSessionStatus.ENDED },
    { posCashierSessionId: 22, tenantId: 1, posRegisterSessionId: 10, status: PosCashierSessionStatus.ENDED },
  ];
  const payments: any[] = [
    { invoicePaymentId: 31, posRegisterSessionId: 10, posCashierSessionId: 21, paymentMethodTypeSnapshot: PaymentMethodType.CASH, amount: '800', tenderedAmount: '1000', changeAmount: '200' },
    { invoicePaymentId: 32, posRegisterSessionId: 10, posCashierSessionId: 22, paymentMethodTypeSnapshot: PaymentMethodType.CASH, amount: '500', tenderedAmount: '500', changeAmount: '0' },
  ];
  const movements: any[] = [
    { posCashMovementId: 41, tenantId: 1, posRegisterSessionId: 10, posCashierSessionId: 21, fundingSource: PosCashFundingSource.CASHIER_SESSION, movementType: PosCashMovementType.REFUND_PAYOUT, direction: PosCashMovementDirection.OUT, amount: '50', sourceType: 'INVOICE_REFUND_PAYMENT', sourceId: 1, reason: 'Cashier refund', physicalPayerIdentity: null, occurredAt: new Date() },
    { posCashMovementId: 42, tenantId: 1, posRegisterSessionId: 10, posCashierSessionId: null, fundingSource: PosCashFundingSource.MASTER_REGISTER, movementType: PosCashMovementType.PAYMENT_REVERSAL_PAYOUT, direction: PosCashMovementDirection.OUT, amount: '100', sourceType: 'INVOICE_PAYMENT_REVERSAL', sourceId: 2, reason: 'Master payout', physicalPayerIdentity: 'Master A', occurredAt: new Date() },
  ];
  const batches: any[] = [
    { posCashReconciliationId: 51, tenantId: 1, posRegisterSessionId: 10, posCashierSessionId: 21, attemptNumber: 1, reconciliationType: PosCashReconciliationType.MASTER_CASH_BATCH, status: PosCashReconciliationStatus.APPROVED, expectedCash: '750', confirmedNetCash: '730', confirmationVariance: '-20', physicalRecipientIdentity: 'Master A', verifiedAt: new Date(), summarySnapshot: { cash: { movements: [{ id: 41 }] } } },
    { posCashReconciliationId: 52, tenantId: 1, posRegisterSessionId: 10, posCashierSessionId: 22, attemptNumber: 1, reconciliationType: PosCashReconciliationType.MASTER_CASH_BATCH, status: PosCashReconciliationStatus.APPROVED, expectedCash: '500', confirmedNetCash: '500', confirmationVariance: '0', physicalRecipientIdentity: 'Master A', verifiedAt: new Date(), summarySnapshot: { cash: { movements: [] } } },
  ];
  const coverage: any[] = [
    { tenantId: 1, posRegisterSessionId: 10, invoicePaymentId: 31, coverageStatus: PosReconciliationCoverageStatus.ACTIVE, reconciliation: batches[0] },
    { tenantId: 1, posRegisterSessionId: 10, invoicePaymentId: 32, coverageStatus: PosReconciliationCoverageStatus.ACTIVE, reconciliation: batches[1] },
  ];
  const masterRows: any[] = [];
  const hydrate = (row: any) => Object.assign(row, { location: { locationId: 3, code: 'MAIN', name: 'Main' }, registerSession, submittedByUser: { username: 'closer' }, verifiedByUser: row.verifiedByUserId ? { username: 'verifier' } : null });
  const repo = (entity: unknown): any => {
    if (entity === PosCashierSession) return { find: async () => cashierSessions };
    if (entity === InvoicePayment) return { find: async () => payments };
    if (entity === PosCashMovement) return { find: async () => movements };
    if (entity === PosCashReconciliation) return { find: async () => batches };
    if (entity === PosCashReconciliationPayment) return { find: async () => coverage };
    if (entity === PosRegisterSession) return {
      findOne: async ({ where }: any) => Number(where.posRegisterSessionId ?? 10) === 10 && (where.status?._type === 'in' ? where.status._value.includes(registerSession.status) : where.status === undefined || registerSession.status === where.status) ? registerSession : null,
      save: async (row: any) => Object.assign(registerSession, row),
    };
    if (entity === PosMasterReconciliation) return {
      findOneBy: async (where: any) => masterRows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
      findOne: async ({ where }: any) => { const row = masterRows.find((candidate) => Object.entries(where).every(([key, value]) => candidate[key] === value)); return row ? hydrate(row) : null; },
      findOneOrFail: async ({ where }: any) => hydrate(masterRows.find((row) => row.posMasterReconciliationId === where.posMasterReconciliationId)),
      find: async () => [...masterRows].sort((a, b) => b.attemptNumber - a.attemptNumber).slice(0, 1),
      create: (row: any) => row,
      save: async (row: any) => { if (!row.posMasterReconciliationId) { row.posMasterReconciliationId = masterRows.length + 1; masterRows.push(row); } return hydrate(row); },
    };
    throw new Error(`Unexpected repository ${(entity as any)?.name}`);
  };
  const manager: any = { getRepository: repo };
  let queue = Promise.resolve();
  const transaction = (isolationOrWork: any, optionalWork?: any) => {
    const work = optionalWork ?? isolationOrWork;
    if (!serialize) return work(manager);
    const result = queue.then(() => work(manager)); queue = result.then(() => undefined, () => undefined); return result;
  };
  const dataSource: any = { manager, getRepository: repo, transaction };
  return { service: new PosMasterClosingService(dataSource), manager, registerSession, cashierSessions, payments, movements, batches, coverage, masterRows };
}

test('master summary keeps system expected, confirmed basis and batch shortage distinct', async () => {
  const f = fixture();
  const summary = await f.service.buildSummary(f.manager, f.registerSession);
  assert.deepEqual(summary.cashReceipts, { tendered: 1500, applied: 1300, change: 200, net: 1300 });
  assert.equal(summary.systemExpectedMasterCash, 1250, '100 opening + 1300 net receipts - 50 cashier payout - 100 direct master payout');
  assert.equal(summary.confirmedBatchCashBasis, 1230, '100 opening + 730 + 500 confirmed batches - 100 direct master payout');
  assert.equal(summary.batchConfirmationDifference, -20);
  assert.equal(summary.systemVsConfirmedBasis, -20);
  assert.deepEqual(summary.blockers, []);
});

test('master count snapshots an additional shortage and independent approval closes only the master session', async () => {
  const f = fixture();
  const submitted = await f.service.submit({ locationId: 3, posRegisterSessionId: 10, submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 1200, masterCashierIdentity: 'Master A' }, submitter);
  assert.equal(submitted.countVsConfirmedBasis, -30);
  assert.equal(submitted.countVsSystemExpected, -50);
  assert.equal(f.registerSession.status, PosRegisterSessionStatus.PENDING_VERIFICATION);
  await assert.rejects(f.service.verify(1, { verificationKey: '22222222-2222-4222-8222-222222222222', decision: 'APPROVE', verifiedCountedCash: 1200 }, submitter), ForbiddenException);
  const approved = await f.service.verify(1, { verificationKey: '33333333-3333-4333-8333-333333333333', decision: 'APPROVE', verifiedCountedCash: 1195 }, verifier);
  assert.equal(approved.verifiedVsSystemExpected, -55);
  assert.equal(approved.verifiedVsConfirmedBasis, -35);
  assert.equal(f.registerSession.status, PosRegisterSessionStatus.CLOSED);
  assert.equal(f.registerSession.openingBalance, '100.00');
});

test('unresolved batches and uncovered receipts return specific closing blockers', async () => {
  const f = fixture();
  f.cashierSessions[1].status = PosCashierSessionStatus.PENDING_VERIFICATION;
  f.batches[1].status = PosCashReconciliationStatus.PENDING_VERIFICATION;
  f.coverage.pop();
  const summary = await f.service.buildSummary(f.manager, f.registerSession);
  assert.deepEqual(summary.blockers.map((blocker) => blocker.code), ['CASHIER_SESSIONS_NOT_ENDED', 'BATCHES_NOT_APPROVED', 'UNCOVERED_RECEIPTS']);
  await assert.rejects(
    f.service.submit(
      {
        locationId: 3,
        posRegisterSessionId: 10,
        submissionKey: '11111111-1111-4111-8111-111111111111',
        countedCash: 1000,
        masterCashierIdentity: 'Master A',
      },
      submitter,
    ),
    (error: any) =>
      error instanceof ConflictException && (error.getResponse() as any).blockers.length === 3,
  );
});

test('rejected master count permits an audited recount while transactions remain frozen', async () => {
  const f = fixture();
  await f.service.submit({ locationId: 3, posRegisterSessionId: 10, submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 1200, masterCashierIdentity: 'Master A' }, submitter);
  await f.service.verify(1, { verificationKey: '22222222-2222-4222-8222-222222222222', decision: 'REJECT', verifiedCountedCash: 1190, rejectionReason: 'Count denominations again.' }, verifier);
  assert.equal(f.registerSession.status, PosRegisterSessionStatus.RECOUNT_REQUIRED);
  const recount = await f.service.submit({ locationId: 3, posRegisterSessionId: 10, submissionKey: '33333333-3333-4333-8333-333333333333', countedCash: 1195, masterCashierIdentity: 'Master A' }, submitter);
  assert.equal(recount.attemptNumber, 2);
  assert.equal(f.masterRows[0].status, PosCashReconciliationStatus.REJECTED);
});

test('concurrent master transaction queued behind count submission observes the frozen register', async () => {
  const f = fixture(true);
  const signOff = f.service.submit({ locationId: 3, posRegisterSessionId: 10, submissionKey: '11111111-1111-4111-8111-111111111111', countedCash: 1250, masterCashierIdentity: 'Master A' }, submitter);
  const receipt = (f.service as any).dataSource.transaction(async () => {
    if (f.registerSession.status !== PosRegisterSessionStatus.OPEN) throw new ForbiddenException('Master register is frozen.');
    return 'posted';
  });
  const [, receiptResult] = await Promise.allSettled([signOff, receipt]);
  assert.equal(receiptResult.status, 'rejected');
});
