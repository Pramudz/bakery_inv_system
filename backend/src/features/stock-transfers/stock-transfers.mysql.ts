/** Creates and removes its own local MySQL database; never uses DB_DATABASE for writes. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { AddStockTransfersAndInventoryAging1770000042000 } from '../../migrations/1770000042000-AddStockTransfersAndInventoryAging';
import { InventoryAgingService } from '../inventory-aging/inventory-aging.service';
import { InventoryAgingSnapshot } from '../inventory-aging/inventory-aging-snapshot.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Category } from '../categories/categories.entity';
import { GoodsReceipt } from '../goods-receipts/goods-receipt.entity';
import { Location, LocationType } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { User } from '../users/user.entity';
import { StockTransfer } from './stock-transfer.entity';
import { StockTransferLine } from './stock-transfer-line.entity';
import { StockTransferAgeAllocation } from './stock-transfer-age-allocation.entity';
import { StockTransferReceipt } from './stock-transfer-receipt.entity';
import { StockTransfersService } from './stock-transfers.service';

test('disposable MySQL: fresh and upgrade migration, transfer posting, analytical aging, retry and rollback', { timeout: 180000 }, async () => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local MySQL is required.');
  assert.notEqual(process.env.DB_SYNCHRONIZE, 'true');
  const database = `stock_transfer_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
  assert.match(database, /^stock_transfer_test_\d+_[a-f0-9]{8}$/);
  assert.notEqual(database, process.env.DB_DATABASE);
  const options = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD };
  const server = await createConnection(options);
  const db = new DataSource({ type: 'mysql', host: options.host, port: options.port, username: options.user, password: options.password,
    database, entities: [__dirname + '/../../**/*.entity.js'], migrations: [__dirname + '/../../migrations/*.js'], synchronize: false });
  let created = false;
  try {
    await server.query(`CREATE DATABASE \`${database}\``); created = true;
    const baseline = await createConnection({ ...options, database, multipleStatements: true });
    try { await baseline.query(await readFile(join(__dirname, '../../../schema/baseline-1770000023000.sql'), 'utf8')); } finally { await baseline.end(); }
    await db.initialize();
    await db.runMigrations({ transaction: 'each' });
    const q = db.createQueryRunner();
    assert.ok(await q.hasTable('tbl_stock_transfer'));
    assert.ok(await q.hasTable('tbl_stock_transfer_receipt_line'));
    assert.ok(await q.hasTable('tbl_inventory_aging_snapshot'));
    const tenant = await db.getRepository(Tenant).save(db.getRepository(Tenant).create({ code: `TRF-${randomBytes(3).toString('hex')}`, name: 'Transfer test', timeZone: 'Asia/Colombo', isActive: true }));
    const user = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: tenant.tenantId, username: 'transfer-user', passwordHash: 'not-used', isActive: true }));
    const source = await db.getRepository(Location).save(db.getRepository(Location).create({ tenantId: tenant.tenantId, code: 'SRC', name: 'Source', locationType: LocationType.WAREHOUSE, isActive: true }));
    const destination = await db.getRepository(Location).save(db.getRepository(Location).create({ tenantId: tenant.tenantId, code: 'DEST', name: 'Destination', locationType: LocationType.STORE, isActive: true }));
    const category = await db.getRepository(Category).save(db.getRepository(Category).create({ tenantId: tenant.tenantId, categoryCode: 'TEST', categoryName: 'Test', isActive: true }));
    const unit = await db.getRepository(UnitOfMeasure).save(db.getRepository(UnitOfMeasure).create({ tenantId: tenant.tenantId, code: 'EA', name: 'Each', symbol: 'ea', unitType: 'COUNT', allowsDecimalQuantity: false, quantityPrecision: 0, isActive: true }));
    const product = await db.getRepository(Product).save(db.getRepository(Product).create({ tenantId: tenant.tenantId, sku: 'TRF-P', productName: 'Transferred stock', productType: 'STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true, isStockItem: true, isSellable: true, isPurchasable: false, trackBatch: false, trackExpiry: false, trackSerial: false }));
    for (const location of [source, destination]) await db.getRepository(ProductLocation).save(db.getRepository(ProductLocation).create({ productId: product.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false }));
    await db.getRepository(InventoryBalance).save(db.getRepository(InventoryBalance).create({ tenantId: tenant.tenantId, locationId: source.locationId, productId: product.productId, quantityOnHand: '100.0000', averageCost: '125.0000' }));
    await db.getRepository(InventoryBalance).save(db.getRepository(InventoryBalance).create({ tenantId: tenant.tenantId, locationId: destination.locationId, productId: product.productId, quantityOnHand: '20.0000', averageCost: '150.0000' }));
    const principal: any = { scope: 'TENANT', tenantId: Number(tenant.tenantId), userId: Number(user.userId), roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] };
    const sequences = new NumberSequencesService();
    const numberingDto = { sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(product.productId), quantity: '1' }] };
    const numberingService = new StockTransfersService(db, new InventoryBalanceService(), new InventoryAgingService(db), sequences);
    const concurrentDrafts = await Promise.all(Array.from({ length: 12 }, () => numberingService.create(numberingDto, principal)));
    const numbers = concurrentDrafts.map(row => row.transferNumber);
    assert.equal(new Set(numbers).size, 12, 'concurrent same-tenant/year creates have unique numbers');
    const year = numbers[0].split('-')[2];
    assert.deepEqual(numbers.map(number => Number(number.split('-').pop())).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1));
    assert.ok(numbers.every(number => new RegExp(`^TRF-${tenant.tenantId}-${year}-\\d{7}$`).test(number)));
    const otherLocationDirection = await numberingService.create({ ...numberingDto, sourceLocationId: Number(destination.locationId), destinationLocationId: Number(source.locationId) }, principal);
    assert.equal(otherLocationDirection.transferNumber, `TRF-${tenant.tenantId}-${year}-0000013`, 'locations do not scope the number');
    const oldNumber = `TRF-${tenant.tenantId}-${year}-000123`;
    await q.query(`INSERT INTO tbl_stock_transfer (tenant_id, transfer_number, source_location_id, destination_location_id, status, transfer_date, created_by_user_id)
      VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)`, [tenant.tenantId, oldNumber, source.locationId, destination.locationId, `${year}-01-01`, user.userId]);
    await q.query(`UPDATE tbl_number_sequence SET last_number = 123 WHERE tenant_id = ? AND sequence_key = ? AND scope_key = 'TENANT' AND period_key = ?`,
      [tenant.tenantId, NumberSequenceKeys.STOCK_TRANSFER, year]);
    const continued = await numberingService.create(numberingDto, principal);
    assert.equal(continued.transferNumber, `TRF-${tenant.tenantId}-${year}-0000124`, 'the underlying counter continues across the padding change');
    assert.equal((await q.query('SELECT transfer_number FROM tbl_stock_transfer WHERE tenant_id = ? AND transfer_number = ?', [tenant.tenantId, oldNumber]))[0].transfer_number, oldNumber, 'historical number stays unchanged');
    // Upgrade a database already carrying inventory, sale and refund records.
    await q.query(`INSERT INTO tbl_invoice (tenant_id, location_id, invoice_number, checkout_key, checkout_fingerprint, invoice_date, sale_type, subtotal, grand_total, payment_status, created_by_user_id)
      VALUES (?, ?, 'TRF-LEGACY-SALE', ?, ?, NOW(), 'RETAIL', 1, 1, 'UNPAID', ?)`, [tenant.tenantId, source.locationId, randomUUID(), 'a'.repeat(64), user.userId]);
    const invoiceId = Number((await q.query("SELECT invoice_id FROM tbl_invoice WHERE invoice_number='TRF-LEGACY-SALE'"))[0].invoice_id);
    await q.query(`INSERT INTO tbl_invoice_refund (tenant_id, location_id, invoice_id, refund_number, refund_date, reason, subtotal, refund_total, created_by_user_id)
      VALUES (?, ?, ?, 'TRF-LEGACY-REFUND', NOW(), 'Test', 1, 1, ?)`, [tenant.tenantId, source.locationId, invoiceId, user.userId]);
    await new AddStockTransfersAndInventoryAging1770000042000().down(q);
    await new AddStockTransfersAndInventoryAging1770000042000().up(q);
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ tenantId: tenant.tenantId, locationId: source.locationId, productId: product.productId })).quantityOnHand, '100.0000');
    assert.equal(Number((await q.query('SELECT COUNT(*) n FROM tbl_invoice_refund WHERE tenant_id=?', [tenant.tenantId]))[0].n), 1);

    const ledgerRepo = db.getRepository(InventoryLedger);
    const ledger = (type: string, quantityIn: string, quantityOut: string, businessDate: string, sourceType: string, documentId: number, lineId: number, reversalOfLedgerId: number | null = null) => ledgerRepo.save(ledgerRepo.create({
      tenantId: tenant.tenantId, locationId: source.locationId, productId: product.productId, movementDate: new Date(`${businessDate}T12:00:00Z`), businessDate,
      movementType: type, sourceDocumentType: sourceType, sourceDocumentId: documentId, sourceDocumentLineId: lineId,
      quantityIn, quantityOut, unitCost: '125.0000', movementValue: '125.0000', quantityBefore: '0', quantityAfter: '0',
      averageCostBefore: '125.0000', averageCostAfter: '125.0000', reversalOfLedgerId, createdByUserId: user.userId,
    }));
    await ledger('ADJI', '20', '0', '2026-06-01', 'INVENTORY_ADJUSTMENT', 101, 101);
    await ledger('AVIN', '30', '0', '2026-08-01', 'INVENTORY_CONVERSION', 102, 102);
    await ledger('SALE_RETURN', '50', '0', '2026-09-01', 'INVOICE_REFUND', 103, 103);
    const supplier = await db.getRepository(Supplier).save(db.getRepository(Supplier).create({ tenantId: tenant.tenantId, supplierCode: 'S1', supplierName: 'Supplier', isActive: true }));
    const grn = await db.getRepository(GoodsReceipt).save(db.getRepository(GoodsReceipt).create({ tenantId: tenant.tenantId, receiptType: 'DIRECT', supplierId: supplier.supplierId, locationId: source.locationId, receiptDate: '2026-10-05', status: 'REVERSED', createdByUserId: user.userId, isActive: true }));
    const original = await ledger('GRN', '50', '0', '2026-10-05', 'GRN', grn.goodsReceiptId, 104);
    await ledger('GRN_REVERSAL', '0', '50', '2026-10-06', 'GRN', grn.goodsReceiptId, 104, original.inventoryLedgerId);
    for (let index = 0; index < 20; index += 1) await ledger('SALE', '0', '1', '2026-09-15', 'INVOICE', 600 + index, 600 + index);
    const aging = new InventoryAgingService(db);
    const service = new StockTransfersService(db, new InventoryBalanceService(), aging, new NumberSequencesService());
    const initialAging = await aging.calculateCurrentAging(principal, { locationId: Number(source.locationId), productId: Number(product.productId) });
    assert.deepEqual(initialAging.rows[0].composition.map(part => [part.agingDate, part.quantity]), [
      ['2026-09-01', '50.0000'], ['2026-08-01', '30.0000'], ['2026-06-01', '20.0000'],
    ], 'reversed October GRN contributes no recent age');
    const snapshot = await aging.generateCurrentSnapshot(principal, { locationId: Number(source.locationId) });
    assert.equal(snapshot.rowsSaved, 1);
    const stored = await db.getRepository(InventoryAgingSnapshot).findOneByOrFail({ tenantId: tenant.tenantId, locationId: source.locationId, productId: product.productId });
    assert.equal(stored.quantityOnHand, '100.0000');
    assert.equal(stored.inventoryValue, '12500.0000');
    assert.equal(stored.unknownQty, '0.0000');
    assert.equal(stored.attributedQty, '100.0000');
    assert.equal(stored.agingCoveragePercentage, '100.0000');
    assert.equal(stored.qty31to60, initialAging.rows[0].qty31to60);
    assert.equal(stored.qty61to90, initialAging.rows[0].qty61to90);
    assert.equal(stored.qty91to180, initialAging.rows[0].qty91to180);
    const draft = await service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(product.productId), quantity: '40' }] }, principal);
    assert.equal(draft.status, 'DRAFT');
    const dispatchKey = randomUUID();
    const dispatched = await service.dispatch(draft.stockTransferId, { dispatchKey }, principal);
    assert.equal(dispatched.status, 'DISPATCHED');
    assert.equal(dispatched.lines[0].unitCostSnapshot, '125.0000');
    assert.equal(dispatched.lines[0].transferValue, '5000.0000');
    assert.equal(dispatched.lines[0].inTransitQuantity, '40.0000');
    assert.equal(dispatched.lines[0].inTransitValue, '5000.0000');
    assert.deepEqual(dispatched.lines[0].ageAllocations.map(row => [row.originAgingDate, row.dispatchedQuantity]).sort(), [
      ['2026-06-01', '20.0000'], ['2026-08-01', '20.0000'],
    ]);
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: source.locationId, productId: product.productId })).quantityOnHand, '60.0000');
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: destination.locationId, productId: product.productId })).quantityOnHand, '20.0000');
    assert.equal((await service.dispatch(draft.stockTransferId, { dispatchKey }, principal)).stockTransferId, draft.stockTransferId);
    await assert.rejects(service.dispatch(draft.stockTransferId, { dispatchKey: randomUUID() }, principal), /dispatch key differs/i);
    assert.equal((await db.getRepository(InventoryAgingSnapshot).findOneByOrFail({ inventoryAgingSnapshotId: stored.inventoryAgingSnapshotId })).quantityOnHand, '100.0000', 'saved snapshot does not follow later movements');
    await aging.generateCurrentSnapshot(principal, { locationId: Number(source.locationId) });
    assert.equal(await db.getRepository(InventoryAgingSnapshot).countBy({ tenantId: tenant.tenantId, snapshotDate: snapshot.snapshotDate, locationId: source.locationId, productId: product.productId }), 1);
    assert.equal((await db.getRepository(InventoryAgingSnapshot).findOneByOrFail({ inventoryAgingSnapshotId: stored.inventoryAgingSnapshotId })).quantityOnHand, '60.0000');

    const receiptKey = randomUUID();
    const first = await service.receive(draft.stockTransferId, { receiptKey, lines: [{ stockTransferLineId: dispatched.lines[0].stockTransferLineId, quantity: '10' }] }, principal);
    assert.equal(first.transfer.status, 'PART_RECEIVED');
    assert.equal(first.transfer.lines[0].inTransitQuantity, '30.0000');
    assert.equal(first.transfer.lines[0].inTransitValue, '3750.0000');
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: destination.locationId, productId: product.productId })).averageCost, '141.6667');
    const firstAgain = await service.receive(draft.stockTransferId, { receiptKey, lines: [{ stockTransferLineId: dispatched.lines[0].stockTransferLineId, quantity: '10' }] }, principal);
    assert.equal(firstAgain.receiptId, first.receiptId);
    assert.equal(await db.getRepository(StockTransferReceipt).countBy({ tenantId: tenant.tenantId, receiptKey }), 1);
    await assert.rejects(service.receive(draft.stockTransferId, { receiptKey, lines: [{ stockTransferLineId: dispatched.lines[0].stockTransferLineId, quantity: '11' }] }, principal), /different data/i);
    const firstAge = await aging.calculateCurrentAging(principal, { locationId: Number(destination.locationId), productId: Number(product.productId) });
    assert.equal(firstAge.rows[0].composition[0].agingDate, '2026-06-01');
    assert.equal(firstAge.rows[0].composition[0].quantity, '10.0000');
    assert.equal(firstAge.rows[0].unknownQty, '20.0000');
    await assert.rejects(service.receive(draft.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: dispatched.lines[0].stockTransferLineId, quantity: '31' }] }, principal), /exceeds remaining/i);
    const final = await service.receive(draft.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: dispatched.lines[0].stockTransferLineId, quantity: '30' }] }, principal);
    assert.equal(final.transfer.status, 'RECEIVED');
    assert.equal(final.transfer.lines[0].inTransitQuantity, '0.0000');
    assert.equal(final.transfer.lines[0].inTransitValue, '0.0000');
    assert.equal(final.transfer.lines[0].transferValue, '5000.0000');
    assert.equal((await service.receive(draft.stockTransferId, { receiptKey, lines: [{ stockTransferLineId: dispatched.lines[0].stockTransferLineId, quantity: '10' }] }, principal)).transfer.status, 'PART_RECEIVED', 'a retry returns its committed response snapshot after later receipts');
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: destination.locationId, productId: product.productId })).quantityOnHand, '60.0000');
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: destination.locationId, productId: product.productId })).averageCost, '133.3334');
    assert.equal(await db.getRepository(InventoryLedger).countBy({ tenantId: tenant.tenantId, movementType: 'TRANSFER_IN' }), 2);
    assert.equal((await aging.calculateCurrentAging(principal, { locationId: Number(destination.locationId), productId: Number(product.productId) })).rows[0].unknownQty, '20.0000');
    const insufficient = await service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(product.productId), quantity: '1000' }] }, principal);
    await assert.rejects(service.dispatch(insufficient.stockTransferId, { dispatchKey: randomUUID() }, principal), /Insufficient source stock/);
    assert.equal((await db.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: insufficient.stockTransferId })).status, 'DRAFT');
    assert.equal((await db.getRepository(StockTransferAgeAllocation).countBy({ stockTransferLineId: insufficient.lines[0].stockTransferLineId })), 0);
    await service.cancel(insufficient.stockTransferId, principal);
    assert.equal((await db.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: insufficient.stockTransferId })).status, 'CANCELLED');
    await assert.rejects(service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(source.locationId), lines: [{ productId: Number(product.productId), quantity: '1' }] }, principal), /different locations/);

    const rollbackDraft = await service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(product.productId), quantity: '5' }] }, principal);
    await q.query("CREATE TRIGGER trf_fail_dispatch BEFORE INSERT ON tbl_inventory_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected dispatch failure'");
    try { await assert.rejects(service.dispatch(rollbackDraft.stockTransferId, { dispatchKey: randomUUID() }, principal), /injected dispatch failure/); }
    finally { await q.query('DROP TRIGGER trf_fail_dispatch'); }
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: source.locationId, productId: product.productId })).quantityOnHand, '60.0000');
    assert.equal((await db.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: rollbackDraft.stockTransferId })).status, 'DRAFT');
    assert.equal(await db.getRepository(StockTransferAgeAllocation).countBy({ stockTransferLineId: rollbackDraft.lines[0].stockTransferLineId }), 0);
    assert.equal(await db.getRepository(InventoryLedger).countBy({ sourceDocumentType: 'STOCK_TRANSFER', sourceDocumentId: rollbackDraft.stockTransferId }), 0);

    const ready = await service.dispatch(rollbackDraft.stockTransferId, { dispatchKey: randomUUID() }, principal);
    await q.query("CREATE TRIGGER trf_fail_receipt BEFORE INSERT ON tbl_inventory_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected receipt failure'");
    try { await assert.rejects(service.receive(ready.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: ready.lines[0].stockTransferLineId, quantity: '5' }] }, principal), /injected receipt failure/); }
    finally { await q.query('DROP TRIGGER trf_fail_receipt'); }
    assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: destination.locationId, productId: product.productId })).quantityOnHand, '60.0000');
    assert.equal((await db.getRepository(StockTransferLine).findOneByOrFail({ stockTransferLineId: ready.lines[0].stockTransferLineId })).receivedQuantity, '0.0000');
    assert.equal((await db.getRepository(StockTransferAgeAllocation).findOneByOrFail({ stockTransferLineId: ready.lines[0].stockTransferLineId })).receivedQuantity, '0.0000');
    assert.equal((await db.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: ready.stockTransferId })).status, 'DISPATCHED');
    const competing = await Promise.allSettled([
      service.receive(ready.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: ready.lines[0].stockTransferLineId, quantity: '4' }] }, principal),
      service.receive(ready.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: ready.lines[0].stockTransferLineId, quantity: '4' }] }, principal),
    ]);
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1, 'concurrent receipts cannot both consume four of five units');
    assert.equal((await db.getRepository(StockTransferLine).findOneByOrFail({ stockTransferLineId: ready.lines[0].stockTransferLineId })).receivedQuantity, '4.0000');
    await service.receive(ready.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: ready.lines[0].stockTransferLineId, quantity: '1' }] }, principal);
    assert.equal((await db.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: ready.stockTransferId })).status, 'RECEIVED');

    const unknownProduct = await db.getRepository(Product).save(db.getRepository(Product).create({ tenantId: tenant.tenantId, sku: 'UNKNOWN-P', productName: 'Unattributed stock', productType: 'STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true, isStockItem: true, isSellable: true, isPurchasable: false, trackBatch: false, trackExpiry: false, trackSerial: false }));
    for (const location of [source, destination]) await db.getRepository(ProductLocation).save(db.getRepository(ProductLocation).create({ productId: unknownProduct.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false }));
    await db.getRepository(InventoryBalance).save(db.getRepository(InventoryBalance).create({ tenantId: tenant.tenantId, locationId: source.locationId, productId: unknownProduct.productId, quantityOnHand: '10.0000', averageCost: '50.0000' }));
    const unknownDraft = await service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(unknownProduct.productId), quantity: '4' }] }, principal);
    const unknownDispatched = await service.dispatch(unknownDraft.stockTransferId, { dispatchKey: randomUUID() }, principal);
    assert.equal(unknownDispatched.lines[0].ageAllocations[0].originAgingDate, null);
    await service.receive(unknownDraft.stockTransferId, { receiptKey: randomUUID(), lines: [{ stockTransferLineId: unknownDispatched.lines[0].stockTransferLineId, quantity: '2' }] }, principal);
    const unknownDestination = await aging.calculateCurrentAging(principal, { locationId: Number(destination.locationId), productId: Number(unknownProduct.productId) });
    assert.equal(unknownDestination.rows[0].unknownQty, '2.0000');
    assert.equal(unknownDestination.rows[0].attributedQty, '0.0000');
    const mixedProduct = await db.getRepository(Product).save(db.getRepository(Product).create({ tenantId: tenant.tenantId, sku: 'MIXED-AGE-P', productName: 'Mixed age stock', productType: 'STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true, isStockItem: true, isSellable: true, isPurchasable: false, trackBatch: false, trackExpiry: false, trackSerial: false }));
    for (const location of [source, destination]) await db.getRepository(ProductLocation).save(db.getRepository(ProductLocation).create({ productId: mixedProduct.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false }));
    await db.getRepository(InventoryBalance).save(db.getRepository(InventoryBalance).create({ tenantId: tenant.tenantId, locationId: source.locationId, productId: mixedProduct.productId, quantityOnHand: '100.0000', averageCost: '25.0000' }));
    for (const [date, quantity, documentId] of [['2026-08-01', '30', 801], ['2026-09-01', '40', 901]] as const) {
      await ledgerRepo.save(ledgerRepo.create({ tenantId: tenant.tenantId, locationId: source.locationId, productId: mixedProduct.productId,
        movementDate: new Date(`${date}T12:00:00Z`), businessDate: date, movementType: 'ADJI', sourceDocumentType: 'INVENTORY_ADJUSTMENT', sourceDocumentId: documentId, sourceDocumentLineId: documentId,
        quantityIn: quantity, quantityOut: '0', unitCost: '25', movementValue: '25', quantityBefore: '0', quantityAfter: '0', averageCostBefore: '25', averageCostAfter: '25', createdByUserId: user.userId }));
    }
    const mixedDraft = await service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(mixedProduct.productId), quantity: '80' }] }, principal);
    const mixedDispatch = await service.dispatch(mixedDraft.stockTransferId, { dispatchKey: randomUUID() }, principal);
    const persistedMixed = await db.getRepository(StockTransferAgeAllocation).find({ where: { stockTransferLineId: mixedDispatch.lines[0].stockTransferLineId }, order: { stockTransferAgeAllocationId: 'ASC' } });
    assert.deepEqual(persistedMixed.map(row => [row.originAgingDate, row.dispatchedQuantity]), [
      ['2026-08-01', '30.0000'], ['2026-09-01', '40.0000'], [null, '10.0000'],
    ]);
    const multi = await service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [
      { productId: Number(product.productId), quantity: '1' }, { productId: Number(unknownProduct.productId), quantity: '1' },
    ] }, principal);
    await db.getRepository(InventoryBalance).update({ tenantId: tenant.tenantId, locationId: source.locationId, productId: unknownProduct.productId }, { averageCost: '-1.0000' });
    try {
      await assert.rejects(service.dispatch(multi.stockTransferId, { dispatchKey: randomUUID() }, principal), /WAVG cannot be negative/);
      assert.equal((await db.getRepository(InventoryBalance).findOneByOrFail({ locationId: source.locationId, productId: product.productId })).quantityOnHand, '55.0000');
      assert.equal(await db.getRepository(InventoryLedger).countBy({ sourceDocumentType: 'STOCK_TRANSFER', sourceDocumentId: multi.stockTransferId }), 0);
      assert.equal(await db.getRepository(StockTransferAgeAllocation).countBy({ stockTransferLineId: multi.lines[0].stockTransferLineId }), 0);
      assert.equal((await db.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: multi.stockTransferId })).status, 'DRAFT');
    } finally {
      await db.getRepository(InventoryBalance).update({ tenantId: tenant.tenantId, locationId: source.locationId, productId: unknownProduct.productId }, { averageCost: '50.0000' });
    }

    const datedProduct = await db.getRepository(Product).save(db.getRepository(Product).create({ tenantId: tenant.tenantId, sku: 'GRN-DATE-P', productName: 'Dated GRN stock', productType: 'STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true, isStockItem: true, isSellable: true, isPurchasable: false, trackBatch: false, trackExpiry: false, trackSerial: false }));
    await db.getRepository(InventoryBalance).save(db.getRepository(InventoryBalance).create({ tenantId: tenant.tenantId, locationId: source.locationId, productId: datedProduct.productId, quantityOnHand: '50.0000', averageCost: '10.0000' }));
    const postedGrn = await db.getRepository(GoodsReceipt).save(db.getRepository(GoodsReceipt).create({ tenantId: tenant.tenantId, receiptType: 'DIRECT', supplierId: supplier.supplierId, locationId: source.locationId, receiptDate: '2026-01-01', status: 'POSTED', createdByUserId: user.userId, isActive: true }));
    await ledgerRepo.save(ledgerRepo.create({ tenantId: tenant.tenantId, locationId: source.locationId, productId: datedProduct.productId,
      movementDate: new Date('2026-10-07T12:00:00Z'), businessDate: '2026-10-07', movementType: 'GRN', sourceDocumentType: 'GRN', sourceDocumentId: postedGrn.goodsReceiptId, sourceDocumentLineId: 501,
      quantityIn: '50', quantityOut: '0', unitCost: '10', movementValue: '500', quantityBefore: '0', quantityAfter: '50', averageCostBefore: '0', averageCostAfter: '10', createdByUserId: user.userId }));
    assert.equal((await aging.calculateCurrentAging(principal, { locationId: Number(source.locationId), productId: Number(datedProduct.productId) })).rows[0].composition[0].agingDate, '2026-01-01', 'GRN uses receipt date rather than posting date');
    const sourceOnly = { ...principal, accessScope: 'LOCATION', assignedLocationIds: [Number(source.locationId)] };
    await assert.rejects(aging.calculateCurrentAging(sourceOnly, { locationId: Number(destination.locationId) }), /outside your assigned scope/);
    await assert.rejects(service.create({ sourceLocationId: Number(source.locationId), destinationLocationId: Number(destination.locationId), lines: [{ productId: Number(product.productId), quantity: '1' }] }, sourceOnly), /Both transfer locations/);

    await q.release();
  } finally {
    if (db.isInitialized) await db.destroy();
    if (created) await server.query(`DROP DATABASE \`${database}\``);
    await server.end();
  }
});
