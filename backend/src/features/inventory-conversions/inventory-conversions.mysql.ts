/** Explicit configured-local-MySQL validation. Test data is enclosed in outer rollback transactions. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import applicationDataSource from '../../data-source';
import { AuthorizationCatalogService } from '../auth/authorization-catalog.service';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { Category } from '../categories/categories.entity';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryAgeLayerService } from '../inventory-age-layers/inventory-age-layer.service';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { InventoryLedgerService, InventoryLedgerEntry } from '../inventory-ledger/inventory-ledger.service';
import { Location, LocationType } from '../locations/locations.entity';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { Permission } from '../permissions/permissions.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { Role } from '../roles/roles.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { User } from '../users/user.entity';
import { InventoryConversionLine } from './inventory-conversion-line.entity';
import { InventoryConversion, InventoryConversionAllocationMethod } from './inventory-conversion.entity';
import { InventoryConversionsController } from './inventory-conversions.controller';
import { InventoryConversionsService } from './inventory-conversions.service';

test('configured local MySQL: inventory conversion migration and posting integration', { timeout: 180000 }, async t => {
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? '')) throw new Error('This suite only permits a local MySQL host.');
  if (process.env.DB_SYNCHRONIZE === 'true') throw new Error('DB_SYNCHRONIZE must remain disabled for migration validation.');
  if (!process.env.DB_DATABASE) throw new Error('DB_DATABASE is required.');
  const ds = applicationDataSource;
  await ds.initialize();
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
    await t.test('physical schema uses InnoDB, expected DECIMAL columns, indexes and foreign keys', async t => {
      const db = process.env.DB_DATABASE!;
      const tables: Array<{ tableName: string; engine: string }> = await ds.query(`
        SELECT table_name tableName, engine engine FROM information_schema.tables
        WHERE table_schema=? AND table_name IN ('tbl_inventory_conversion','tbl_inventory_conversion_line') ORDER BY table_name`, [db]);
      assert.deepEqual(tables, [
        { tableName: 'tbl_inventory_conversion', engine: 'InnoDB' },
        { tableName: 'tbl_inventory_conversion_line', engine: 'InnoDB' },
      ]);
      const columns: Array<{ tableName: string; columnName: string; dataType: string; columnType: string; nullable: string }> = await ds.query(`
        SELECT table_name tableName,column_name columnName,data_type dataType,column_type columnType,is_nullable nullable
        FROM information_schema.columns WHERE table_schema=? AND (
          (table_name='tbl_inventory_conversion_line' AND column_name IN ('quantity','conversion_factor_snapshot','base_quantity','allocation_percent','allocation_basis_value','allocation_weight','allocated_value','posted_unit_cost','posted_value','quantity_before','quantity_after','wavg_before','wavg_after')) OR
          (table_name='tbl_inventory_conversion' AND column_name IN ('total_input_value','total_output_value','value_variance')))
        ORDER BY table_name,ordinal_position`, [db]);
      const types = new Map(columns.map(row => [`${row.tableName}.${row.columnName}`, row.columnType]));
      assert.equal(types.get('tbl_inventory_conversion_line.conversion_factor_snapshot'), 'decimal(18,6)');
      assert.equal(types.get('tbl_inventory_conversion_line.allocation_percent'), 'decimal(9,4)');
      for (const name of ['quantity','base_quantity','allocation_basis_value','allocation_weight','allocated_value','posted_unit_cost','posted_value','quantity_before','quantity_after','wavg_before','wavg_after'])
        assert.equal(types.get(`tbl_inventory_conversion_line.${name}`), 'decimal(18,4)');
      for (const name of ['total_input_value','total_output_value','value_variance']) assert.equal(types.get(`tbl_inventory_conversion.${name}`), 'decimal(18,4)');
      assert.ok(columns.every(row => !['float', 'double'].includes(row.dataType)));
      for (const name of ['quantity_before','quantity_after','wavg_before','wavg_after','posted_unit_cost','posted_value','allocation_percent','allocation_basis_value','allocation_weight','allocated_value'])
        assert.equal(columns.find(row => row.tableName === 'tbl_inventory_conversion_line' && row.columnName === name)?.nullable, 'YES');
      const indexes: Array<{ tableName: string; indexName: string; nonUnique: number; columnsList: string }> = await ds.query(`
        SELECT table_name tableName,index_name indexName,non_unique nonUnique,GROUP_CONCAT(column_name ORDER BY seq_in_index) columnsList
        FROM information_schema.statistics WHERE table_schema=? AND table_name IN ('tbl_inventory_conversion','tbl_inventory_conversion_line')
        GROUP BY table_name,index_name,non_unique ORDER BY table_name,index_name`, [db]);
      const byIndex = new Map(indexes.map(row => [row.indexName, row]));
      assert.equal(byIndex.get('uq_inventory_conversion_tenant_number')?.columnsList, 'tenant_id,conversion_number');
      assert.equal(byIndex.get('uq_inventory_conversion_tenant_number')?.nonUnique, 0);
      assert.equal(byIndex.get('uq_inventory_conversion_line_side_product')?.columnsList, 'inventory_conversion_id,movement_type,product_id');
      assert.equal(byIndex.get('uq_inventory_conversion_line_side_product')?.nonUnique, 0);
      for (const name of ['idx_inventory_conversion_tenant_date','idx_inventory_conversion_location_status','idx_inventory_conversion_line_product']) assert.ok(byIndex.has(name));
      const foreignKeys: Array<{ constraintName: string; tableName: string; referencedTable: string; deleteRule: string }> = await ds.query(`
        SELECT k.constraint_name constraintName,k.table_name tableName,k.referenced_table_name referencedTable,r.delete_rule deleteRule
        FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r
          ON r.constraint_schema=k.constraint_schema AND r.constraint_name=k.constraint_name
        WHERE k.table_schema=? AND k.table_name IN ('tbl_inventory_conversion','tbl_inventory_conversion_line') AND k.referenced_table_name IS NOT NULL
        ORDER BY k.constraint_name`, [db]);
      const fkNames = new Set(foreignKeys.map(row => row.constraintName));
      for (const name of ['fk_inventory_conversion_tenant','fk_inventory_conversion_location','fk_inventory_conversion_created_user','fk_inventory_conversion_posted_user','fk_inventory_conversion_cancelled_user','fk_inventory_conversion_line_header','fk_inventory_conversion_line_product','fk_inventory_conversion_line_product_unit']) assert.ok(fkNames.has(name), `Missing foreign key ${name}`);
      assert.equal(foreignKeys.find(row => row.constraintName === 'fk_inventory_conversion_line_header')?.deleteRule, 'CASCADE');
      t.diagnostic(JSON.stringify({ database: db, tables, columns, indexes, foreignKeys }));
    });

    await withRollback('Scenario A: one AVAL to one AVIN posts balances, ledger, layers and snapshots', async (manager, bundle) => {
      const f = await fixture(manager, 2);
      await stock(manager, f, 0, '10', '400');
      const sourceLayers = await layers(manager, f, 0, [['6', '2026-01-01'], ['4', '2026-02-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0, '1'), avin(1, '5', { allocationPercent: '100' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft);
      const out = result.line(0), incoming = result.line(1);
      assert.deepEqual([result.balance(0).quantityOnHand, result.balance(0).averageCost, out.postedUnitCost, out.postedValue], ['9.0000','400.0000','400.0000','400.0000']);
      assert.deepEqual([result.balance(1).quantityOnHand, result.balance(1).averageCost, incoming.allocatedValue, incoming.postedUnitCost], ['5.0000','80.0000','400.0000','80.0000']);
      assert.deepEqual([out.quantityBefore,out.quantityAfter,out.wavgBefore,out.wavgAfter], ['10.0000','9.0000','400.0000','400.0000']);
      assert.deepEqual([incoming.quantityBefore,incoming.quantityAfter,incoming.wavgBefore,incoming.wavgAfter], ['0.0000','5.0000','0.0000','80.0000']);
      assert.deepEqual([result.header.totalInputValue,result.header.totalOutputValue,result.header.valueVariance], ['400.0000','400.0000','0.0000']);
      assert.deepEqual(result.ledger.map(row => [row.movementType,row.quantityIn,row.quantityOut,row.unitCost,row.movementValue]), [['AVAL','0.0000','1.0000','400.0000','400.0000'],['AVIN','5.0000','0.0000','80.0000','400.0000']]);
      assert.equal((await manager.getRepository(InventoryAgeLayer).findOneByOrFail({ inventoryAgeLayerId: sourceLayers[0].inventoryAgeLayerId })).remainingQuantity, '5.0000');
      const inbound = result.ageLayers.find(row => row.sourceDocumentType === 'INVENTORY_CONVERSION' && Number(row.productId) === Number(f.products[1].productId))!;
      assert.deepEqual([inbound.originalQuantity,inbound.remainingQuantity,inbound.originalUnitCost,inbound.sourceDocumentId,inbound.sourceDocumentLineId], ['5.0000','5.0000','80.0000',result.header.inventoryConversionId,incoming.inventoryConversionLineId]);
      assert.equal(inbound.receiptDate, result.ledger[1].businessDate);
    });

    await withRollback('Scenario B: multiple AVAL to one AVIN reconciles exactly', async (manager, bundle) => {
      const f = await fixture(manager, 3);
      await stock(manager, f, 0, '10', '400'); await stock(manager, f, 1, '10', '600');
      await layers(manager, f, 0, [['10','2026-01-01']]); await layers(manager, f, 1, [['10','2026-01-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),aval(1,'1'),avin(2,'10',{ allocationPercent:'100' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft), incoming = result.line(2);
      assert.deepEqual(result.lines.filter(row => row.movementType === 'AVAL').map(row => row.postedValue), ['400.0000','600.0000']);
      assert.deepEqual([incoming.allocatedValue,incoming.postedUnitCost,result.balance(2).averageCost,result.header.totalInputValue,result.header.totalOutputValue], ['1000.0000','100.0000','100.0000','1000.0000','1000.0000']);
    });

    await withRollback('Scenario C MANUAL_PERCENT: many-to-many persists 40/60 allocation and rejects invalid percentages', async (manager, bundle) => {
      const f = await fixture(manager, 4);
      await sourcePair(manager, f);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),aval(1,'1'),avin(2,'5',{ allocationPercent:'40' }),avin(3,'10',{ allocationPercent:'60' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft);
      assert.deepEqual([result.line(2).allocationPercent,result.line(2).allocatedValue,result.line(2).postedUnitCost], ['40.0000','400.0000','80.0000']);
      assert.deepEqual([result.line(3).allocationPercent,result.line(3).allocatedValue,result.line(3).postedUnitCost], ['60.0000','600.0000','60.0000']);
      assert.equal(result.header.valueVariance, '0.0000');
      const before = await postingCounts(manager, f.tenantId);
      for (const invalid of [
        [avin(2,'5',{ allocationPercent:'99' })], [avin(2,'5',{ allocationPercent:'101' })],
        [avin(2,'5',{ allocationPercent:'0' })], [avin(2,'5',{ allocationPercent:'-1' })], [avin(2,'5')],
      ]) await assert.rejects(() => create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'), ...invalid]), BadRequestException);
      assert.deepEqual(await postingCounts(manager, f.tenantId), before);
    });

    await withRollback('Scenario C BY_EXISTING_WAVG: basis, allocation and resulting WAVG are exact', async (manager, bundle) => {
      const f = await fixture(manager, 4); await sourcePair(manager, f);
      await stock(manager, f, 2, '20', '120'); await stock(manager, f, 3, '30', '80');
      const draft = await create(bundle.conversions, f, 'BY_EXISTING_WAVG', [aval(0,'1'),aval(1,'1'),avin(2,'5'),avin(3,'10')]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft), mix = result.line(2), salad = result.line(3);
      assert.deepEqual([mix.allocationBasisValue,mix.allocatedValue,mix.postedUnitCost,mix.wavgBefore,mix.wavgAfter], ['600.0000','428.5714','85.7143','120.0000','113.1429']);
      assert.deepEqual([salad.allocationBasisValue,salad.allocatedValue,salad.postedUnitCost,salad.wavgBefore,salad.wavgAfter], ['800.0000','571.4286','57.1429','80.0000','74.2857']);
      assert.equal(result.ledger.find(row => row.movementType === 'AVIN' && Number(row.productId) === Number(f.products[2].productId))?.unitCost, '85.7143');
      assert.deepEqual([result.header.totalInputValue,result.header.totalOutputValue,result.header.valueVariance], ['1000.0000','1000.0000','0.0000']);
    });

    await withRollback('BY_EXISTING_WAVG rejects missing, zero and negative output WAVG without fallback writes', async (manager, bundle) => {
      const f = await fixture(manager, 5); await sourcePair(manager, f);
      await stock(manager, f, 3, '5', '0'); await stock(manager, f, 4, '5', '-1');
      for (const product of [2,3,4]) {
        const draft = await create(bundle.conversions, f, 'BY_EXISTING_WAVG', [aval(0,'1'),aval(1,'1'),avin(product,'5')]);
        await assert.rejects(() => bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user), /WAVG is required/);
        assert.equal((await manager.getRepository(InventoryConversion).findOneByOrFail({ inventoryConversionId: draft.inventoryConversionId })).status, 'DRAFT');
      }
      assert.equal((await manager.query(`SELECT is_nullable nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='tbl_inventory_balance' AND column_name='average_cost'`))[0].nullable, 'NO');
      assert.deepEqual(await postingCounts(manager, f.tenantId), { ledgers: 0, conversionLayers: 0, posted: 0 });
    });

    await withRollback('Scenario C BY_WEIGHT: explicit 4/6 weights allocate 40/60 and invalid weights cannot post', async (manager, bundle) => {
      const f = await fixture(manager, 4); await sourcePair(manager, f);
      const draft = await create(bundle.conversions, f, 'BY_WEIGHT', [aval(0,'1'),aval(1,'1'),avin(2,'5',{ allocationWeight:'4' }),avin(3,'10',{ allocationWeight:'6' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft);
      assert.deepEqual([result.line(2).allocationWeight,result.line(2).allocatedValue,result.line(3).allocationWeight,result.line(3).allocatedValue], ['4.0000','400.0000','6.0000','600.0000']);
      for (const value of [undefined,'0','-1']) {
        if (value === undefined) await assert.rejects(() => create(bundle.conversions, f, 'BY_WEIGHT', [aval(0,'1'),avin(2,'5')]), /requires an allocation weight/);
        else {
          const invalid = await create(bundle.conversions, f, 'BY_WEIGHT', [aval(0,'1'),avin(2,'5',{ allocationWeight:value })]);
          await assert.rejects(() => bundle.conversions.post(Number(invalid.inventoryConversionId), {}, f.user), /basis must be greater/);
        }
      }
    });

    await withRollback('existing output WAVG is used only for resulting WAVG, not AVIN transaction cost', async (manager, bundle) => {
      const f = await fixture(manager, 2);
      await stock(manager, f, 0, '10', '400'); await layers(manager, f, 0, [['10','2026-01-01']]);
      await stock(manager, f, 1, '20', '120');
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(1,'5',{ allocationPercent:'100' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft), incoming = result.line(1);
      assert.deepEqual([incoming.quantityBefore,incoming.quantityAfter,incoming.wavgBefore,incoming.postedUnitCost,incoming.postedValue,incoming.wavgAfter], ['20.0000','25.0000','120.0000','80.0000','400.0000','112.0000']);
      assert.equal(result.balance(1).averageCost, '112.0000');
      assert.equal(result.ledger.find(row => row.movementType === 'AVIN')?.unitCost, '80.0000');
    });

    await withRollback('positive AVIN stock with zero/negative WAVG rejects atomically while zero/no balance establishes WAVG', async (manager, bundle) => {
      const f = await fixture(manager, 4);
      await stock(manager, f, 0, '10', '100'); await layers(manager, f, 0, [['10','2026-01-01']]);
      await stock(manager, f, 1, '5', '0'); await stock(manager, f, 2, '5', '-1'); await stock(manager, f, 3, '0', '0');
      for (const product of [1,2]) {
        const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(product,'2',{ allocationPercent:'100' })]);
        await assert.rejects(() => bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user), /no usable WAVG/);
        const lineRows = await manager.getRepository(InventoryConversionLine).findBy({ inventoryConversionId: draft.inventoryConversionId });
        assert.ok(lineRows.every(row => row.postedValue == null && row.quantityBefore == null));
        assert.equal((await manager.getRepository(InventoryConversion).findOneByOrFail({ inventoryConversionId: draft.inventoryConversionId })).status, 'DRAFT');
      }
      assert.equal(await manager.getRepository(InventoryLedger).countBy({ tenantId: f.tenantId }), 0);
      assert.equal((await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId: f.tenantId, productId: f.products[0].productId })).quantityOnHand, '10.0000');
      const zero = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(3,'2',{ allocationPercent:'100' })]);
      await bundle.conversions.post(Number(zero.inventoryConversionId), {}, f.user);
      assert.deepEqual([(await posted(manager, zero)).balance(3).quantityOnHand,(await posted(manager, zero)).balance(3).averageCost], ['2.0000','50.0000']);
    });

    await withRollback('ProductUnit CASE and decimal factors persist entered, snapshot and base quantities', async (manager, bundle) => {
      const f = await fixture(manager, 2);
      await stock(manager, f, 0, '100', '10'); await layers(manager, f, 0, [['100','2026-01-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'2',{ unit:'case' }),avin(1,'3',{ unit:'decimal', allocationPercent:'100' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft), out = result.line(0), incoming = result.line(1);
      assert.deepEqual([out.quantity,out.conversionFactorSnapshot,out.baseQuantity,out.postedValue], ['2.0000','24.000000','48.0000','480.0000']);
      assert.deepEqual([incoming.quantity,incoming.conversionFactorSnapshot,incoming.baseQuantity,incoming.postedUnitCost,incoming.postedValue], ['3.0000','0.500000','1.5000','320.0000','480.0000']);
    });

    await withRollback('negative AVAL requires confirmation and records FIFO allocated/unallocated relief', async (manager, bundle) => {
      const f = await fixture(manager, 2);
      await stock(manager, f, 0, '1', '100'); const age = await layers(manager, f, 0, [['0.5','2026-01-01'],['0.25','2026-02-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'2'),avin(1,'2',{ allocationPercent:'100' })]);
      await assert.rejects(() => bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user), /confirm negative stock/i);
      assert.equal((await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId:f.tenantId,productId:f.products[0].productId })).quantityOnHand, '1.0000');
      await bundle.conversions.post(Number(draft.inventoryConversionId), { confirmNegativeStock:true }, f.user);
      const result = await posted(manager, draft), ledger = result.ledger.find(row => row.movementType === 'AVAL')!;
      assert.deepEqual([result.balance(0).quantityOnHand,result.balance(0).averageCost], ['-1.0000','100.0000']);
      assert.deepEqual(ledger.ageLayerRelief?.allocations.map(row => [String(row.layerId),row.quantity]), [[String(age[0].inventoryAgeLayerId),'0.5000'],[String(age[1].inventoryAgeLayerId),'0.2500']]);
      assert.equal(ledger.ageLayerRelief?.unallocatedQuantity, '1.2500');
    });

    await withRollback('repeating allocation rounds first lines and assigns final residual with zero variance', async (manager, bundle) => {
      const f = await fixture(manager, 4);
      await stock(manager, f, 0, '10', '100'); await layers(manager, f, 0, [['10','2026-01-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'10'),avin(1,'1',{ allocationPercent:'33.3333' }),avin(2,'1',{ allocationPercent:'33.3333' }),avin(3,'1',{ allocationPercent:'33.3334' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const result = await posted(manager, draft), values = result.lines.filter(row => row.movementType === 'AVIN').map(row => row.postedValue);
      assert.deepEqual(values, ['333.3330','333.3330','333.3340']);
      assert.equal(values.reduce((sum, value) => sum + BigInt(value!.replace('.','')), 0n), 10000000n);
      assert.equal(result.header.valueVariance, '0.0000');
    });

    await withRollback('late AVIN failure rolls back AVAL, layers, snapshots, ledger, header and sequence', async (manager, bundle) => {
      const f = await fixture(manager, 2);
      await stock(manager, f, 0, '10', '100'); const [layer] = await layers(manager, f, 0, [['10','2026-01-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'2'),avin(1,'2',{ allocationPercent:'100' })]);
      const failingLedgers = new InventoryLedgerService();
      const insert = failingLedgers.insert.bind(failingLedgers);
      failingLedgers.insert = async (nested, entry: InventoryLedgerEntry) => {
        if (entry.movementType === 'AVIN') throw new Error('Injected AVIN ledger failure');
        return insert(nested, entry);
      };
      const failing = new InventoryConversionsService(bundle.dataSource, new InventoryBalanceService(), failingLedgers, new InventoryAgeLayerService(), new NumberSequencesService());
      await assert.rejects(() => failing.post(Number(draft.inventoryConversionId), {}, f.user), /Injected AVIN ledger failure/);
      assert.equal((await manager.getRepository(InventoryBalance).findOneByOrFail({ tenantId:f.tenantId,productId:f.products[0].productId })).quantityOnHand, '10.0000');
      assert.equal(await manager.getRepository(InventoryBalance).countBy({ tenantId:f.tenantId,productId:f.products[1].productId }), 0);
      assert.equal((await manager.getRepository(InventoryAgeLayer).findOneByOrFail({ inventoryAgeLayerId:layer.inventoryAgeLayerId })).remainingQuantity, '10.0000');
      assert.equal(await manager.getRepository(InventoryLedger).countBy({ tenantId:f.tenantId }), 0);
      const storedLines = await manager.getRepository(InventoryConversionLine).findBy({ inventoryConversionId:draft.inventoryConversionId });
      assert.ok(storedLines.every(row => row.postedValue == null && row.quantityBefore == null));
      const stored = await manager.getRepository(InventoryConversion).findOneByOrFail({ inventoryConversionId:draft.inventoryConversionId });
      assert.equal(stored.status, 'DRAFT'); assert.equal(stored.conversionNumber, null);
      assert.equal((await manager.query(`SELECT COUNT(*) n FROM tbl_number_sequence WHERE tenant_id=? AND sequence_key='INVENTORY_CONVERSION'`, [f.tenantId]))[0].n, '0');
    });

    await withRollback('duplicate post and duplicate/same-product rules prevent duplicate audit writes', async (manager, bundle) => {
      const f = await fixture(manager, 3);
      await stock(manager, f, 0, '10', '100'); await layers(manager, f, 0, [['10','2026-01-01']]);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(1,'1',{ allocationPercent:'100' })]);
      await bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user);
      const counts = await postingCounts(manager, f.tenantId);
      await assert.rejects(() => bundle.conversions.post(Number(draft.inventoryConversionId), {}, f.user), /Only draft/);
      assert.deepEqual(await postingCounts(manager, f.tenantId), counts);
      await assert.rejects(() => create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),aval(0,'1'),avin(1,'1',{ allocationPercent:'100' })]), /only once/);
      await assert.rejects(() => create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(1,'1',{ allocationPercent:'50' }),avin(1,'1',{ allocationPercent:'50' })]), /only once/);
      await assert.rejects(() => create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(0,'1',{ allocationPercent:'100' })]), /both AVAL and AVIN/);
      const line = (await manager.getRepository(InventoryConversionLine).findOneByOrFail({ inventoryConversionId:draft.inventoryConversionId,movementType:'AVAL' }));
      const copy = manager.getRepository(InventoryConversionLine).create({ ...line, inventoryConversionLineId: undefined, postedValue:null, quantityBefore:null, quantityAfter:null,wavgBefore:null,wavgAfter:null,postedUnitCost:null });
      await assert.rejects(() => manager.getRepository(InventoryConversionLine).insert(copy), /Duplicate entry/);
    });

    await withRollback('tenant, foreign product/unit/location and location-assignment boundaries are enforced', async (manager, bundle) => {
      const f = await fixture(manager, 2), other = await fixture(manager, 1);
      await assert.rejects(() => bundle.conversions.get(99999999, f.user), NotFoundException);
      const draft = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(1,'1',{ allocationPercent:'100' })]);
      await assert.rejects(() => bundle.conversions.get(Number(draft.inventoryConversionId), { ...other.user, tenantId:other.tenantId }), NotFoundException);
      const denied = { ...f.user, accessScope:'LOCATION' as const, assignedLocationIds:[] };
      await assert.rejects(() => bundle.conversions.get(Number(draft.inventoryConversionId), denied), ForbiddenException);
      await assert.rejects(() => bundle.conversions.create({ locationId:Number(other.location.locationId),allocationMethod:'MANUAL_PERCENT',lines:[aval(0,'1') as any,avin(1,'1',{ allocationPercent:'100' }) as any] }, f.user), NotFoundException);
      await assert.rejects(() => bundle.conversions.create({ locationId:Number(f.location.locationId),allocationMethod:'MANUAL_PERCENT',lines:[{ movementType:'AVAL',productId:Number(other.products[0].productId),productUnitId:Number(other.productUnits[0].base.productUnitId),quantity:'1' },{ movementType:'AVIN',productId:Number(f.products[1].productId),productUnitId:Number(f.productUnits[1].base.productUnitId),quantity:'1',allocationPercent:'100' }] }, f.user), /active stock item for this tenant/);
      await assert.rejects(() => bundle.conversions.create({ locationId:Number(f.location.locationId),allocationMethod:'MANUAL_PERCENT',lines:[{ movementType:'AVAL',productId:Number(f.products[0].productId),productUnitId:Number(other.productUnits[0].base.productUnitId),quantity:'1' },{ movementType:'AVIN',productId:Number(f.products[1].productId),productUnitId:Number(f.productUnits[1].base.productUnitId),quantity:'1',allocationPercent:'100' }] }, f.user), /Product unit is not active/);
    });

    await withRollback('permissions exist under Inventory and guard VIEW/CREATE/UPDATE/POST/CANCEL', async (manager, bundle) => {
      const f = await fixture(manager, 1);
      await new AuthorizationCatalogService(bundle.dataSource).onModuleInit();
      const expected = ['INVENTORY_VALUE_ADJUSTMENT_VIEW','INVENTORY_VALUE_ADJUSTMENT_CREATE','INVENTORY_VALUE_ADJUSTMENT_UPDATE','INVENTORY_VALUE_ADJUSTMENT_POST','INVENTORY_VALUE_ADJUSTMENT_CANCEL'];
      const rows = await manager.getRepository(Permission).createQueryBuilder('permission').innerJoinAndSelect('permission.module','module').where('permission.code IN (:...codes)', { codes:expected }).getMany();
      assert.deepEqual(rows.map(row => row.code).sort(), [...expected].sort()); assert.ok(rows.every(row => row.module.code === 'INVENTORY'));
      const role = await seed(manager, Role, { tenantId:f.tenantId,code:`CONV_${++seedCounter}`,name:'Conversion role',accessScope:'TENANT',isSystemRole:false,isActive:true });
      const guard = new PermissionGuard(new Reflector(), bundle.dataSource);
      const methods = ['list','create','update','post','cancel'] as const;
      for (const method of methods) {
        const context = executionContext(InventoryConversionsController.prototype[method], f.user);
        assert.equal(await guard.canActivate(context), true);
      }
      const nonAdmin = { ...f.user,roleId:Number(role.roleId),roleCode:'CONVERSION_USER' };
      await assert.rejects(() => guard.canActivate(executionContext(InventoryConversionsController.prototype.list, nonAdmin)), /not assigned/);
      const view = rows.find(row => row.code.endsWith('_VIEW'))!;
      await seed(manager, RolePermission, { roleId:role.roleId,permissionId:view.permissionId,assignedAt:new Date() });
      assert.equal(await guard.canActivate(executionContext(InventoryConversionsController.prototype.list, nonAdmin)), true);
    });

    await withRollback('list pagination and filters return one header per conversion without line multiplication', async (manager, bundle) => {
      const f = await fixture(manager, 4); await sourcePair(manager, f);
      const first = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),aval(1,'1'),avin(2,'5',{ allocationPercent:'40' }),avin(3,'10',{ allocationPercent:'60' })], 'alpha conversion');
      await bundle.conversions.post(Number(first.inventoryConversionId), {}, f.user);
      await create(bundle.conversions, f, 'BY_WEIGHT', [aval(0,'1'),avin(2,'1',{ allocationWeight:'1' })], 'beta conversion');
      await create(bundle.conversions, f, 'BY_EXISTING_WAVG', [aval(1,'1'),avin(3,'1')], 'gamma conversion');
      const all = await bundle.conversions.list(f.user, { page:1,limit:20,search:'',status:'',allocationMethod:'',locationId:Number(f.location.locationId),dateFrom:'2026-01-01',dateTo:'2099-12-31' });
      assert.equal(all.total, 3); assert.equal(all.items.length, 3); assert.equal(new Set(all.items.map(row => row.inventoryConversionId)).size, 3);
      assert.equal(all.items.find(row => Number(row.inventoryConversionId) === Number(first.inventoryConversionId))?.lineCount, 4);
      assert.equal(all.items.find(row => Number(row.inventoryConversionId) === Number(first.inventoryConversionId))?.avalLineCount, 2);
      assert.equal(all.items.find(row => Number(row.inventoryConversionId) === Number(first.inventoryConversionId))?.avinLineCount, 2);
      assert.equal((await bundle.conversions.list(f.user, { page:1,limit:50,search:'alpha',status:'POSTED',allocationMethod:'MANUAL_PERCENT' })).total, 1);
      assert.equal((await bundle.conversions.list(f.user, { page:1,limit:100,search:'',status:'DRAFT',allocationMethod:'BY_WEIGHT' })).total, 1);
      assert.equal((await bundle.conversions.list({ ...f.user,accessScope:'LOCATION',assignedLocationIds:[] }, { page:1,limit:20,search:'',status:'',allocationMethod:'' })).total, 0);
    });

    await withRollback('IVA numbering is unique, tenant/year scoped and sequential', async (manager, bundle) => {
      const f = await fixture(manager, 3); await stock(manager, f, 0, '10', '100'); await layers(manager, f, 0, [['10','2026-01-01']]);
      const a = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(1,'1',{ allocationPercent:'100' })]);
      const b = await create(bundle.conversions, f, 'MANUAL_PERCENT', [aval(0,'1'),avin(2,'1',{ allocationPercent:'100' })]);
      await bundle.conversions.post(Number(a.inventoryConversionId), {}, f.user); await bundle.conversions.post(Number(b.inventoryConversionId), {}, f.user);
      const headers = await manager.getRepository(InventoryConversion).find({ where:{ tenantId:f.tenantId,status:'POSTED' },order:{ inventoryConversionId:'ASC' } });
      const year = headers[0].conversionDate.slice(0,4);
      assert.deepEqual(headers.map(row => row.conversionNumber), [`IVA-${f.tenantId}-${year}-000001`,`IVA-${f.tenantId}-${year}-000002`]);
      assert.equal(new Set(headers.map(row => row.conversionNumber)).size, 2);
      const other = await fixture(manager, 2); await stock(manager, other, 0, '2', '50'); await layers(manager, other, 0, [['2','2026-01-01']]);
      const c = await create(bundle.conversions, other, 'MANUAL_PERCENT', [aval(0,'1'),avin(1,'1',{ allocationPercent:'100' })]); await bundle.conversions.post(Number(c.inventoryConversionId), {}, other.user);
      assert.equal((await manager.getRepository(InventoryConversion).findOneByOrFail({ inventoryConversionId:c.inventoryConversionId })).conversionNumber, `IVA-${other.tenantId}-${year}-000001`);
      assert.equal(await new NumberSequencesService().getTenantNextNumber(manager, f.tenantId, 'INVENTORY_CONVERSION', String(Number(year) + 1)), 1);
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
  return { dataSource, conversions:new InventoryConversionsService(dataSource,new InventoryBalanceService(),new InventoryLedgerService(),new InventoryAgeLayerService(),new NumberSequencesService()) };
}

let seedCounter = 0;
async function seed<T extends ObjectLiteral>(manager: EntityManager, entity: EntityTarget<T>, supplied: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const column of manager.connection.getMetadata(entity).columns) {
    if (column.isNullable || column.isGenerated || column.isCreateDate || column.isUpdateDate || column.default !== undefined) continue;
    values[column.propertyName] = ['bigint','int','decimal','tinyint'].includes(String(column.type)) ? 1 : column.type === 'date' ? '2026-09-01' : column.type === 'datetime' ? new Date('2026-09-01T00:00:00Z') : `test${++seedCounter}`;
  }
  const repository = manager.getRepository(entity);
  return repository.save(repository.create({ ...values,...supplied } as any) as unknown as T);
}

async function fixture(manager: EntityManager, productCount: number) {
  const suffix = `${Date.now()}_${++seedCounter}`;
  const tenant = await seed(manager,Tenant,{ code:`CNV_${suffix}`,name:`Conversion Test ${suffix}`,timeZone:'Asia/Colombo',isActive:true });
  const tenantId = Number(tenant.tenantId);
  const userRow = await seed(manager,User,{ tenantId,username:`cnv_user_${suffix}`,passwordHash:'test',isActive:true });
  const user: TenantPrincipal = { scope:'TENANT',tenantId,userId:Number(userRow.userId),username:userRow.username,roleId:1,roleCode:'TENANT_ADMIN',accessScope:'TENANT',assignedLocationIds:[] };
  const location = await seed(manager,Location,{ tenantId,code:`LOC_${suffix}`,name:'Conversion Warehouse',locationType:LocationType.WAREHOUSE,isActive:true });
  const category = await seed(manager,Category,{ tenantId,categoryCode:`CAT_${suffix}`,categoryName:'Conversion Products',isActive:true });
  const ea = await seed(manager,UnitOfMeasure,{ tenantId,code:`EA${seedCounter}`,name:'Each',unitType:'COUNT',allowsDecimalQuantity:true,quantityPrecision:4,isActive:true });
  const caseUnit = await seed(manager,UnitOfMeasure,{ tenantId,code:`CS${seedCounter}`,name:'Case',unitType:'COUNT',allowsDecimalQuantity:true,quantityPrecision:4,isActive:true });
  const decimalUnit = await seed(manager,UnitOfMeasure,{ tenantId,code:`HLF${seedCounter}`,name:'Half',unitType:'COUNT',allowsDecimalQuantity:true,quantityPrecision:4,isActive:true });
  const products: Product[] = [], productUnits: Array<{ base:ProductUnit;case:ProductUnit;decimal:ProductUnit }> = [];
  for (let index=0; index<productCount; index+=1) {
    const product = await seed(manager,Product,{ tenantId,categoryId:category.categoryId,baseUnitId:ea.unitId,sku:`CNV-SKU-${suffix}-${index}`,productName:`Conversion product ${index}`,isActive:true,isStockItem:true });
    products.push(product);
    productUnits.push({
      base:await seed(manager,ProductUnit,{ productId:product.productId,unitId:ea.unitId,conversionFactor:'1.000000',isBaseUnit:true,isActive:true }),
      case:await seed(manager,ProductUnit,{ productId:product.productId,unitId:caseUnit.unitId,conversionFactor:'24.000000',isBaseUnit:false,isActive:true }),
      decimal:await seed(manager,ProductUnit,{ productId:product.productId,unitId:decimalUnit.unitId,conversionFactor:'0.500000',isBaseUnit:false,isActive:true }),
    });
    await seed(manager,ProductLocation,{ productId:product.productId,locationId:location.locationId,isActive:true });
  }
  return { tenant,tenantId,user,location,products,productUnits };
}

async function stock(manager:EntityManager,f:Awaited<ReturnType<typeof fixture>>,product:number,quantity:string,averageCost:string) {
  return seed(manager,InventoryBalance,{ tenantId:f.tenantId,locationId:f.location.locationId,productId:f.products[product].productId,quantityOnHand:quantity,averageCost });
}
async function layers(manager:EntityManager,f:Awaited<ReturnType<typeof fixture>>,product:number,inputs:Array<[string,string]>) {
  const rows:InventoryAgeLayer[]=[];
  for (const [quantity,date] of inputs) rows.push(await seed(manager,InventoryAgeLayer,{ tenantId:f.tenantId,locationId:f.location.locationId,productId:f.products[product].productId,sourceDocumentType:'MYSQL_CONVERSION_TEST',sourceDocumentId:++seedCounter,sourceDocumentLineId:++seedCounter,receiptDate:date,originalQuantity:quantity,remainingQuantity:quantity,originalUnitCost:'100.0000',isActive:true }));
  return rows;
}
async function sourcePair(manager:EntityManager,f:Awaited<ReturnType<typeof fixture>>) {
  await stock(manager,f,0,'10','400'); await stock(manager,f,1,'10','600'); await layers(manager,f,0,[['10','2026-01-01']]); await layers(manager,f,1,[['10','2026-01-01']]);
}

type Input = { movementType:'AVAL'|'AVIN';product:number;quantity:string;unit?:'base'|'case'|'decimal';allocationPercent?:string;allocationWeight?:string };
const aval = (product:number,quantity:string,extra:Partial<Input>={}):Input => ({ movementType:'AVAL',product,quantity,...extra });
const avin = (product:number,quantity:string,extra:Partial<Input>={}):Input => ({ movementType:'AVIN',product,quantity,...extra });
async function create(service:InventoryConversionsService,f:Awaited<ReturnType<typeof fixture>>,allocationMethod:InventoryConversionAllocationMethod,inputs:Input[],remarks?:string) {
  const draft = await service.create({ locationId:Number(f.location.locationId),allocationMethod,remarks,lines:inputs.map(input => ({ movementType:input.movementType,productId:Number(f.products[input.product].productId),productUnitId:Number(f.productUnits[input.product][input.unit ?? 'base'].productUnitId),quantity:input.quantity,...(input.allocationPercent===undefined?{}:{ allocationPercent:input.allocationPercent }),...(input.allocationWeight===undefined?{}:{ allocationWeight:input.allocationWeight }) })) },f.user);
  (draft as InventoryConversion & { __productIds:number[] }).__productIds = f.products.map(product => Number(product.productId));
  return draft;
}
async function posted(manager:EntityManager,draft:InventoryConversion) {
  const header=await manager.getRepository(InventoryConversion).findOneByOrFail({ inventoryConversionId:draft.inventoryConversionId });
  const lines=await manager.getRepository(InventoryConversionLine).find({ where:{ inventoryConversionId:draft.inventoryConversionId },order:{ inventoryConversionLineId:'ASC' } });
  const ledger=await manager.getRepository(InventoryLedger).find({ where:{ tenantId:header.tenantId,sourceDocumentType:'INVENTORY_CONVERSION',sourceDocumentId:header.inventoryConversionId },order:{ inventoryLedgerId:'ASC' } });
  const balances=await manager.getRepository(InventoryBalance).findBy({ tenantId:header.tenantId,locationId:header.locationId });
  const ageLayers=await manager.getRepository(InventoryAgeLayer).findBy({ tenantId:header.tenantId,locationId:header.locationId });
  const productIds = (draft as InventoryConversion & { __productIds:number[] }).__productIds;
  return { header,lines,ledger,ageLayers,line:(product:number)=>lines.find(row=>Number(row.productId)===productIds[product])!,balance:(product:number)=>balances.find(row=>Number(row.productId)===productIds[product])! };
}

async function postingCounts(manager:EntityManager,tenantId:number) {
  const [row]=await manager.query(`SELECT
    (SELECT COUNT(*) FROM tbl_inventory_ledger WHERE tenant_id=? AND source_document_type='INVENTORY_CONVERSION') ledgers,
    (SELECT COUNT(*) FROM tbl_inventory_age_layer WHERE tenant_id=? AND source_document_type='INVENTORY_CONVERSION') conversionLayers,
    (SELECT COUNT(*) FROM tbl_inventory_conversion WHERE tenant_id=? AND status='POSTED') posted`,[tenantId,tenantId,tenantId]);
  return { ledgers:Number(row.ledgers),conversionLayers:Number(row.conversionLayers),posted:Number(row.posted) };
}
async function inventoryTotals(manager:EntityManager) {
  const [row]=await manager.query(`SELECT
    (SELECT COUNT(*) FROM tbl_inventory_conversion) conversions,
    (SELECT COUNT(*) FROM tbl_inventory_conversion_line) conversionLines,
    (SELECT COUNT(*) FROM tbl_inventory_balance) balances,
    (SELECT COUNT(*) FROM tbl_inventory_ledger) ledgers,
    (SELECT COUNT(*) FROM tbl_inventory_age_layer) layers,
    (SELECT COALESCE(SUM(quantity_on_hand),0) FROM tbl_inventory_balance) totalQuantity,
    (SELECT COALESCE(SUM(remaining_quantity),0) FROM tbl_inventory_age_layer) remainingLayers`);
  return row;
}
function executionContext(handler:Function,user:TenantPrincipal) {
  return { getHandler:()=>handler,getClass:()=>InventoryConversionsController,switchToHttp:()=>({ getRequest:()=>({ user }) }) } as any;
}
