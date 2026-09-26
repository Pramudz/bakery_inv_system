/** Explicit configured-local-MySQL validation. Test data is enclosed in outer rollback transactions. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import applicationDataSource from '../../data-source';
import { TenantPrincipal } from '../auth/auth.types';
import { Category } from '../categories/categories.entity';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryAgeLayerService } from '../inventory-age-layers/inventory-age-layer.service';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { Location, LocationType } from '../locations/locations.entity';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { Tenant } from '../tenants/tenant.entity';
import { TenantsService } from '../tenants/tenants.service';
import { UnitOfMeasure } from '../units/units.entity';
import { User } from '../users/user.entity';
import { InventoryAdjustmentLine } from './inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from './inventory-adjustment-reason.entity';
import { InventoryAdjustment } from './inventory-adjustment.entity';
import { InventoryAdjustmentReasonsService, SYSTEM_ADJUSTMENT_REASONS } from './inventory-adjustment-reasons.service';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

test('configured local MySQL: inventory adjustment migration and posting integration', { timeout: 120000 }, async t => {
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? '')) throw new Error('This suite only permits a local MySQL host.');
  if (process.env.DB_SYNCHRONIZE === 'true') throw new Error('DB_SYNCHRONIZE must remain disabled for migration validation.');
  if (!process.env.DB_DATABASE) throw new Error('DB_DATABASE is required.');
  const ds = applicationDataSource;
  await ds.initialize();
  let unique = Date.now();
  const baseline = await inventoryTotals(ds.manager);

  const withRollback = async (name: string, run: (manager: EntityManager, bundle: ReturnType<typeof services>) => Promise<void>) => {
    await t.test(name, async () => {
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try { await run(runner.manager, services(runner.manager)); }
      finally { await runner.rollbackTransaction(); await runner.release(); }
    });
  };

  try {
    await t.test('physical schema, DECIMAL columns, indexes, foreign keys and existing-tenant seeds', async t => {
      const db = process.env.DB_DATABASE!;
      const tables: Array<{ tableName: string }> = await ds.query(`SELECT table_name tableName FROM information_schema.tables WHERE table_schema=? AND table_name IN ('tbl_inventory_adjustment_reason','tbl_inventory_adjustment','tbl_inventory_adjustment_line') ORDER BY table_name`, [db]);
      assert.deepEqual(tables.map(row => row.tableName), ['tbl_inventory_adjustment', 'tbl_inventory_adjustment_line', 'tbl_inventory_adjustment_reason']);
      const columns: Array<{ tableName: string; columnName: string; columnType: string; nullable: string }> = await ds.query(`
        SELECT table_name tableName,column_name columnName,column_type columnType,is_nullable nullable
        FROM information_schema.columns WHERE table_schema=? AND (
          (table_name='tbl_inventory_adjustment_line' AND column_name IN ('quantity','conversion_factor_snapshot','base_quantity','unit_cost','inventory_value','quantity_before','quantity_after')) OR
          (table_name='tbl_inventory_balance' AND column_name IN ('quantity_on_hand','average_cost')) OR
          (table_name='tbl_inventory_ledger' AND column_name='inventory_adjustment_reason_id'))
        ORDER BY table_name,ordinal_position`, [db]);
      const types = new Map(columns.map(row => [`${row.tableName}.${row.columnName}`, row.columnType]));
      for (const name of ['quantity', 'base_quantity', 'unit_cost', 'inventory_value', 'quantity_before', 'quantity_after']) assert.equal(types.get(`tbl_inventory_adjustment_line.${name}`), 'decimal(18,4)');
      assert.equal(types.get('tbl_inventory_adjustment_line.conversion_factor_snapshot'), 'decimal(18,6)');
      assert.equal(types.get('tbl_inventory_balance.quantity_on_hand'), 'decimal(18,4)');
      assert.equal(types.get('tbl_inventory_balance.average_cost'), 'decimal(18,4)');
      assert.equal(columns.find(row => row.columnName === 'inventory_adjustment_reason_id')?.nullable, 'YES');
      const [unbackfilled] = await ds.query(`
        SELECT COUNT(*) AS n
        FROM tbl_inventory_adjustment_line line_row
        INNER JOIN tbl_inventory_adjustment adjustment
          ON adjustment.inventory_adjustment_id = line_row.inventory_adjustment_id
         AND adjustment.status = 'POSTED'
        INNER JOIN tbl_inventory_ledger ledger
          ON ledger.tenant_id = adjustment.tenant_id
         AND ledger.source_document_type = 'INVENTORY_ADJUSTMENT'
         AND ledger.source_document_id = adjustment.inventory_adjustment_id
         AND ledger.source_document_line_id = line_row.inventory_adjustment_line_id
        WHERE line_row.quantity_before IS NULL OR line_row.quantity_after IS NULL
      `);
      assert.equal(Number(unbackfilled.n), 0);
      const indexes: Array<{ tableName: string; indexName: string; nonUnique: number; columnsList: string }> = await ds.query(`
        SELECT table_name tableName,index_name indexName,non_unique nonUnique,GROUP_CONCAT(column_name ORDER BY seq_in_index) columnsList
        FROM information_schema.statistics WHERE table_schema=? AND table_name IN ('tbl_inventory_adjustment_reason','tbl_inventory_adjustment','tbl_inventory_adjustment_line','tbl_inventory_ledger')
        AND (index_name LIKE '%adjustment%' OR index_name='PRIMARY') GROUP BY table_name,index_name,non_unique ORDER BY table_name,index_name`, [db]);
      const indexNames = new Set(indexes.map(row => row.indexName));
      for (const name of ['uq_inventory_adjustment_reason_tenant_code', 'uq_inventory_adjustment_tenant_number', 'idx_inventory_adjustment_tenant_date', 'idx_inventory_adjustment_location_status', 'uq_inventory_adjustment_line_product', 'idx_inventory_ledger_adjustment_reason']) assert.ok(indexNames.has(name), `Missing index ${name}`);
      const foreignKeys: Array<{ constraintName: string }> = await ds.query(`
        SELECT constraint_name constraintName FROM information_schema.key_column_usage
        WHERE table_schema=? AND referenced_table_name IS NOT NULL
        AND (table_name IN ('tbl_inventory_adjustment_reason','tbl_inventory_adjustment','tbl_inventory_adjustment_line') OR constraint_name='fk_inventory_ledger_adjustment_reason')`, [db]);
      const fkNames = new Set(foreignKeys.map(row => row.constraintName));
      for (const name of ['fk_inventory_adjustment_reason_tenant', 'fk_inventory_adjustment_tenant', 'fk_inventory_adjustment_location', 'fk_inventory_adjustment_reason', 'fk_inventory_adjustment_created_user', 'fk_inventory_adjustment_posted_user', 'fk_inventory_adjustment_cancelled_user', 'fk_inventory_adjustment_line_header', 'fk_inventory_adjustment_line_product', 'fk_inventory_adjustment_line_product_unit', 'fk_inventory_ledger_adjustment_reason']) assert.ok(fkNames.has(name), `Missing foreign key ${name}`);
      const seeded: Array<{ tenantId: string; systemCount: string; codes: string }> = await ds.query(`SELECT tenant_id tenantId,SUM(is_system_reason=1) systemCount,GROUP_CONCAT(IF(is_system_reason=1,code,NULL) ORDER BY code) codes FROM tbl_inventory_adjustment_reason GROUP BY tenant_id ORDER BY tenant_id`);
      const tenantCount = await ds.getRepository(Tenant).count();
      assert.equal(seeded.length, tenantCount);
      const expectedCodes = SYSTEM_ADJUSTMENT_REASONS.map(row => row[0]).sort().join(',');
      for (const row of seeded) { assert.equal(Number(row.systemCount), 8); assert.equal(row.codes, expectedCodes); }
      t.diagnostic(JSON.stringify({ database: db, columns, indexes, foreignKeyNames: [...fkNames].sort(), seededTenants: seeded.length }));
    });

    await withRollback('new tenant bootstrap immediately creates eight protected system reasons', async (manager, bundle) => {
      const facade = bundle.dataSource;
      const tenants = new TenantsService(manager.getRepository(Tenant), facade, {} as any);
      const code = `ADJBOOT${++unique}`;
      const result = await tenants.create({ code, name: 'Adjustment Bootstrap Test', isActive: true, timeZone: 'Asia/Colombo' });
      const reasons = await manager.getRepository(InventoryAdjustmentReason).findBy({ tenantId: Number(result.tenant.tenantId), isSystemReason: true });
      assert.equal(reasons.length, 8);
      assert.deepEqual(reasons.map(row => row.code).sort(), SYSTEM_ADJUSTMENT_REASONS.map(row => row[0]).sort());
      assert.ok(reasons.every(row => row.isActive));
    });

    await withRollback('Scenario A: ADJO uses WAVG, writes references and relieves FIFO layer', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 1);
      await stock(manager, f, 0, '100', '500');
      const [oldest, newer] = await layers(manager, f, 0, [['40', '2026-01-01'], ['60', '2026-02-01']]);
      const draft = await create(bundle.adjustments, f, 'ADJO', f.reason.DAMAGE, [{ product: 0, unit: 'base', quantity: '5' }]);
      await bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, f.user);
      const result = await posted(manager, draft);
      assert.equal(result.balance().quantityOnHand, '95.0000');
      assert.equal(result.balance().averageCost, '500.0000');
      assert.equal(result.lines[0].unitCost, '500.0000');
      assert.equal(result.lines[0].inventoryValue, '2500.0000');
      assert.deepEqual([result.lines[0].quantityBefore, result.lines[0].quantityAfter], ['100.0000', '95.0000']);
      assert.equal(result.ledger[0].quantityOut, '5.0000');
      assert.equal(result.ledger[0].movementValue, '2500.0000');
      assert.equal(Number(result.ledger[0].inventoryAdjustmentReasonId), Number(f.reason.DAMAGE.inventoryAdjustmentReasonId));
      assert.equal(Number(result.ledger[0].sourceDocumentLineId), Number(result.lines[0].inventoryAdjustmentLineId));
      assert.equal((result.ledger[0].ageLayerRelief?.allocations ?? [])[0].layerId, oldest.inventoryAgeLayerId);
      assert.equal((await manager.getRepository(InventoryAgeLayer).findOneByOrFail({ inventoryAgeLayerId: oldest.inventoryAgeLayerId })).remainingQuantity, '35.0000');
      assert.equal((await manager.getRepository(InventoryAgeLayer).findOneByOrFail({ inventoryAgeLayerId: newer.inventoryAgeLayerId })).remainingQuantity, '60.0000');
    });

    await withRollback('Scenarios B/C: ADJI uses positive WAVG with positive or zero on-hand and creates inbound layers', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      await stock(manager, f, 0, '100', '500');
      await stock(manager, f, 1, '0', '500');
      const first = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '10' }]);
      const second = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 1, unit: 'base', quantity: '5' }]);
      await bundle.adjustments.post(Number(first.inventoryAdjustmentId), {}, f.user);
      await bundle.adjustments.post(Number(second.inventoryAdjustmentId), {}, f.user);
      const a = await posted(manager, first), b = await posted(manager, second);
      assert.deepEqual([a.balance().quantityOnHand, a.balance().averageCost, a.lines[0].inventoryValue], ['110.0000', '500.0000', '5000.0000']);
      assert.deepEqual([b.balance().quantityOnHand, b.balance().averageCost, b.lines[0].inventoryValue], ['5.0000', '500.0000', '2500.0000']);
      assert.deepEqual([a.lines[0].quantityBefore, a.lines[0].quantityAfter], ['100.0000', '110.0000']);
      assert.deepEqual([b.lines[0].quantityBefore, b.lines[0].quantityAfter], ['0.0000', '5.0000']);
      for (const result of [a, b]) {
        assert.equal(result.lines[0].unitCost, '500.0000');
        assert.equal(result.ledger[0].sourceDocumentType, 'INVENTORY_ADJUSTMENT');
        const inbound = await manager.getRepository(InventoryAgeLayer).findOneByOrFail({ sourceDocumentType: 'INVENTORY_ADJUSTMENT', sourceDocumentId: result.header.inventoryAdjustmentId, sourceDocumentLineId: result.lines[0].inventoryAdjustmentLineId });
        assert.equal(inbound.remainingQuantity, result.lines[0].baseQuantity);
        assert.equal(inbound.originalUnitCost, '500.0000');
        assert.equal(inbound.receiptDate, result.ledger[0].businessDate);
      }
    });

    await withRollback('Scenario D: absent/zero WAVG rejects atomically and NULL WAVG is physically prohibited', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      const missing = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '5' }]);
      await stock(manager, f, 1, '0', '0');
      const zero = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 1, unit: 'base', quantity: '5' }]);
      for (const draft of [missing, zero]) await assert.rejects(() => bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, f.user), /Current WAVG is not available/);
      assert.equal(await manager.getRepository(InventoryBalance).countBy({ tenantId: f.tenantId, productId: f.products[0].productId }), 0);
      assert.equal((await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId: f.tenantId, productId: f.products[1].productId })).quantityOnHand, '0.0000');
      assert.equal(await manager.getRepository(InventoryLedger).countBy({ tenantId: f.tenantId }), 0);
      assert.equal(await manager.getRepository(InventoryAgeLayer).countBy({ tenantId: f.tenantId }), 0);
      for (const draft of [missing, zero]) {
        assert.equal((await manager.getRepository(InventoryAdjustment).findOneByOrFail({ inventoryAdjustmentId: draft.inventoryAdjustmentId })).status, 'DRAFT');
        assert.equal((await manager.getRepository(InventoryAdjustmentLine).findOneByOrFail({ inventoryAdjustmentId: draft.inventoryAdjustmentId })).unitCost, null);
        assert.equal((await manager.getRepository(InventoryAdjustmentLine).findOneByOrFail({ inventoryAdjustmentId: draft.inventoryAdjustmentId })).quantityBefore, null);
      }
      const zeroBalance = await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId: f.tenantId, productId: f.products[1].productId });
      await assert.rejects(() => manager.query('UPDATE tbl_inventory_balance SET average_cost=NULL WHERE inventory_balance_id=?', [zeroBalance.inventoryBalanceId]), /cannot be null/i);
    });

    await withRollback('Scenario E: opening inventory uses explicit manual cost, including intentional zero', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      const valued = await create(bundle.adjustments, f, 'ADJI', f.reason.OPENING_INVENTORY, [{ product: 0, unit: 'base', quantity: '100', unitCost: '450' }]);
      const zero = await create(bundle.adjustments, f, 'ADJI', f.reason.OPENING_INVENTORY, [{ product: 1, unit: 'base', quantity: '5', unitCost: '0' }]);
      await bundle.adjustments.post(Number(valued.inventoryAdjustmentId), {}, f.user);
      await bundle.adjustments.post(Number(zero.inventoryAdjustmentId), {}, f.user);
      const a = await posted(manager, valued), b = await posted(manager, zero);
      assert.deepEqual([a.balance().quantityOnHand, a.balance().averageCost, a.lines[0].unitCost, a.lines[0].inventoryValue], ['100.0000', '450.0000', '450.0000', '45000.0000']);
      assert.deepEqual([b.balance().quantityOnHand, b.balance().averageCost, b.lines[0].unitCost, b.lines[0].inventoryValue], ['5.0000', '0.0000', '0.0000', '0.0000']);
    });

    await withRollback('Scenario F: CASE and decimal ProductUnit conversion persist exact base quantities and values', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      await stock(manager, f, 0, '100', '500'); await layers(manager, f, 0, [['100', '2026-01-01']]);
      await stock(manager, f, 1, '10', '100');
      const out = await create(bundle.adjustments, f, 'ADJO', f.reason.DAMAGE, [{ product: 0, unit: 'case', quantity: '2' }]);
      const incoming = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 1, unit: 'decimal', quantity: '3' }]);
      await bundle.adjustments.post(Number(out.inventoryAdjustmentId), {}, f.user);
      await bundle.adjustments.post(Number(incoming.inventoryAdjustmentId), {}, f.user);
      const a = await posted(manager, out), b = await posted(manager, incoming);
      assert.deepEqual([a.lines[0].quantity, a.lines[0].conversionFactorSnapshot, a.lines[0].baseQuantity, a.lines[0].inventoryValue, a.balance().quantityOnHand], ['2.0000', '24.000000', '48.0000', '24000.0000', '52.0000']);
      assert.deepEqual([b.lines[0].quantity, b.lines[0].conversionFactorSnapshot, b.lines[0].baseQuantity, b.lines[0].inventoryValue, b.balance().quantityOnHand], ['3.0000', '0.500000', '1.5000', '150.0000', '11.5000']);
      assert.deepEqual([a.lines[0].quantityBefore, a.lines[0].quantityAfter], ['100.0000', '52.0000']);
      assert.deepEqual([b.lines[0].quantityBefore, b.lines[0].quantityAfter], ['10.0000', '11.5000']);
    });

    await withRollback('Scenario G: invalid second line rolls back every posting write', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      for (let index = 0; index < 2; index += 1) { await stock(manager, f, index, '10', '100'); await layers(manager, f, index, [['10', '2026-01-01']]); }
      const draft = await create(bundle.adjustments, f, 'ADJO', f.reason.DAMAGE, [{ product: 0, unit: 'base', quantity: '2' }, { product: 1, unit: 'base', quantity: '2' }]);
      f.productUnits[1].base.isActive = false;
      await manager.getRepository(ProductUnit).save(f.productUnits[1].base);
      await assert.rejects(() => bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, f.user), /Product unit is not active/);
      const balances = await manager.getRepository(InventoryBalance).findBy({ tenantId: f.tenantId });
      assert.ok(balances.every(row => row.quantityOnHand === '10.0000'));
      assert.equal(await manager.getRepository(InventoryLedger).countBy({ tenantId: f.tenantId }), 0);
      assert.ok((await manager.getRepository(InventoryAgeLayer).findBy({ tenantId: f.tenantId })).every(row => row.remainingQuantity === '10.0000'));
      assert.equal((await manager.getRepository(InventoryAdjustment).findOneByOrFail({ inventoryAdjustmentId: draft.inventoryAdjustmentId })).status, 'DRAFT');
      assert.ok((await manager.getRepository(InventoryAdjustmentLine).findBy({ inventoryAdjustmentId: draft.inventoryAdjustmentId })).every(row => row.unitCost === null && row.inventoryValue === null));
      assert.ok((await manager.getRepository(InventoryAdjustmentLine).findBy({ inventoryAdjustmentId: draft.inventoryAdjustmentId })).every(row => row.quantityBefore === null && row.quantityAfter === null));
    });

    await withRollback('Scenario H: second posting is rejected without duplicate movement or layer', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 1); await stock(manager, f, 0, '10', '100');
      const draft = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '2' }]);
      await bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, f.user);
      await assert.rejects(() => bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, f.user), /Only draft inventory adjustments can be posted/);
      assert.equal((await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId: f.tenantId, productId: f.products[0].productId })).quantityOnHand, '12.0000');
      assert.equal(await manager.getRepository(InventoryLedger).countBy({ tenantId: f.tenantId, sourceDocumentId: draft.inventoryAdjustmentId }), 1);
      assert.equal(await manager.getRepository(InventoryAgeLayer).countBy({ tenantId: f.tenantId, sourceDocumentType: 'INVENTORY_ADJUSTMENT', sourceDocumentId: draft.inventoryAdjustmentId }), 1);
    });

    await withRollback('Scenario I: negative stock requires confirmation and records unallocated layer relief', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 1); await stock(manager, f, 0, '2', '100'); await layers(manager, f, 0, [['2', '2026-01-01']]);
      const draft = await create(bundle.adjustments, f, 'ADJO', f.reason.DAMAGE, [{ product: 0, unit: 'base', quantity: '5' }]);
      await assert.rejects(() => bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, f.user), /explicitly confirm negative stock/i);
      assert.equal((await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId: f.tenantId, productId: f.products[0].productId })).quantityOnHand, '2.0000');
      assert.equal(await manager.getRepository(InventoryLedger).countBy({ tenantId: f.tenantId }), 0);
      await bundle.adjustments.post(Number(draft.inventoryAdjustmentId), { confirmNegativeStock: true }, f.user);
      const result = await posted(manager, draft);
      assert.equal(result.balance().quantityOnHand, '-3.0000');
      assert.equal(result.balance().averageCost, '100.0000');
      assert.deepEqual([result.lines[0].quantityBefore, result.lines[0].quantityAfter], ['2.0000', '-3.0000']);
      assert.equal(result.ledger[0].ageLayerRelief?.unallocatedQuantity, '3.0000');
      assert.equal(result.ledger[0].ageLayerRelief?.allocations[0].quantity, '2.0000');
    });

    await withRollback('Scenarios J/K: tenant and location access boundaries are enforced', async (manager, bundle) => {
      const first = await fixture(manager, bundle.reasons, 1), second = await fixture(manager, bundle.reasons, 1);
      await stock(manager, second, 0, '10', '100');
      const other = await create(bundle.adjustments, second, 'ADJI', second.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]);
      await assert.rejects(() => bundle.adjustments.get(Number(other.inventoryAdjustmentId), first.user), NotFoundException);
      await assert.rejects(() => create(bundle.adjustments, first, 'ADJI', second.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]), BadRequestException);
      await assert.rejects(() => bundle.adjustments.create({ locationId: Number(second.location.locationId), movementType: 'ADJI', reasonId: Number(first.reason.INVENTORY_CORRECTION.inventoryAdjustmentReasonId), lines: [{ productId: Number(first.products[0].productId), productUnitId: Number(first.productUnits[0].base.productUnitId), quantity: '1' }] }, first.user), NotFoundException);
      await assert.rejects(() => bundle.adjustments.create({ locationId: Number(first.location.locationId), movementType: 'ADJI', reasonId: Number(first.reason.INVENTORY_CORRECTION.inventoryAdjustmentReasonId), lines: [{ productId: Number(second.products[0].productId), productUnitId: Number(second.productUnits[0].base.productUnitId), quantity: '1' }] }, first.user), BadRequestException);
      const draft = await create(bundle.adjustments, first, 'ADJI', first.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]);
      const restricted = { ...first.user, accessScope: 'LOCATION' as const, assignedLocationIds: [] };
      await assert.rejects(() => create(bundle.adjustments, { ...first, user: restricted }, 'ADJI', first.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]), ForbiddenException);
      await assert.rejects(() => bundle.adjustments.update(Number(draft.inventoryAdjustmentId), { remarks: 'blocked' }, restricted), ForbiddenException);
      await assert.rejects(() => bundle.adjustments.post(Number(draft.inventoryAdjustmentId), {}, restricted), ForbiddenException);
    });

    await withRollback('Scenario L: reason direction, active state, system protection and custom reasons', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 1); await stock(manager, f, 0, '10', '100');
      await assert.rejects(() => create(bundle.adjustments, f, 'ADJO', f.reason.OPENING_INVENTORY, [{ product: 0, unit: 'base', quantity: '1', unitCost: '5' }]), /not valid for this movement direction/);
      await assert.rejects(() => create(bundle.adjustments, f, 'ADJI', f.reason.DAMAGE, [{ product: 0, unit: 'base', quantity: '1' }]), /not valid for this movement direction/);
      await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]);
      await create(bundle.adjustments, f, 'ADJO', f.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]);
      await assert.rejects(() => bundle.reasons.update(Number(f.reason.DAMAGE.inventoryAdjustmentReasonId), { name: 'Unsafe' }, f.user), /System adjustment reasons cannot be modified/);
      await assert.rejects(() => bundle.reasons.setActive(Number(f.reason.DAMAGE.inventoryAdjustmentReasonId), { isActive: false }, f.user), /System adjustment reasons cannot be deactivated/);
      const custom = await bundle.reasons.create({ code: `CUSTOM_${++unique}`, name: 'Custom In', allowedDirection: 'IN', costingPolicy: 'CURRENT_WAVG' }, f.user);
      const customDraft = await create(bundle.adjustments, f, 'ADJI', custom, [{ product: 0, unit: 'base', quantity: '1' }]);
      await bundle.adjustments.post(Number(customDraft.inventoryAdjustmentId), {}, f.user);
      assert.equal((await manager.getRepository(InventoryAdjustment).findOneByOrFail({ inventoryAdjustmentId: customDraft.inventoryAdjustmentId })).status, 'POSTED');
      const inactive = await bundle.reasons.create({ code: `INACTIVE_${++unique}`, name: 'Inactive', allowedDirection: 'IN', costingPolicy: 'CURRENT_WAVG' }, f.user);
      await bundle.reasons.setActive(Number(inactive.inventoryAdjustmentReasonId), { isActive: false }, f.user);
      await assert.rejects(() => create(bundle.adjustments, f, 'ADJI', inactive, [{ product: 0, unit: 'base', quantity: '1' }]), /not active/);
    });

    await withRollback('Scenario M: frontend product context and reason pagination are tenant/location scoped', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      await stock(manager, f, 0, '0', '500');
      const contexts = await bundle.adjustments.productContexts(f.user, { locationId: Number(f.location.locationId), page: 1, limit: 20, search: 'adjustment product' });
      assert.equal(contexts.total, 2);
      assert.equal(contexts.items[0].productUnits.length, 3);
      const retained = contexts.items.find(row => row.productId === Number(f.products[0].productId));
      assert.deepEqual([retained?.quantityOnHand, retained?.averageCost, retained?.hasInventoryBalance], ['0.0000', '500.0000', true]);
      const missing = await bundle.adjustments.productContexts(f.user, { locationId: Number(f.location.locationId), page: 1, limit: 20, search: '', productId: Number(f.products[1].productId) });
      assert.deepEqual([missing.items[0].quantityOnHand, missing.items[0].averageCost, missing.items[0].hasInventoryBalance], ['0.0000', null, false]);
      const availableLocations = await bundle.adjustments.locations(f.user);
      assert.deepEqual(availableLocations.map(row => row.locationId), [Number(f.location.locationId)]);
      assert.deepEqual(await bundle.adjustments.locations({ ...f.user, accessScope: 'LOCATION', assignedLocationIds: [] }), []);
      const paged = await bundle.reasons.list(f.user, '', 'true', { page: '1', limit: '20', search: 'opening', system: 'true' });
      assert.ok(!Array.isArray(paged));
      if (!Array.isArray(paged)) {
        assert.equal(paged.total, 1);
        assert.equal(paged.items[0].code, 'OPENING_INVENTORY');
      }
      const legacy = await bundle.reasons.list(f.user, 'IN', 'true');
      assert.ok(Array.isArray(legacy));
      assert.ok(legacy.some(row => row.code === 'INVENTORY_CORRECTION'));
    });

    await withRollback('Scenario N: list audit fields, signed aggregates, pagination and immutable snapshots', async (manager, bundle) => {
      const f = await fixture(manager, bundle.reasons, 2);
      await stock(manager, f, 0, '100', '500');
      await stock(manager, f, 1, '10', '100');
      await layers(manager, f, 0, [['100', '2026-01-01']]);
      const incoming = await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [
        { product: 0, unit: 'base', quantity: '2' },
        { product: 1, unit: 'base', quantity: '3' },
      ]);
      await bundle.adjustments.post(Number(incoming.inventoryAdjustmentId), {}, f.user);
      const outgoing = await create(bundle.adjustments, f, 'ADJO', f.reason.DAMAGE, [{ product: 0, unit: 'base', quantity: '1' }]);
      await bundle.adjustments.post(Number(outgoing.inventoryAdjustmentId), {}, f.user);
      for (let index = 0; index < 19; index += 1)
        await create(bundle.adjustments, f, 'ADJI', f.reason.INVENTORY_CORRECTION, [{ product: 0, unit: 'base', quantity: '1' }]);

      const filters = { limit: 20, search: '', status: '', movementType: '', reasonId: undefined, locationId: undefined, dateFrom: undefined, dateTo: undefined };
      const firstPage = await bundle.adjustments.list(f.user, { ...filters, page: 1 });
      const secondPage = await bundle.adjustments.list(f.user, { ...filters, page: 2 });
      assert.deepEqual([firstPage.total, firstPage.totalPages, firstPage.items.length, secondPage.items.length], [21, 2, 20, 1]);
      const rows = [...firstPage.items, ...secondPage.items];
      const inRow = rows.find(row => Number(row.inventoryAdjustmentId) === Number(incoming.inventoryAdjustmentId))!;
      const outRow = rows.find(row => Number(row.inventoryAdjustmentId) === Number(outgoing.inventoryAdjustmentId))!;
      assert.deepEqual([inRow.createdByName, inRow.postedByName, inRow.lineCount, inRow.valueImpact], [f.user.username, f.user.username, 2, '1300.0000']);
      assert.deepEqual([outRow.createdByName, outRow.postedByName, outRow.lineCount, outRow.valueImpact], [f.user.username, f.user.username, 1, '-500.0000']);
      const draftRow = rows.find(row => row.status === 'DRAFT')!;
      assert.equal(draftRow.postedByName, null);
      assert.equal(draftRow.valueImpact, null);

      const incomingLine = await manager.getRepository(InventoryAdjustmentLine).findOneByOrFail({ inventoryAdjustmentId: incoming.inventoryAdjustmentId, productId: f.products[0].productId });
      assert.deepEqual([incomingLine.quantityBefore, incomingLine.quantityAfter], ['100.0000', '102.0000']);
      const restricted = await bundle.adjustments.list({ ...f.user, accessScope: 'LOCATION', assignedLocationIds: [] }, { ...filters, page: 1 });
      assert.equal(restricted.total, 0);
    });
  } finally {
    assert.deepEqual(await inventoryTotals(ds.manager), baseline, 'Integration test DML must leave configured development inventory unchanged.');
    await ds.destroy();
  }
});

function services(manager: EntityManager) {
  const dataSource = {
    transaction: <T>(run: (nested: EntityManager) => Promise<T>) => manager.transaction(run),
    getRepository: <T extends ObjectLiteral>(entity: EntityTarget<T>) => manager.getRepository(entity),
    manager,
  } as unknown as DataSource;
  const reasons = new InventoryAdjustmentReasonsService(dataSource);
  return {
    dataSource,
    reasons,
    adjustments: new InventoryAdjustmentsService(dataSource, new InventoryBalanceService(), new InventoryLedgerService(), new InventoryAgeLayerService(), new NumberSequencesService(), reasons),
  };
}

let seedCounter = 0;
async function seed<T extends ObjectLiteral>(manager: EntityManager, entity: EntityTarget<T>, supplied: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const column of manager.connection.getMetadata(entity).columns) {
    if (column.isNullable || column.isGenerated || column.isCreateDate || column.isUpdateDate || column.default !== undefined) continue;
    values[column.propertyName] = ['bigint', 'int', 'decimal', 'tinyint'].includes(String(column.type)) ? 1 : column.type === 'date' ? '2026-09-01' : column.type === 'datetime' ? new Date('2026-09-01T00:00:00Z') : `test${++seedCounter}`;
  }
  const repository = manager.getRepository(entity);
  return repository.save(repository.create({ ...values, ...supplied } as any) as unknown as T);
}

async function fixture(manager: EntityManager, reasonService: InventoryAdjustmentReasonsService, productCount: number) {
  const suffix = `${Date.now()}_${++seedCounter}`;
  const tenant = await seed(manager, Tenant, { code: `ADJ_${suffix}`, name: `Adjustment Test ${suffix}`, timeZone: 'Asia/Colombo', isActive: true });
  const tenantId = Number(tenant.tenantId);
  const userRow = await seed(manager, User, { tenantId, username: `adj_user_${suffix}`, passwordHash: 'test', isActive: true });
  const user: TenantPrincipal = { scope: 'TENANT', tenantId, userId: Number(userRow.userId), username: userRow.username, roleId: 1, roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] };
  const location = await seed(manager, Location, { tenantId, code: `LOC_${suffix}`, name: 'Adjustment Warehouse', locationType: LocationType.WAREHOUSE, isActive: true });
  const category = await seed(manager, Category, { tenantId, categoryCode: `CAT_${suffix}`, categoryName: 'Adjustment Products', isActive: true });
  const ea = await seed(manager, UnitOfMeasure, { tenantId, code: `EA${seedCounter}`, name: 'Each', unitType: 'COUNT', allowsDecimalQuantity: false, quantityPrecision: 0, isActive: true });
  const caseUnit = await seed(manager, UnitOfMeasure, { tenantId, code: `CS${seedCounter}`, name: 'Case', unitType: 'COUNT', allowsDecimalQuantity: false, quantityPrecision: 0, isActive: true });
  const decimalUnit = await seed(manager, UnitOfMeasure, { tenantId, code: `HLF${seedCounter}`, name: 'Half', unitType: 'COUNT', allowsDecimalQuantity: true, quantityPrecision: 4, isActive: true });
  const products: Product[] = [], productUnits: Array<{ base: ProductUnit; case: ProductUnit; decimal: ProductUnit }> = [];
  for (let index = 0; index < productCount; index += 1) {
    const product = await seed(manager, Product, { tenantId, categoryId: category.categoryId, baseUnitId: ea.unitId, sku: `ADJ-SKU-${suffix}-${index}`, productName: `Adjustment product ${index}`, isActive: true, isStockItem: true });
    products.push(product);
    productUnits.push({
      base: await seed(manager, ProductUnit, { productId: product.productId, unitId: ea.unitId, conversionFactor: '1.000000', isBaseUnit: true, isActive: true }),
      case: await seed(manager, ProductUnit, { productId: product.productId, unitId: caseUnit.unitId, conversionFactor: '24.000000', isBaseUnit: false, isActive: true }),
      decimal: await seed(manager, ProductUnit, { productId: product.productId, unitId: decimalUnit.unitId, conversionFactor: '0.500000', isBaseUnit: false, isActive: true }),
    });
    await seed(manager, ProductLocation, { productId: product.productId, locationId: location.locationId, isActive: true });
  }
  await reasonService.ensureSystemReasons(manager, tenantId);
  const rows = await manager.getRepository(InventoryAdjustmentReason).findBy({ tenantId });
  const reason = Object.fromEntries(rows.map(row => [row.code, row])) as Record<string, InventoryAdjustmentReason>;
  return { tenant, tenantId, user, location, products, productUnits, reason };
}

async function stock(manager: EntityManager, f: Awaited<ReturnType<typeof fixture>>, product: number, quantity: string, averageCost: string) {
  return seed(manager, InventoryBalance, { tenantId: f.tenantId, locationId: f.location.locationId, productId: f.products[product].productId, quantityOnHand: quantity, averageCost });
}

async function layers(manager: EntityManager, f: Awaited<ReturnType<typeof fixture>>, product: number, inputs: Array<[string, string]>) {
  const rows: InventoryAgeLayer[] = [];
  for (const [quantity, date] of inputs) rows.push(await seed(manager, InventoryAgeLayer, { tenantId: f.tenantId, locationId: f.location.locationId, productId: f.products[product].productId, sourceDocumentType: 'MYSQL_TEST', sourceDocumentId: ++seedCounter, sourceDocumentLineId: ++seedCounter, receiptDate: date, originalQuantity: quantity, remainingQuantity: quantity, originalUnitCost: '100.0000', isActive: true }));
  return rows;
}

async function create(service: InventoryAdjustmentsService, f: Awaited<ReturnType<typeof fixture>>, movementType: 'ADJI' | 'ADJO', reason: InventoryAdjustmentReason, inputs: Array<{ product: number; unit: 'base' | 'case' | 'decimal'; quantity: string; unitCost?: string }>) {
  return service.create({ locationId: Number(f.location.locationId), movementType, reasonId: Number(reason.inventoryAdjustmentReasonId), lines: inputs.map(input => ({ productId: Number(f.products[input.product].productId), productUnitId: Number(f.productUnits[input.product][input.unit].productUnitId), quantity: input.quantity, ...(input.unitCost === undefined ? {} : { unitCost: input.unitCost }) })) }, f.user);
}

async function posted(manager: EntityManager, draft: InventoryAdjustment) {
  const header = await manager.getRepository(InventoryAdjustment).findOneByOrFail({ inventoryAdjustmentId: draft.inventoryAdjustmentId });
  const lines = await manager.getRepository(InventoryAdjustmentLine).find({ where: { inventoryAdjustmentId: draft.inventoryAdjustmentId }, order: { inventoryAdjustmentLineId: 'ASC' } });
  const ledger = await manager.getRepository(InventoryLedger).find({ where: { tenantId: header.tenantId, sourceDocumentType: 'INVENTORY_ADJUSTMENT', sourceDocumentId: header.inventoryAdjustmentId }, order: { inventoryLedgerId: 'ASC' } });
  const balances = await manager.getRepository(InventoryBalance).findBy({ tenantId: header.tenantId, locationId: header.locationId });
  return { header, lines, ledger, balance: () => balances.find(row => Number(row.productId) === Number(lines[0].productId))! };
}

async function inventoryTotals(manager: EntityManager) {
  const [row] = await manager.query(`SELECT
    (SELECT COUNT(*) FROM tbl_inventory_adjustment) adjustments,
    (SELECT COUNT(*) FROM tbl_inventory_adjustment_line) adjustmentLines,
    (SELECT COUNT(*) FROM tbl_inventory_balance) balances,
    (SELECT COUNT(*) FROM tbl_inventory_ledger) ledgers,
    (SELECT COUNT(*) FROM tbl_inventory_age_layer) layers,
    (SELECT COALESCE(SUM(quantity_on_hand),0) FROM tbl_inventory_balance) totalQuantity,
    (SELECT COALESCE(SUM(remaining_quantity),0) FROM tbl_inventory_age_layer) remainingLayers`);
  return row;
}
