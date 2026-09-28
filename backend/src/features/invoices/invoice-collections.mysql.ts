import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import applicationDataSource from '../../data-source';
import { InvoicesService } from './invoices.service';
import { Invoice } from './invoice.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { TenantPrincipal } from '../auth/auth.types';
import { Product } from '../products/products.entity';

test('local MySQL collection, receipt history and tenant/location isolation (rolled back)', async () => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local database required');
  const ds = await applicationDataSource.initialize();
  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const manager = runner.manager;
    const base = await manager.getRepository(Invoice).findOne({ where: {}, order: { invoiceId: 'DESC' } });
    assert.ok(base, 'An existing local invoice is needed for fixture foreign keys');
    const method = await manager.getRepository(PaymentMethod).findOneBy({ tenantId: base.tenantId, isActive: true });
    assert.ok(method, 'An active local payment method is needed');
    const user = { tenantId: Number(base.tenantId), userId: Number(base.createdByUserId), accessScope: 'TENANT', assignedLocationIds: [] } as unknown as TenantPrincipal;
    const repo = manager.getRepository(Invoice);
    const invoice = await repo.save(repo.create({
      tenantId: base.tenantId, locationId: base.locationId, customerId: base.customerId,
      checkoutKey: randomUUID(), checkoutFingerprint: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      invoiceNumber: `TEST-${randomUUID()}`, invoiceDate: new Date(), saleType: 'RETAIL',
      subtotal: '5000.00', discountTotal: '0.00', grandTotal: '5000.00', paidAmount: '0.00',
      tenderedAmount: '0.00', changeAmount: '0.00', balanceAmount: '5000.00', paymentStatus: 'UNPAID',
      invoiceStatus: 'COMPLETED', createdByUserId: user.userId,
    }));
    const service = new InvoicesService({ getRepository: manager.getRepository.bind(manager), transaction: (run: any) => run(manager) } as any, {} as any);
    assert.ok((await service.pendingPayments(user)).some((row) => row.invoiceId === invoice.invoiceId));
    const firstInput = { amount: 2000, paymentMethodId: Number(method.paymentMethodId), collectionKey: randomUUID() };
    const first = await service.receivePayment(Number(invoice.invoiceId), firstInput, user);
    assert.equal(first.balanceBefore, '5000.00');
    assert.equal(first.balanceAfter, '3000.00');
    const retry = await service.receivePayment(Number(invoice.invoiceId), firstInput, user);
    assert.equal(String(retry.invoicePaymentId), String(first.invoicePaymentId));
    const final = await service.receivePayment(Number(invoice.invoiceId), { ...firstInput, amount: 3000, collectionKey: randomUUID() }, user);
    assert.equal(final.balanceAfter, '0.00');
    const saved = await repo.findOneByOrFail({ invoiceId: invoice.invoiceId });
    assert.equal(saved.grandTotal, '5000.00');
    assert.equal(saved.paidAmount, '5000.00');
    assert.equal(saved.paymentStatus, 'PAID');
    assert.equal((await manager.getRepository(InvoicePayment).findBy({ invoiceId: invoice.invoiceId })).length, 2);
    assert.ok(!(await service.pendingPayments(user)).some((row) => row.invoiceId === invoice.invoiceId));
    const receipts = (await service.collectionHistory(user)).filter((row) => row.invoiceId === invoice.invoiceId);
    assert.equal(receipts.length, 2);
    assert.ok(receipts.every((row) => row.invoice.invoiceNumber === invoice.invoiceNumber && row.paymentMethod.paymentMethodName === method.paymentMethodName));
    assert.equal(receipts.find((row) => String(row.invoicePaymentId) === String(first.invoicePaymentId))?.balanceAfter, '3000.00');
    assert.equal((await service.collectionHistory({ ...user, accessScope: 'LOCATION', assignedLocationIds: [] })).length, 0);
    assert.equal((await service.pendingPayments({ ...user, accessScope: 'LOCATION', assignedLocationIds: [] })).length, 0);
    await assert.rejects(service.receivePayment(Number(invoice.invoiceId), firstInput, { ...user, tenantId: -1 }), /not found/i);

    const products = manager.getRepository(Product);
    const template = await products.findOneByOrFail({ tenantId: base.tenantId });
    const product = await products.save(products.create({
      tenantId: base.tenantId, sku: `RECEIPT-TEST-${randomUUID()}`, productName: 'Original receipt cake',
      categoryId: template.categoryId, baseUnitId: template.baseUnitId, isActive: true, isSellable: true, isStockItem: false,
    }));
    const created = await service.create({ checkoutKey: randomUUID(), locationId: Number(base.locationId), saleType: 'RETAIL',
      details: [{ productId: Number(product.productId), quantity: 2, unitPrice: 2500, discountAmount: 500 }],
      payments: [{ paymentMethodId: Number(method.paymentMethodId), amount: 2000 }],
    }, user);
    assert.equal(created.receiptSnapshot?.tenderedAmount, '2000.00');
    assert.equal(created.receiptSnapshot?.balanceAmount, '2500.00');
    await service.receivePayment(Number(created.invoiceId), { ...firstInput, amount: 2500, collectionKey: randomUUID() }, user);
    await products.update(product.productId, { productName: 'Renamed cake' });
    const reprint = await service.get(Number(created.invoiceId), user);
    assert.equal(reprint.paidAmount, '4500.00');
    assert.equal(reprint.receiptSnapshot?.tenderedAmount, '2000.00');
    assert.equal(reprint.receiptSnapshot?.details[0].product.productName, 'Original receipt cake');
    assert.deepEqual(JSON.parse(JSON.stringify(created.receiptSnapshot)), reprint.receiptSnapshot);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await ds.destroy();
  }
});
