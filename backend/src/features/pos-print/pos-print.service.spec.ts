import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PosPrintService } from './pos-print.service';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Invoice } from '../invoices/invoice.entity';
import { PosPrintJob } from './pos-print-job.entity';
import { PosPrintProfile } from './pos-print-profile.entity';
import { TenantPrincipal } from '../auth/auth.types';

const user = { tenantId: 1, userId: 2, accessScope: 'LOCATION', assignedLocationIds: [3] } as TenantPrincipal;

function fixture(profileActive = true) {
  const snapshot = { documentType: 'PAYMENT_COLLECTION', paymentReceiptNumber: 'PAY-000001', balanceBefore: '100.00', balanceAfter: '50.00' };
  const invoice: any = { invoiceId: 7, tenantId: 1, locationId: 3 };
  const payment: any = { invoicePaymentId: 1, tenantId: 1, invoiceId: 7, invoice, collectionKey: 'key', posTerminalId: 21, receiptSnapshot: snapshot };
  const jobs: any[] = [];
  const audit: unknown[][] = [];
  const profile = profileActive ? { posPrintProfileId: 8, tenantId: 1, locationId: 3, isActive: true } : null;
  const jobRepo: any = { create: (value: any) => value,
    save: async (value: any) => { if (!value.posPrintJobId) { value.posPrintJobId = jobs.length + 1; jobs.push(value); } return value; },
    findOne: async () => jobs.at(-1) ?? null };
  const manager: any = { getRepository(entity: unknown) {
    if (entity === InvoicePayment) return { findOne: async ({ where }: any) => where.tenantId === payment.tenantId && where.invoicePaymentId === 1 ? payment : null };
    if (entity === Invoice) return { findOneBy: async ({ tenantId, invoiceId }: any) => tenantId === 1 && invoiceId === 7 ? invoice : null };
    if (entity === PosPrintProfile) return { findOneBy: async () => profile };
    if (entity === PosPrintJob) return jobRepo;
    throw new Error('Unexpected repository');
  }, query: async (_sql: string, params: unknown[]) => { audit.push(params); } };
  let queue = Promise.resolve();
  const source: any = { manager, getRepository: manager.getRepository,
    transaction: (work: (manager: any) => Promise<unknown>) => {
      const result = queue.then(() => work(manager));
      queue = result.then(() => undefined, () => undefined);
      return result;
    } };
  return { service: new PosPrintService(source), jobs, audit, payment };
}

test('collection print is explicit, duplicate requests share a job and reprints are audited', async () => {
  const f = fixture();
  assert.equal(f.jobs.length, 0);
  assert.equal((await f.service.documentStatus('PAYMENT_COLLECTION', 1, user)).status, 'NOT_REQUESTED');
  const [first, duplicate] = await Promise.all([
    f.service.requestPrint('PAYMENT_COLLECTION', 1, user), f.service.requestPrint('PAYMENT_COLLECTION', 1, user),
  ]);
  assert.equal(first.jobId, duplicate.jobId);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].receiptSnapshot.balanceAfter, '50.00');
  f.jobs[0].status = 'PRINTED';
  const reprint = await f.service.requestPrint('PAYMENT_COLLECTION', 1, user);
  assert.equal(reprint.reprint, true);
  assert.equal(f.audit.length, 1);
  assert.equal(f.jobs[0].receiptSnapshot.printCopy, true);
});

test('collection print rejects inaccessible location and missing printer without changing payment', async () => {
  const denied = fixture();
  await assert.rejects(denied.service.requestPrint('PAYMENT_COLLECTION', 1, { ...user, assignedLocationIds: [99] }), /location/i);
  assert.equal(denied.jobs.length, 0);
  const missing = fixture(false);
  await assert.rejects(missing.service.requestPrint('PAYMENT_COLLECTION', 1, user), /printer/i);
  assert.equal(missing.payment.receiptSnapshot.balanceAfter, '50.00');
  assert.equal(missing.jobs.length, 0);
});

test('failed or offline collection printing retries only the job, never the payment', async () => {
  const f = fixture();
  await f.service.requestPrint('PAYMENT_COLLECTION', 1, user);
  assert.equal((await f.service.documentStatus('PAYMENT_COLLECTION', 1, user)).status, 'PENDING');
  f.jobs[0].status = 'FAILED';
  f.jobs[0].lastError = 'Agent offline';
  const retry = await f.service.requestPrint('PAYMENT_COLLECTION', 1, user);
  assert.equal(retry.jobId, 1);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].status, 'PENDING');
  assert.equal(f.jobs[0].lastError, null);
  assert.equal(f.payment.receiptSnapshot.balanceAfter, '50.00');
});
