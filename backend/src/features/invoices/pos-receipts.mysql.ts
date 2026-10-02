/** Explicit disposable-local-MySQL suite. It never selects DB_DATABASE. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { AddPosReceiptIdentities1770000036000 } from '../../migrations/1770000036000-AddPosReceiptIdentities';
import { AddPosPrintOutbox1770000037000 } from '../../migrations/1770000037000-AddPosPrintOutbox';
import { AllowUnpairedMasterCashiers1770000038000 } from '../../migrations/1770000038000-AllowUnpairedMasterCashiers';
import { Tenant } from '../tenants/tenant.entity';
import { Location, LocationType } from '../locations/locations.entity';
import { User } from '../users/user.entity';
import { Category } from '../categories/categories.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Product } from '../products/products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceListItemDiscount } from '../price-list-item-discounts/price-list-item-discounts.entity';
import { PriceListItemDiscountService } from '../price-list-item-discounts/price-list-item-discounts.service';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PosTerminal } from '../pos-registers/pos-terminal.entity';
import { PosPricingService } from './pos-pricing.service';
import { InvoicesService } from './invoices.service';
import { Invoice } from './invoice.entity';
import { nextPosReceiptNumber } from './pos-receipt-number';
import { InvoiceRefundsService } from '../invoice-refunds/invoice-refunds.service';
import { InvoiceRefund } from '../invoice-refunds/invoice-refund.entity';
import { PosPrintService } from '../pos-print/pos-print.service';
import { PosPrintJob } from '../pos-print/pos-print-job.entity';

test('disposable MySQL: upgrade history, concurrent first bills and refunds, rollback, print retry', { timeout: 180000 }, async () => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local MySQL is required.');
  const database = `pos_receipt_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
  assert.match(database, /^pos_receipt_test_\d+_[a-f0-9]{8}$/);
  assert.notEqual(database, process.env.DB_DATABASE);
  const options = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD };
  const server = await createConnection(options);
  let created = false;
  const db = new DataSource({ type: 'mysql', host: options.host, port: options.port, username: options.user, password: options.password, database, entities: [__dirname + '/../../**/*.entity.js'], migrations: [__dirname + '/../../migrations/*.js'], synchronize: false });
  try {
    await server.query(`CREATE DATABASE \`${database}\``); created = true;
    const baseline = await createConnection({ ...options, database, multipleStatements: true });
    try { await baseline.query(await readFile(join(__dirname, '../../../schema/baseline-1770000023000.sql'), 'utf8')); } finally { await baseline.end(); }
    await db.initialize();
    await db.runMigrations({ transaction: 'each' });
    const q = db.createQueryRunner();
    assert.ok(await q.hasColumn('tbl_invoice', 'bill_no'));
    assert.ok(await q.hasColumn('tbl_invoice_refund', 'refund_no'));
    assert.ok(await q.hasTable('tbl_pos_print_job'));
    const cashierColumn: Array<{ isNullable: string }> = await q.query(`SELECT is_nullable AS isNullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_cashier_session' AND column_name = 'pos_terminal_id'`);
    assert.equal(cashierColumn[0].isNullable, 'YES');

    const tenant = await db.getRepository(Tenant).save(db.getRepository(Tenant).create({ code: `RECEIPT-${randomBytes(3).toString('hex')}`, name: 'Actual Bakery', timeZone: 'Asia/Colombo', isActive: true }));
    const user = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: tenant.tenantId, username: 'C17', firstName: 'Cashier', passwordHash: 'not-used', isActive: true }));
    const locations: Location[] = [];
    for (const code of ['BANDA', 'ANU']) locations.push(await db.getRepository(Location).save(db.getRepository(Location).create({ tenantId: tenant.tenantId, code, name: code, locationType: LocationType.STORE, addressLine1: `${code} Main Road`, isActive: true })));
    const terminals: PosTerminal[] = [];
    for (const location of locations) terminals.push(await db.getRepository(PosTerminal).save(db.getRepository(PosTerminal).create({ tenantId: tenant.tenantId, locationId: location.locationId, terminalCode: 'POS1', displayName: 'Counter', isActive: true })));
    const principal: any = { scope: 'TENANT', tenantId: Number(tenant.tenantId), userId: Number(user.userId), roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] };

    await new AllowUnpairedMasterCashiers1770000038000().down(q);
    await new AddPosPrintOutbox1770000037000().down(q);
    await new AddPosReceiptIdentities1770000036000().down(q);
    await q.query(`INSERT INTO tbl_invoice (tenant_id, location_id, invoice_number, checkout_key, checkout_fingerprint, invoice_date, sale_type, subtotal, grand_total, payment_status, created_by_user_id)
      VALUES (?, ?, 'LEGACY-1', ?, ?, NOW(), 'RETAIL', 10, 10, 'UNPAID', ?)`, [tenant.tenantId, locations[0].locationId, randomUUID(), 'a'.repeat(64), user.userId]);
    const legacyId: number = Number((await q.query(`SELECT invoice_id FROM tbl_invoice WHERE invoice_number = 'LEGACY-1'`))[0].invoice_id);
    await q.query(`INSERT INTO tbl_invoice_refund (tenant_id, location_id, invoice_id, refund_number, refund_date, reason, subtotal, refund_total, created_by_user_id)
      VALUES (?, ?, ?, 'LEGACY-R1', NOW(), 'Historical return', 2, 2, ?)`, [tenant.tenantId, locations[0].locationId, legacyId, user.userId]);
    await new AddPosReceiptIdentities1770000036000().up(q);
    await new AddPosPrintOutbox1770000037000().up(q);
    await new AllowUnpairedMasterCashiers1770000038000().up(q);
    const legacy = await db.getRepository(Invoice).findOneByOrFail({ invoiceId: legacyId });
    assert.equal(legacy.billNo, null);
    assert.equal(legacy.businessDate, null);
    assert.equal((await db.getRepository(InvoiceRefund).findOneByOrFail({ refundNumber: 'LEGACY-R1' })).refundNo, null);

    const category = await db.getRepository(Category).save(db.getRepository(Category).create({ tenantId: tenant.tenantId, categoryCode: 'FOOD', categoryName: 'Food', isActive: true }));
    const unit = await db.getRepository(UnitOfMeasure).save(db.getRepository(UnitOfMeasure).create({ tenantId: tenant.tenantId, code: 'EA', name: 'Each', symbol: 'ea', unitType: 'COUNT', allowsDecimalQuantity: false, quantityPrecision: 0, isActive: true }));
    const product = await db.getRepository(Product).save(db.getRepository(Product).create({ tenantId: tenant.tenantId, sku: 'BREAD', productName: 'Bread', productType: 'NON_STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true, isSellable: true, isPurchasable: false, isStockItem: false, trackBatch: false, trackExpiry: false, trackSerial: false }));
    const productUnit = await db.getRepository(ProductUnit).save(db.getRepository(ProductUnit).create({ productId: product.productId, unitId: unit.unitId, conversionFactor: '1', isBaseUnit: true, isPurchaseUnit: false, isSalesUnit: true, isActive: true }));
    for (const location of locations) await db.getRepository(ProductLocation).save(db.getRepository(ProductLocation).create({ productId: product.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false }));
    const priceList = await db.getRepository(PriceList).save(db.getRepository(PriceList).create({ tenantId: tenant.tenantId, code: 'RETAIL', name: 'Retail', priceListType: 'RETAIL', currencyCode: 'LKR', isDefault: true, isActive: true }));
    await db.getRepository(PriceListItem).save(db.getRepository(PriceListItem).create({ tenantId: tenant.tenantId, priceListId: priceList.priceListId, productId: product.productId, unitId: unit.unitId, productUnitId: productUnit.productUnitId, sellingPrice: '10', currencyCode: 'LKR', minimumQuantity: '1', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, isActive: true }));
    const method = await db.getRepository(PaymentMethod).save(db.getRepository(PaymentMethod).create({ tenantId: tenant.tenantId, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH, isActive: true }));
    const print = new PosPrintService(db);
    const configured = await print.configure({ locationId: Number(locations[0].locationId), posTerminalId: null, displayName: 'Test TCP printer', transport: 'TCP', target: '192.168.1.50', port: 9100, paperWidth: 80, encoding: 'CP437', cutEnabled: true, isActive: true }, principal);
    let mode = 'TERMINAL_REGISTER'; let terminalCode = 'POS1';
    const sessions: any = { requireCashierSession: async (_manager: unknown, _credential: unknown, _user: unknown, locationId: number) => {
      const terminal = terminals.find((row) => Number(row.locationId) === Number(locationId))!;
      return { terminal: { ...terminal, terminalCode }, config: { registerMode: mode }, register: { receiptCode: 'MASTER' }, registerSession: { posRegisterSessionId: null }, cashierSession: { posCashierSessionId: null } };
    } };
    const discounts = new PriceListItemDiscountService(db.getRepository(PriceListItemDiscount), db);
    const invoices = new InvoicesService(db, new PosPricingService(db, discounts), sessions, undefined, print);
    const quote = await invoices.quote({ locationId: Number(locations[0].locationId), saleType: 'RETAIL', details: [{ productId: Number(product.productId), quantity: 2 }] }, principal);
    const request = (locationId: number, checkoutKey = randomUUID()) => ({ checkoutKey, locationId, saleType: 'RETAIL', details: [{ productId: Number(product.productId), quantity: 2, quotedPriceListItemId: quote.lines[0].priceListItemId, quotedPriceListItemDiscountId: quote.lines[0].priceListItemDiscountId ?? undefined, quotedUnitPrice: quote.lines[0].unitPrice, quotedDiscountAmount: quote.lines[0].discountAmount }], payments: [{ paymentMethodId: Number(method.paymentMethodId), amount: 20 }] } as any);
    const [first, second] = await Promise.all([invoices.create(request(Number(locations[0].locationId)), principal), invoices.create(request(Number(locations[0].locationId)), principal)]);
    assert.deepEqual([first.billNo, second.billNo].sort(), [1, 2]);
    assert.equal(first.printedLocationCode, 'BANDA');
    assert.equal(first.printedRegisterCode, 'POS1');
    assert.equal(first.receiptSnapshot?.header?.companyName, 'Actual Bakery');
    const retryKey = randomUUID(); const once = await invoices.create(request(Number(locations[0].locationId), retryKey), principal); const retried = await invoices.create(request(Number(locations[0].locationId), retryKey), principal);
    assert.equal(once.invoiceId, retried.invoiceId); assert.equal(once.billNo, retried.billNo);
    const other = await invoices.create(request(Number(locations[1].locationId)), principal);
    assert.equal(other.billNo, 1); assert.equal(other.printedRegisterCode, 'POS1');
    mode = 'MASTER_REGISTER';
    const master = await invoices.create(request(Number(locations[0].locationId)), principal);
    assert.equal(master.printedRegisterCode, 'MASTER'); assert.equal(master.billNo, 1);
    mode = 'TERMINAL_REGISTER'; terminalCode = 'POSX';
    const changed = await invoices.create(request(Number(locations[0].locationId)), principal);
    assert.equal(changed.billNo, 1); assert.equal(first.receiptSnapshot?.printedRegisterCode, 'POS1');
    terminalCode = 'POS1';
    const restored = await invoices.create(request(Number(locations[0].locationId)), principal);
    assert.equal(restored.billNo, 4);
    await assert.rejects(db.transaction(async (manager) => { await nextPosReceiptNumber(manager, 'SALE', principal.tenantId, '2026-10-04', 'ROLL', 'POS1'); throw new Error('rollback'); }), /rollback/);
    const rolledBack = await db.transaction((manager) => nextPosReceiptNumber(manager, 'SALE', principal.tenantId, '2026-10-04', 'ROLL', 'POS1'));
    assert.equal(rolledBack, 1);
    const tomorrow = await db.transaction((manager) => nextPosReceiptNumber(manager, 'SALE', principal.tenantId, '2026-10-05', 'ROLL', 'POS1'));
    assert.equal(tomorrow, 1);

    const refunds = new InvoiceRefundsService(db, sessions, undefined, print);
    const [refundResult, competing] = await Promise.allSettled([
      refunds.create({ refundKey: randomUUID(), invoiceId: Number(first.invoiceId), reason: 'Return', details: [{ invoiceDetailId: Number(first.details[0].invoiceDetailId), quantity: 2, returnToStock: false }], payments: [] }, principal),
      refunds.create({ refundKey: randomUUID(), invoiceId: Number(first.invoiceId), reason: 'Competing return', details: [{ invoiceDetailId: Number(first.details[0].invoiceDetailId), quantity: 2, returnToStock: false }], payments: [] }, principal),
    ]);
    assert.equal([refundResult, competing].filter((row) => row.status === 'fulfilled').length, 1);
    const winning = (refundResult.status === 'fulfilled' ? refundResult.value : (competing as PromiseFulfilledResult<InvoiceRefund>).value);
    assert.equal(winning!.refundNo, 1); assert.equal(winning!.receiptSnapshot?.originalSale?.billNo, first.billNo);
    const refundKey = randomUUID();
    const nextRefund = await refunds.create({ refundKey, invoiceId: Number(second.invoiceId), reason: 'Partial return', details: [{ invoiceDetailId: Number(second.details[0].invoiceDetailId), quantity: 1, returnToStock: false }], payments: [] }, principal);
    assert.equal(nextRefund!.refundNo, 2);
    assert.equal((await refunds.create({ refundKey, invoiceId: Number(second.invoiceId), reason: 'Partial return', details: [{ invoiceDetailId: Number(second.details[0].invoiceDetailId), quantity: 1, returnToStock: false }], payments: [] }, principal))!.invoiceRefundId, nextRefund!.invoiceRefundId);

    const job = await db.getRepository(PosPrintJob).findOneByOrFail({ documentType: 'SALE', sourceId: first.invoiceId });
    assert.equal(job.status, 'PENDING');
    const claimed = await print.claim(configured.profile.posPrintProfileId, configured.agentToken!);
    assert.ok(claimed);
    await print.complete(configured.profile.posPrintProfileId, claimed!.jobId, configured.agentToken!, claimed!.attempt, false, 'Fake printer offline');
    assert.equal((await db.getRepository(PosPrintJob).findOneByOrFail({ posPrintJobId: claimed!.jobId })).status, 'FAILED');
    await print.retry(claimed!.jobId, principal);
    const claimedAgain = await print.claim(configured.profile.posPrintProfileId, configured.agentToken!);
    assert.equal(claimedAgain!.copy, true);
    await print.complete(configured.profile.posPrintProfileId, claimedAgain!.jobId, configured.agentToken!, claimedAgain!.attempt, true);
    const printedJob = await db.getRepository(PosPrintJob).findOneByOrFail({ posPrintJobId: claimedAgain!.jobId });
    assert.equal((await print.documentStatus('SALE', Number(printedJob.sourceId), principal)).status, 'PRINTED');
    const interrupted = await print.claim(configured.profile.posPrintProfileId, configured.agentToken!);
    assert.ok(interrupted);
    await db.getRepository(PosPrintJob).update(interrupted!.jobId, { leaseUntil: new Date(Date.now() - 1000) });
    const reclaimed = await print.claim(configured.profile.posPrintProfileId, configured.agentToken!);
    assert.equal(reclaimed!.jobId, interrupted!.jobId);
    assert.equal(reclaimed!.attempt, interrupted!.attempt + 1);
    await assert.rejects(() => print.complete(configured.profile.posPrintProfileId, interrupted!.jobId, configured.agentToken!, interrupted!.attempt, true), /Stale print acknowledgment/);
    await print.complete(configured.profile.posPrintProfileId, reclaimed!.jobId, configured.agentToken!, reclaimed!.attempt, true);
    assert.equal(await db.getRepository(Invoice).countBy({ tenantId: tenant.tenantId }), 8);
    assert.equal(await db.getRepository(InvoiceRefund).countBy({ tenantId: tenant.tenantId }), 3);
    const history = await invoices.history(principal, 1, 2, 'BANDA', 'INVOICE', 'ALL');
    assert.equal(history.items.length, 2);
    assert.ok(history.total >= 6);
    assert.equal(history.items[0].invoice.printedLocationCode, 'BANDA');
    assert.equal((await invoices.history(principal, 1, 20, 'POSX', 'INVOICE', 'ALL')).total, 1);
    assert.equal((await invoices.pendingPaymentsPage(principal, 1, 20)).total, 0);
    assert.equal((await invoices.collectionHistoryPage(principal, 1, 20)).total, 0);
    await q.release();
  } finally {
    if (db.isInitialized) await db.destroy();
    if (created) await server.query(`DROP DATABASE \`${database}\``);
    await server.end();
  }
});
