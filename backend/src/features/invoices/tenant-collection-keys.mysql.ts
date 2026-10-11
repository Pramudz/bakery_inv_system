import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import applicationDataSource from '../../data-source';
import { InvoicesService } from './invoices.service';
import { Invoice } from './invoice.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Customer } from '../customers/customers.entity';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { TenantPrincipal } from '../auth/auth.types';

test('MySQL enforces tenant-wide collection identity across concurrent invoices', async () => {
  assert.equal(process.env.DB_DATABASE, 'dev_erp_product_import_test', 'Only the authorized disposable database may be used.');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local MySQL required.');
  const ds = await applicationDataSource.initialize();
  try {
    const [{ db }] = await ds.query('SELECT DATABASE() AS db');
    assert.equal(db, 'dev_erp_product_import_test');
    const invoiceRepo = ds.getRepository(Invoice);
    const base = await invoiceRepo.findOne({ where: {}, order: { invoiceId: 'DESC' } });
    assert.ok(base, 'A local invoice is required for fixture foreign keys.');
    const method = await ds.getRepository(PaymentMethod).findOneBy({ tenantId: base.tenantId, paymentMethodType: PaymentMethodType.CASH, isActive: true });
    assert.ok(method, 'An active cash method is required.');
    const customer = await ds.getRepository(Customer).save(ds.getRepository(Customer).create({
      tenantId: base.tenantId, customerCode: `KEY-AUDIT-${randomUUID()}`, customerName: 'Tenant key concurrency test', isActive: true,
    }));
    const user = { scope: 'TENANT', tenantId: Number(base.tenantId), userId: Number(base.createdByUserId), username: 'collection-key-test', roleId: 0, roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] } as TenantPrincipal;
    const makeInvoice = () => invoiceRepo.save(invoiceRepo.create({
      tenantId: base.tenantId, locationId: base.locationId, customerId: customer.customerId,
      checkoutKey: randomUUID(), checkoutFingerprint: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      invoiceNumber: `KEY-AUDIT-${randomUUID()}`, invoiceDate: new Date(), saleType: 'RETAIL',
      subtotal: '5000.00', discountTotal: '0.00', grandTotal: '5000.00', paidAmount: '0.00',
      tenderedAmount: '0.00', changeAmount: '0.00', balanceAmount: '5000.00', paymentStatus: 'UNPAID',
      invoiceStatus: 'COMPLETED', createdByUserId: user.userId,
    }));
    const [firstInvoice, secondInvoice] = await Promise.all([makeInvoice(), makeInvoice()]);
    const fakeSession: any = { terminal: null, registerSession: { posRegisterSessionId: null }, cashierSession: { posCashierSessionId: null } };
    const service = new InvoicesService(ds, {} as any, { requireCashierSession: async () => fakeSession } as any);
    const key = randomUUID();
    const dto = { collectionKey: key, amount: 2000, paymentMethodId: Number(method.paymentMethodId) };
    const results = await Promise.allSettled([
      service.receivePayment(Number(firstInvoice.invoiceId), dto, user),
      service.receivePayment(Number(secondInvoice.invoiceId), dto, user),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.match(String((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason), /collection key.*another invoice/i);
    const payments = await ds.getRepository(InvoicePayment).findBy({ tenantId: user.tenantId, collectionKey: key });
    assert.equal(payments.length, 1);
    const invoices = await invoiceRepo.findBy([{ invoiceId: firstInvoice.invoiceId }, { invoiceId: secondInvoice.invoiceId }]);
    assert.deepEqual(invoices.map((invoice) => Number(invoice.balanceAmount)).sort(), [3000, 5000]);
    const winner = payments[0];
    const replay = await service.receivePayment(Number(winner.invoiceId), dto, user);
    assert.equal(Number(replay.invoicePaymentId), Number(winner.invoicePaymentId));
    await assert.rejects(service.receivePayment(Number(winner.invoiceId), { ...dto, amount: 1000 }, user), /different payment data/i);
    console.log(JSON.stringify({ tenantId: user.tenantId, customerId: customer.customerId, invoiceIds: invoices.map((invoice) => invoice.invoiceId), collectionKey: key, paymentId: winner.invoicePaymentId }));
  } finally { await ds.destroy(); }
});
