/** Rollback-only export fixture on the explicitly approved disposable MySQL 8 database. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import applicationDataSource from '../../data-source';
import { ProductMasterExportService, ITEM_MASTER_HEADERS, parseItemMasterQuery } from './product-master-export.service';

test('product master export resolves real MySQL pricing, supplier, barcode, scopes and transit without persisting fixtures', {timeout: 60000}, async () => {
  assert.equal(process.env.DB_DATABASE, 'dev_erp_product_import_test');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''));
  const db = await applicationDataSource.initialize();
  try {
    const [{ databaseName, version }] = await db.query('SELECT DATABASE() AS databaseName, VERSION() AS version');
    assert.equal(databaseName, 'dev_erp_product_import_test');
    assert.match(version, /^8\./);
    const marker = 'ROLLBACK_ITEM_MASTER_FIXTURE';
    const sku = `EXPORT-${randomUUID().slice(0, 8)}`;
    try {
      await db.transaction(async manager => {
        const insert = async (sql: string, params: unknown[]) => Number((await manager.query(sql, params)).insertId);
        const tenantId = 5;
        const locations: Array<{location_id: number}> = await manager.query('SELECT location_id FROM tbl_location WHERE tenant_id = ? AND is_active = 1 ORDER BY location_id LIMIT 2', [tenantId]);
        const units: Array<{unit_id: number; name: string}> = await manager.query('SELECT unit_id, name FROM tbl_unit_of_measure WHERE tenant_id = ? AND is_active = 1 ORDER BY unit_id LIMIT 2', [tenantId]);
        const [supplier] = await manager.query('SELECT supplier_id, supplier_code FROM tbl_supplier WHERE tenant_id = ? AND is_active = 1 LIMIT 1', [tenantId]);
        const [user] = await manager.query('SELECT user_id FROM tbl_user WHERE tenant_id = ? LIMIT 1', [tenantId]);
        assert.equal(locations.length, 2); assert.equal(units.length, 2); assert.ok(supplier && user);
        const [a, b] = locations.map(row => Number(row.location_id));
        const [each, pack] = units.map(row => Number(row.unit_id));
        const root = await insert('INSERT INTO tbl_category (tenant_id, category_code, category_name, is_active) VALUES (?,?,?,1)', [tenantId, `${sku}-ROOT`, 'EXPORT ROOT']);
        const level2 = await insert('INSERT INTO tbl_category (tenant_id, parent_category_id, category_code, category_name, is_active) VALUES (?,?,?,?,1)', [tenantId, root, `${sku}-L2`, 'EXPORT L2']);
        const level3 = await insert('INSERT INTO tbl_category (tenant_id, parent_category_id, category_code, category_name, is_active) VALUES (?,?,?,?,1)', [tenantId, level2, `${sku}-L3`, 'EXPORT L3']);
        const productId = await insert(`INSERT INTO tbl_product (tenant_id, sku, product_name, product_type, category_id, base_unit_id, is_active, is_sellable, is_purchasable, is_stock_item)
          VALUES (?,?,?,?,?,?,1,1,1,1)`, [tenantId, sku, 'Export, "test"', 'STOCK', level3, each]);
        const baseUnitId = await insert(`INSERT INTO tbl_product_unit (product_id, unit_id, conversion_factor, is_base_unit, is_sales_unit, is_purchase_unit, is_active)
          VALUES (?,?,1,1,1,0,1)`, [productId, each]);
        const packUnitId = await insert(`INSERT INTO tbl_product_unit (product_id, unit_id, conversion_factor, is_base_unit, is_sales_unit, is_purchase_unit, is_active)
          VALUES (?,?,24,0,0,1,1)`, [productId, pack]);
        await manager.query('INSERT INTO tbl_product_location (product_id, location_id, is_active, is_sellable, is_purchasable) VALUES (?,?,1,0,1)', [productId, a]);
        const listId = await insert(`INSERT INTO tbl_price_list (tenant_id, code, name, price_list_type, currency_code, is_default, is_active) VALUES (?,?,?,?,?,0,1)`, [tenantId, sku, sku, 'RETAIL', 'LKR']);
        const priceId = await insert(`INSERT INTO tbl_price_list_item (tenant_id, price_list_id, product_id, unit_id, product_unit_id, selling_price, currency_code, minimum_quantity, effective_from, is_active)
          VALUES (?,?,?,?,?,1000,'LKR',1,'2026-01-01',1)`, [tenantId, listId, productId, each, baseUnitId]);
        await manager.query(`INSERT INTO tbl_price_list_item (tenant_id, price_list_id, product_id, unit_id, product_unit_id, selling_price, currency_code, minimum_quantity, effective_from, is_active)
          VALUES (?,?,?,?,?,800,'LKR',12,'2026-01-01',1), (?,?,?,?,?,700,'LKR',1,'2099-01-01',1)`, [tenantId,listId,productId,each,baseUnitId,tenantId,listId,productId,each,baseUnitId]);
        await manager.query(`INSERT INTO tbl_price_list_item_discount (tenant_id, price_list_item_id, discount_type, discount_value, effective_from, is_active, created_by)
          VALUES (?,?,'PERCENTAGE',10,'2026-01-01',1,?)`, [tenantId, priceId, user.user_id]);
        const linkId = await insert('INSERT INTO tbl_product_supplier (product_id, supplier_id, is_primary_supplier, is_active) VALUES (?,?,1,1)', [productId, supplier.supplier_id]);
        const supplierUnitId = await insert('INSERT INTO tbl_product_supplier_unit (product_supplier_id, product_unit_id, is_default_purchase_unit, is_active) VALUES (?,?,1,1)', [linkId, packUnitId]);
        await manager.query(`INSERT INTO tbl_product_supplier_price (product_supplier_unit_id, purchase_price, currency_code, minimum_quantity, effective_from, is_active)
          VALUES (?,2400,'LKR',1,'2026-01-01',1), (?,1900,'LKR',12,'2026-01-01',1)`, [supplierUnitId, supplierUnitId]);
        const [existingType] = await manager.query("SELECT identifier_type_id FROM tbl_identifier_type WHERE code = 'BARCODE' LIMIT 1");
        const barcodeTypeId = existingType?.identifier_type_id ?? await insert("INSERT INTO tbl_identifier_type (code, name, is_active) VALUES ('BARCODE','Barcode',1)", []);
        await manager.query('INSERT INTO tbl_product_identifier (tenant_id, product_id, identifier_type_id, identifier_value, normalized_identifier_value, is_primary, is_active) VALUES (?,?,?,?,?,1,1)', [tenantId,productId,barcodeTypeId,'00123450001','00123450001']);
        await manager.query('INSERT INTO tbl_inventory_balance (tenant_id, location_id, product_id, quantity_on_hand, average_cost) VALUES (?,?,?,?,?), (?,?,?,?,?)',
          [tenantId,a,productId,100,80,tenantId,b,productId,50,100]);
        const transferId = await insert(`INSERT INTO tbl_stock_transfer (tenant_id, transfer_number, source_location_id, destination_location_id, status, transfer_date, created_by_user_id)
          VALUES (?,?,?,?,'PART_RECEIVED','2026-01-01',?)`, [tenantId, sku, a, b, user.user_id]);
        const lineId = await insert(`INSERT INTO tbl_stock_transfer_line (stock_transfer_id, line_number, product_id, unit_id, requested_quantity, dispatched_quantity, received_quantity, unit_cost_snapshot, transfer_value)
          VALUES (?,1,?,?,20,20,10,90,1800)`, [transferId,productId,each]);
        const receiptId = await insert(`INSERT INTO tbl_stock_transfer_receipt (tenant_id, stock_transfer_id, receipt_key, request_fingerprint, received_business_date, received_at, received_by_user_id)
          VALUES (?,?,?,?,'2026-01-01',NOW(),?)`, [tenantId,transferId,randomUUID(),'0'.repeat(64),user.user_id]);
        await manager.query('INSERT INTO tbl_stock_transfer_receipt_line (stock_transfer_receipt_id, stock_transfer_line_id, received_quantity, received_value) VALUES (?,?,10,900)', [receiptId,lineId]);
        const service = new ProductMasterExportService(db);
        const principal = {tenantId, accessScope:'TENANT', assignedLocationIds:[]} as any;
        const exportInTransaction = (raw: Record<string,string>) => (service as any).build(manager, principal, parseItemMasterQuery(raw));
        const tenant = await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku});
        assert.equal(tenant.csv.split('\r\n').length, 2);
        const parse = (line: string) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replace(/""/g,'"'));
        const headers = parse(tenant.csv.split('\r\n')[0].slice(1));
        const values = parse(tenant.csv.split('\r\n')[1]);
        assert.deepEqual(headers, [...ITEM_MASTER_HEADERS]); assert.equal(values.length, 24);
        assert.equal(values[0], sku); assert.equal(values[1], 'Export, "test"');
        assert.deepEqual(values.slice(2,5), ['EXPORT ROOT','EXPORT L2','EXPORT L3']);
        assert.equal(values[5], 'Yes'); assert.equal(values[8], '1000.0000');
        assert.equal(values[11], '100.00'); assert.equal(values[12], '10.00');
        assert.equal(values[15], '86.8750');
        assert.equal(values[17], supplier.supplier_code); assert.equal(values[20], '2400.0000');
        assert.equal(Number(values[21]), 24); assert.equal(values[22], '00123450001');
        const location = await exportInTransaction({scope:'LOCATION',priceListId:String(listId),locationId:String(a),search:sku});
        assert.equal(parse(location.csv.split('\r\n')[1])[15], '80.0000');
        assert.equal((await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku,status:'inactive'})).csv.split('\r\n').length, 1);
        assert.equal((await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku,categoryId:String(level3)})).csv.split('\r\n').length, 2);
        assert.equal((await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku,categoryId:String(root)})).csv.split('\r\n').length, 1);
        const other = await exportInTransaction({scope:'LOCATION',priceListId:String(listId),locationId:String(b),search:sku});
        assert.equal(other.csv.split('\r\n').length, 1, 'Unassigned location must not export the product');
        await manager.query("UPDATE tbl_price_list_item_discount SET discount_type = 'FIXED_AMOUNT', discount_value = 150 WHERE price_list_item_id = ?", [priceId]);
        const fixed = parse((await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku})).csv.split('\r\n')[1]);
        assert.equal(fixed[11], '150.00'); assert.equal(fixed[12], '15.00');
        await manager.query('UPDATE tbl_product_supplier SET is_active = 0 WHERE product_supplier_id = ?', [linkId]);
        const inactiveSupplier = parse((await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku})).csv.split('\r\n')[1]);
        assert.equal(inactiveSupplier[5], 'Yes'); assert.equal(inactiveSupplier[20], '');
        await manager.query("UPDATE tbl_stock_transfer SET status = 'CANCELLED' WHERE stock_transfer_id = ?", [transferId]);
        const noTransit = parse((await exportInTransaction({scope:'TENANT',priceListId:String(listId),search:sku})).csv.split('\r\n')[1]);
        assert.equal(noTransit[15], '86.6667');
        await manager.query('UPDATE tbl_inventory_balance SET quantity_on_hand = 0 WHERE tenant_id = ? AND product_id = ? AND location_id = ?', [tenantId,productId,a]);
        const zeroLocation = parse((await exportInTransaction({scope:'LOCATION',priceListId:String(listId),locationId:String(a),search:sku})).csv.split('\r\n')[1]);
        assert.equal(zeroLocation[15], '');
        const noBalanceSku = `${sku}-NO-BALANCE`;
        const noBalanceId = await insert(`INSERT INTO tbl_product (tenant_id, sku, product_name, product_type, category_id, base_unit_id, is_active, is_sellable, is_purchasable, is_stock_item)
          VALUES (?,?,?,?,?,?,0,0,1,1)`, [tenantId,noBalanceSku,'No balance','STOCK',root,each]);
        await manager.query('INSERT INTO tbl_product_location (product_id, location_id, is_active, is_sellable, is_purchasable) VALUES (?,?,1,0,1)', [noBalanceId,a]);
        const noBalance = parse((await exportInTransaction({scope:'LOCATION',priceListId:String(listId),locationId:String(a),search:noBalanceSku,status:'inactive'})).csv.split('\r\n')[1]);
        assert.equal(noBalance[0], noBalanceSku); assert.equal(noBalance[15], ''); assert.equal(noBalance[16], 'Inactive');
        const batchPrefix = `EXPORT-BATCH-${randomUUID().slice(0, 8)}`;
        const batchParams: unknown[] = [];
        const placeholders = Array.from({length: 501}, (_, index) => {
          batchParams.push(tenantId, `${batchPrefix}-${String(index).padStart(4, '0')}`, `Batch ${index}`, 'STOCK', root, each);
          return '(?,?,?,?,?,?,1,0,0,0)';
        });
        await manager.query(`INSERT INTO tbl_product (tenant_id, sku, product_name, product_type, category_id, base_unit_id, is_active, is_sellable, is_purchasable, is_stock_item)
          VALUES ${placeholders.join(',')}`, batchParams);
        const chunks: string[] = [];
        await (service as any).build(manager, principal, parseItemMasterQuery({scope:'TENANT',priceListId:String(listId),search:batchPrefix}), async (chunk: string) => { chunks.push(chunk); });
        assert.equal(chunks.length, 3, 'Header and two bounded product batches are streamed');
        const streamed = chunks.join('').trimEnd().split('\r\n');
        assert.equal(streamed.length, 502);
        assert.equal(new Set(streamed.slice(1).map(row => parse(row)[0])).size, 501);
        throw new Error(marker);
      });
    } catch (error) { if (!(error instanceof Error) || error.message !== marker) throw error; }
    const [remaining] = await db.query('SELECT COUNT(*) AS count FROM tbl_product WHERE sku = ?', [sku]);
    assert.equal(Number(remaining.count), 0);
    const service = new ProductMasterExportService(db);
    const [ownLocation] = await db.query('SELECT location_id FROM tbl_location WHERE tenant_id = 5 AND is_active = 1 LIMIT 1');
    const [otherLocation] = await db.query('SELECT location_id FROM tbl_location WHERE tenant_id <> 5 AND is_active = 1 LIMIT 1');
    const [ownList] = await db.query('SELECT price_list_id FROM tbl_price_list WHERE tenant_id = 5 AND is_active = 1 LIMIT 1');
    const [otherList] = await db.query('SELECT price_list_id FROM tbl_price_list WHERE tenant_id <> 5 AND is_active = 1 LIMIT 1');
    const scoped = {tenantId:5, accessScope:'LOCATION', assignedLocationIds:[Number(ownLocation.location_id)]} as any;
    const options = await service.options(scoped);
    assert.equal(options.canTenantExport, false);
    assert.deepEqual(options.locations.map(row => Number(row.locationId)), [Number(ownLocation.location_id)]);
    await assert.rejects(service.export(scoped, {scope:'LOCATION',priceListId:String(ownList.price_list_id),locationId:String(otherLocation.location_id)}), /access to this location/i);
    await assert.rejects(service.export({tenantId:5,accessScope:'TENANT',assignedLocationIds:[]} as any,
      {scope:'TENANT',priceListId:String(otherList.price_list_id)}), /price list was not found/i);
  } finally { await db.destroy(); }
});
