/** Explicit local disposable database suite; never writes to DB_DATABASE. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { AddProductSupplierBaselineLeadTime1770000043000 } from '../../migrations/1770000043000-AddProductSupplierBaselineLeadTime';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { Location, LocationType } from '../locations/locations.entity';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Product } from '../products/products.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryAgingService } from '../inventory-aging/inventory-aging.service';
import { ReportInventoryService } from './report-inventory.service';
import { ReportsService } from './reports.service';

test('disposable MySQL: migrated report sources reconcile across views, payments, transit, aging and PO',
  { timeout: 180000 }, async () => {
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local MySQL is required.');
    assert.notEqual(process.env.DB_SYNCHRONIZE, 'true');
    const database = `report_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
    assert.match(database, /^report_test_\d+_[a-f0-9]{8}$/);
    assert.notEqual(database, process.env.DB_DATABASE);
    const options = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD };
    const server = await createConnection(options);
    const db = new DataSource({ type: 'mysql', host: options.host, port: options.port,
      username: options.user, password: options.password, database,
      entities: [__dirname + '/../../**/*.entity.js'], migrations: [__dirname + '/../../migrations/*.js'], synchronize: false });
    let created = false;
    try {
      await server.query(`CREATE DATABASE \`${database}\``); created = true;
      const baseline = await createConnection({ ...options, database, multipleStatements: true });
      try { await baseline.query(await readFile(join(__dirname, '../../../schema/baseline-1770000023000.sql'), 'utf8')); }
      finally { await baseline.end(); }
      await db.initialize();
      await db.runMigrations({ transaction: 'each' });
      const q = db.createQueryRunner();
      assert.ok(await q.hasColumn('tbl_product_supplier', 'baseline_lead_time_days'));
      assert.ok(await q.hasColumn('tbl_invoice_detail', 'cogs_amount'));
      assert.ok(await q.hasTable('tbl_inventory_aging_snapshot'));

      const tenant = await db.getRepository(Tenant).save(db.getRepository(Tenant).create({
        code: `REPORT-${randomBytes(3).toString('hex')}`, name: 'Report fixture', timeZone: 'Asia/Colombo', isActive: true }));
      const user = await db.getRepository(User).save(db.getRepository(User).create({
        tenantId: tenant.tenantId, username: 'report-user', passwordHash: 'unused', isActive: true }));
      const source = await db.getRepository(Location).save(db.getRepository(Location).create({
        tenantId: tenant.tenantId, code: 'SRC', name: 'Source', locationType: LocationType.STORE, isActive: true }));
      const destination = await db.getRepository(Location).save(db.getRepository(Location).create({
        tenantId: tenant.tenantId, code: 'DST', name: 'Destination', locationType: LocationType.STORE, isActive: true }));
      const category = await db.getRepository(Category).save(db.getRepository(Category).create({
        tenantId: tenant.tenantId, categoryCode: 'BAKE', categoryName: 'Baked goods', isActive: true }));
      const unit = await db.getRepository(UnitOfMeasure).save(db.getRepository(UnitOfMeasure).create({
        tenantId: tenant.tenantId, code: 'EA', name: 'Each', symbol: 'ea', unitType: 'COUNT',
        allowsDecimalQuantity: false, quantityPrecision: 0, isActive: true }));
      const product = await db.getRepository(Product).save(db.getRepository(Product).create({
        tenantId: tenant.tenantId, sku: 'BREAD', productName: 'Bread', productType: 'STOCK',
        categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true,
        isStockItem: true, isSellable: true, isPurchasable: true,
        trackBatch: false, trackExpiry: false, trackSerial: false }));
      for (const location of [source, destination]) await db.getRepository(ProductLocation).save(
        db.getRepository(ProductLocation).create({ productId: product.productId,
          locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: true }));
      for (const [location, qty, cost] of [[source, '70', '125'], [destination, '20', '150']] as const)
        await db.getRepository(InventoryBalance).save(db.getRepository(InventoryBalance).create({
          tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId,
          quantityOnHand: qty, averageCost: cost }));
      const insert = async (sql: string, params: unknown[]) => Number((await q.query(sql, params)).insertId);
      const tenantId = tenant.tenantId, sourceId = source.locationId, destinationId = destination.locationId;
      const productId = product.productId, userId = user.userId;
      const invoiceId = await insert(`INSERT INTO tbl_invoice
        (tenant_id, location_id, invoice_number, checkout_key, checkout_fingerprint,
         invoice_date, business_date, sale_type, subtotal, grand_total, payment_status,
         invoice_status, created_by_user_id)
        VALUES (?, ?, 'REPORT-I1', ?, ?, '2026-09-30 12:00:00', '2026-09-30',
          'RETAIL', 100, 90, 'PARTIAL', 'PARTIALLY_REFUNDED', ?)`,
      [tenantId, sourceId, randomUUID(), 'a'.repeat(64), userId]);
      const lineId = await insert(`INSERT INTO tbl_invoice_detail
        (invoice_id, line_number, product_id, sku_snapshot, product_name_snapshot,
         quantity, unit_price, gross_total, net_total, unit_cost_snapshot, cogs_amount)
        VALUES (?, 1, ?, 'BREAD-AT-SALE', 'Bread at sale', 2, 50, 100, 90, 25, 50)`,
      [invoiceId, productId]);
      const refundId = await insert(`INSERT INTO tbl_invoice_refund
        (tenant_id, location_id, invoice_id, refund_number, refund_date, business_date,
         reason, subtotal, refund_total, status, created_by_user_id)
        VALUES (?, ?, ?, 'REPORT-R1', '2026-10-01 12:00:00', '2026-10-01',
          'Return', 45, 45, 'COMPLETED', ?)`, [tenantId, sourceId, invoiceId, userId]);
      await insert(`INSERT INTO tbl_invoice_refund_detail
        (invoice_refund_id, line_number, invoice_detail_id, product_id, quantity,
         unit_price, refund_amount, return_to_stock, original_unit_cost_snapshot, cogs_reversal_amount)
        VALUES (?, 1, ?, ?, 1, 45, 45, 1, 25, 25)`, [refundId, lineId, productId]);
      const cashId = await insert(`INSERT INTO tbl_payment_method
        (tenant_id, payment_method_name, payment_method_type, is_active)
        VALUES (?, 'Cash', 'CASH', 1)`, [tenantId]);
      const cardId = await insert(`INSERT INTO tbl_payment_method
        (tenant_id, payment_method_name, payment_method_type, is_active)
        VALUES (?, 'Card', 'CARD', 1)`, [tenantId]);
      const channelA = await insert(`INSERT INTO tbl_payment_channel
        (tenant_id, code, name, is_active) VALUES (?, 'A', 'Card A', 1)`, [tenantId]);
      const channelB = await insert(`INSERT INTO tbl_payment_channel
        (tenant_id, code, name, is_active) VALUES (?, 'B', 'Card B', 1)`, [tenantId]);
      for (const [methodId, type, channelId, code, name, amount] of [
        [cashId, 'CASH', null, null, null, 20],
        [cardId, 'CARD', channelA, 'A', 'Card A', 30],
        [cardId, 'CARD', channelB, 'B', 'Card B', 40],
      ] as const) await insert(`INSERT INTO tbl_invoice_payment
        (invoice_id, payment_method_id, payment_method_type_snapshot, payment_channel_id,
         payment_channel_code_snapshot, payment_channel_name_snapshot, amount, tendered_amount,
         paid_at, created_by_user_id, is_reversed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01 12:00:00', ?, 0)`,
      [invoiceId, methodId, type, channelId, code, name, amount, amount, userId]);
      const transferId = await insert(`INSERT INTO tbl_stock_transfer
        (tenant_id, transfer_number, source_location_id, destination_location_id,
         status, transfer_date, created_by_user_id)
        VALUES (?, 'REPORT-T1', ?, ?, 'DISPATCHED', '2026-10-01', ?)`,
      [tenantId, sourceId, destinationId, userId]);
      await insert(`INSERT INTO tbl_stock_transfer_line
        (stock_transfer_id, line_number, product_id, unit_id, requested_quantity,
         dispatched_quantity, received_quantity, unit_cost_snapshot, transfer_value)
        VALUES (?, 1, ?, ?, 30, 30, 0, 125, 3750)`, [transferId, productId, unit.unitId]);
      const supplierId = await insert(`INSERT INTO tbl_supplier
        (tenant_id, supplier_code, supplier_name, is_active) VALUES (?, 'SUP', 'Supplier', 1)`, [tenantId]);
      await insert(`INSERT INTO tbl_product_supplier
        (product_id, supplier_id, is_primary_supplier, is_active)
        VALUES (?, ?, 1, 1)`, [productId, supplierId]);
      const leadMigration = new AddProductSupplierBaselineLeadTime1770000043000();
      await leadMigration.down(q);
      await leadMigration.up(q);
      const [existingSupplier] = await q.query(`SELECT baseline_lead_time_days AS leadTime
        FROM tbl_product_supplier WHERE product_id = ? AND supplier_id = ?`, [productId, supplierId]);
      assert.equal(existingSupplier.leadTime, null, 'upgrade retains the existing supplier relation with no fabricated lead time');
      await q.query(`UPDATE tbl_product_supplier SET baseline_lead_time_days = 7
        WHERE product_id = ? AND supplier_id = ?`, [productId, supplierId]);
      const poId = await insert(`INSERT INTO tbl_purchase_order
        (tenant_id, po_number, supplier_id, location_id, order_date, status, created_by_user_id)
        VALUES (?, 'REPORT-PO1', ?, ?, '2026-09-28', 'PART_RECEIVED', ?)`,
      [tenantId, supplierId, sourceId, userId]);
      await insert(`INSERT INTO tbl_purchase_order_line
        (purchase_order_id, product_id, unit_id, conversion_factor_snapshot,
         ordered_qty, received_qty, unit_cost, net_unit_cost, line_total)
        VALUES (?, ?, ?, 2, 100, 60, 10, 10, 1000)`, [poId, productId, unit.unitId]);
      const grnId = await insert(`INSERT INTO tbl_goods_receipt
        (tenant_id, grn_number, receipt_type, purchase_order_id, supplier_id,
         location_id, receipt_date, status, created_by_user_id)
        VALUES (?, 'REPORT-GRN1', 'PO', ?, ?, ?, '2026-10-02', 'POSTED', ?)`,
      [tenantId, poId, supplierId, sourceId, userId]);
      await insert(`INSERT INTO tbl_goods_receipt_line
        (goods_receipt_id, product_id, unit_id, received_qty, unit_cost, net_unit_cost, line_total)
        VALUES (?, ?, ?, 60, 10, 10, 600)`, [grnId, productId, unit.unitId]);

      const principal: any = { tenantId: Number(tenantId), userId: Number(userId),
        roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] };
      const aging = new InventoryAgingService(db);
      const reports = new ReportsService(db, new ReportInventoryService(db, aging));
      const filters = { from: '2026-09-30', to: '2026-10-01', granularity: 'AGGREGATED', groupBy: 'location' };
      const sales = async (view: string) => (await reports.run('sales-analysis', { ...filters, view }, principal)).rows as any[];
      for (const view of ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL']) {
        const rows = await sales(view);
        assert.equal(rows.reduce((sum, row) => sum + Number(row.netSales), 0), 45, view);
        assert.equal(rows.reduce((sum, row) => sum + Number(row.cogs), 0), 25, view);
        assert.equal(rows.reduce((sum, row) => sum + Number(row.gp), 0), 20, view);
      }
      const levelOneItem = (await sales('ITEM_DETAIL'))[0];
      assert.equal(levelOneItem.sku, 'BREAD-AT-SALE');
      assert.equal(levelOneItem.product, 'Bread at sale');
      assert.equal(levelOneItem.brand, null);
      assert.equal(levelOneItem.primarySupplier, 'Supplier');
      assert.deepEqual([levelOneItem.categoryLevel1, levelOneItem.categoryLevel2,
        levelOneItem.categoryLevel3], ['Baked goods', null, null]);
      const docs = await sales('DOCUMENT_DETAIL');
      assert.equal(docs.find(row => row.eventType === 'SALE').costSource, 'SNAPSHOT');
      assert.equal(docs.find(row => row.eventType === 'SALE').sku, 'BREAD-AT-SALE');
      assert.equal(docs.find(row => row.eventType === 'REFUND').cogsReversal, '25.0000');
      const september = await reports.run('sales-analysis', { ...filters, from: '2026-09-30', to: '2026-09-30', view: 'SUMMARY' }, principal);
      const october = await reports.run('sales-analysis', { ...filters, from: '2026-10-01', to: '2026-10-01', view: 'SUMMARY' }, principal);
      assert.equal(Number(september.rows[0].netSales), 90);
      assert.equal(Number(october.rows[0].netSales), -45);
      const paymentFilters = { from: '2026-10-01', to: '2026-10-01', view: 'SUMMARY' };
      const methods = await reports.run('payment-analysis', { ...paymentFilters, groupBy: 'paymentMethod' }, principal);
      const channels = await reports.run('payment-analysis', { ...paymentFilters, groupBy: 'channel' }, principal);
      assert.equal(methods.rows.reduce((sum, row) => sum + Number(row.paymentValue), 0), 90);
      assert.equal(Number(methods.rows.find(row => row.paymentMethod === 'Card')?.paymentValue), 70);
      assert.deepEqual(channels.rows.filter(row => row.paymentMethod === 'Card').map(row => row.paymentValue).sort(), ['30.0000', '40.0000']);
      const position = await reports.run('inventory-position', { view: 'ITEM_DETAIL' }, principal);
      assert.equal(position.rows.reduce((sum, row) => sum + Number(row.stockValue), 0), 11750);
      assert.equal(position.rows.reduce((sum, row) => sum + Number(row.incomingTransitValue), 0), 3750);
      assert.equal(position.rows.reduce((sum, row) => sum + Number(row.companyOwnedValue), 0), 15500);
      const currentAging = await reports.run('inventory-aging', { view: 'ITEM_DETAIL' }, principal);
      assert.equal(currentAging.rows.reduce((sum, row) => sum + Number(row.unknownQty), 0), 90);
      const snapshot = await aging.generateCurrentSnapshot(principal);
      const storedAging = await reports.run('inventory-aging', { view: 'ITEM_DETAIL', snapshotDate: snapshot.snapshotDate }, principal);
      assert.equal(storedAging.rows.reduce((sum, row) => sum + Number(row.unknownQty), 0), 90);
      const replenishment = await reports.run('stock-replenishment', {
        view: 'ITEM_DETAIL', from: '2026-09-30', to: '2026-10-29', targetCoverageDays: '14' }, principal);
      const sourceRow = replenishment.rows.find(row => row.location === 'Source');
      assert.equal(sourceRow?.openPoBaseQty, '80.0000');
      assert.equal(sourceRow?.consumptionQty, '1.0000');
      assert.equal(sourceRow?.leadTimeDays, 7);
      assert.equal(sourceRow?.leadTimeSource, 'SUPPLIER_BASELINE');
      assert.equal(sourceRow?.inventoryPositionQty, '150.0000');
      assert.equal(replenishment.rows.find(row => row.location === 'Destination')?.incomingTransferQty, '30.0000');
      await insert(`INSERT INTO tbl_invoice_detail
        (invoice_id, line_number, product_id, quantity, unit_price, gross_total, net_total)
        VALUES (?, 2, ?, 1, 10, 10, 10)`, [invoiceId, productId]);
      const missingCost = await reports.run('sales-analysis', { ...filters, view: 'SUMMARY' }, principal);
      assert.equal(missingCost.rows[0].cogs, null);
      assert.equal(missingCost.rows[0].gp, null);
      const legacyLineId = await insert(`INSERT INTO tbl_invoice_detail
        (invoice_id, line_number, product_id, quantity, unit_price, gross_total, net_total)
        VALUES (?, 3, ?, 1, 20, 20, 20)`, [invoiceId, productId]);
      await insert(`INSERT INTO tbl_inventory_ledger
        (tenant_id, location_id, product_id, movement_date, movement_type,
         source_document_type, source_document_id, source_document_line_id,
         quantity_in, quantity_out, unit_cost, movement_value,
         quantity_before, quantity_after, average_cost_before, average_cost_after,
         created_by_user_id)
        VALUES (?, ?, ?, '2026-09-30 12:00:00', 'SALE', 'INVOICE', ?, ?,
          0, 1, 8, 8, 71, 70, 125, 125, ?)`,
      [tenantId, sourceId, productId, invoiceId, legacyLineId, userId]);
      const fallback = (await sales('DOCUMENT_DETAIL')).find(row => row.invoiceLineId === String(legacyLineId)
        || Number(row.invoiceLineId) === legacyLineId);
      assert.equal(fallback?.costSource, 'LEDGER_FALLBACK');
      assert.equal(fallback?.cogs, '8.0000');
      const levelTwo = await db.getRepository(Category).save(db.getRepository(Category).create({
        tenantId, parentCategoryId: category.categoryId, categoryCode: 'BREAD', categoryName: 'Bread', isActive: true }));
      const levelThree = await db.getRepository(Category).save(db.getRepository(Category).create({
        tenantId, parentCategoryId: levelTwo.categoryId, categoryCode: 'LOAVES', categoryName: 'Loaves', isActive: true }));
      const brand = await db.getRepository(Brand).save(db.getRepository(Brand).create({
        tenantId, brandCode: 'BAKERY', brandName: 'Bakery Brand', isActive: true }));
      await db.getRepository(Product).update(productId, { categoryId: levelTwo.categoryId, brandId: brand.brandId });
      const levelTwoItem = (await sales('ITEM_DETAIL'))[0];
      assert.deepEqual([levelTwoItem.categoryLevel1, levelTwoItem.categoryLevel2,
        levelTwoItem.categoryLevel3], ['Baked goods', 'Bread', null]);
      await db.getRepository(Product).update(productId, { categoryId: levelThree.categoryId });
      const dimensions = (row: any) => [row.brand, row.primarySupplier,
        row.categoryLevel1, row.categoryLevel2, row.categoryLevel3];
      const expected = ['Bakery Brand', 'Supplier', 'Baked goods', 'Bread', 'Loaves'];
      const itemSources = [
        (await sales('ITEM_DETAIL'))[0],
        (await reports.run('inventory-position', { view: 'ITEM_DETAIL', locationId: String(sourceId) }, principal)).rows[0],
        (await reports.run('inventory-aging', { view: 'ITEM_DETAIL', snapshotDate: snapshot.snapshotDate,
          locationId: String(sourceId) }, principal)).rows[0],
        (await reports.run('stock-replenishment', { view: 'ITEM_DETAIL', locationId: String(sourceId),
          from: '2026-09-30', to: '2026-10-29' }, principal)).rows[0],
        (await reports.run('refunds', { view: 'ITEM_DETAIL', from: '2026-10-01', to: '2026-10-01' }, principal)).rows[0],
        (await reports.run('purchase-orders', { view: 'ITEM_DETAIL', from: '2026-09-28', to: '2026-09-28' }, principal)).rows[0],
        (await reports.run('grn-report', { view: 'ITEM_DETAIL', from: '2026-10-02', to: '2026-10-02' }, principal)).rows[0],
        (await reports.run('supplier-purchases', { view: 'ITEM_DETAIL', from: '2026-10-02', to: '2026-10-02' }, principal)).rows[0],
      ];
      for (const row of itemSources) {
        assert.ok(row, 'each item report has a product row');
        assert.deepEqual(dimensions(row), expected);
        assert.ok(row.sku && row.product && row.location);
      }
      for (const row of itemSources.slice(5)) assert.equal(row.supplier, 'Supplier');
      await q.query(`UPDATE tbl_product_supplier SET is_primary_supplier = 0 WHERE product_id = ?`, [productId]);
      assert.equal((await sales('ITEM_DETAIL'))[0].primarySupplier, null);

      for (let index = 1; index <= 24; index++) {
        const extra = await db.getRepository(Product).save(db.getRepository(Product).create({
          tenantId, sku: `CHART-${String(index).padStart(2, '0')}`, productName: `Chart product ${index}`,
          productType: 'NON_STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId,
          isActive: true, isStockItem: false, isSellable: true, isPurchasable: false,
          trackBatch: false, trackExpiry: false, trackSerial: false }));
        await insert(`INSERT INTO tbl_invoice_detail
          (invoice_id, line_number, product_id, quantity, unit_price, gross_total, net_total)
          VALUES (?, ?, ?, 1, ?, ?, ?)`, [invoiceId, index + 3, extra.productId,
          100 + index, 100 + index, 100 + index]);
      }
      const chartFilters = { from: '2026-09-30', to: '2026-10-01', view: 'SUMMARY',
        granularity: 'AGGREGATED', groupBy: 'product' };
      const page = await reports.run('sales-analysis', { ...chartFilters, page: '2', pageSize: '5' }, principal);
      const all = await reports.run('sales-analysis', { ...chartFilters, all: '1' }, principal);
      const top = await reports.run('sales-analysis', { ...chartFilters, chart: '1' }, principal);
      assert.equal((page as any).rowCount, 25);
      assert.equal(page.rows.length, 5);
      assert.equal(all.rows.length, 25);
      assert.equal(top.rows.length, 10);
      assert.deepEqual(top.rows.map(row => row.sku),
        Array.from({ length: 10 }, (_, index) => `CHART-${String(24 - index).padStart(2, '0')}`));
      assert.deepEqual(top.rows.map(row => Number(row.netSales)),
        Array.from({ length: 10 }, (_, index) => 124 - index));
      const filteredChart = await reports.run('sales-analysis', { ...chartFilters, sku: 'CHART-07', chart: '1' }, principal);
      const filteredTable = await reports.run('sales-analysis', { ...chartFilters, sku: 'CHART-07' }, principal);
      assert.equal(filteredChart.rows.length, 1);
      assert.equal(Number(filteredChart.rows[0].netSales), Number(filteredTable.rows[0].netSales));
      const methodChart = await reports.run('payment-analysis', { ...paymentFilters,
        granularity: 'AGGREGATED', groupBy: 'paymentMethod', chart: '1' }, principal);
      assert.deepEqual(methodChart.rows.map(row => [row.paymentMethod, Number(row.paymentValue)]),
        [['Card', 70], ['Cash', 20]]);
      const channelChart = await reports.run('payment-analysis', { ...paymentFilters,
        granularity: 'AGGREGATED', groupBy: 'channel', chart: '1' }, principal);
      assert.equal(channelChart.rows.length, 3);
      const refundChart = await reports.run('refunds', { from: '2026-10-01', to: '2026-10-01',
        view: 'SUMMARY', granularity: 'AGGREGATED', groupBy: 'product', chart: '1' }, principal);
      assert.equal(Number(refundChart.rows[0].refundValue), 45);
    } finally {
      if (db.isInitialized) await db.destroy();
      if (created) await server.query(`DROP DATABASE \`${database}\``);
      await server.end();
    }
  });
