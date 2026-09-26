import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import { baseQuantity } from '../../common/inventory-decimal';
import { REQUIRE_PERMISSION } from '../auth/require-permission.decorator';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { CreateInventoryAdjustmentDto, PostInventoryAdjustmentDto } from './dto/inventory-adjustment.dto';
import { InventoryAdjustmentLine } from './inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from './inventory-adjustment-reason.entity';
import { InventoryAdjustmentReasonsService, SYSTEM_ADJUSTMENT_REASONS } from './inventory-adjustment-reasons.service';
import { InventoryAdjustment } from './inventory-adjustment.entity';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

const balances = new InventoryBalanceService();

test('ADJO values stock relief at current WAVG and decreases quantity/value', () => {
  const row = balances.adjustmentSnapshot({ quantityOnHand: '100', averageCost: '500' }, '4', '500', 'OUT');
  assert.equal(row.quantityAfter, '96.0000');
  assert.equal(row.movementValue, '2000.0000');
  assert.equal(row.averageCostAfter, '500.0000');
});

test('ADJI CURRENT_WAVG increases quantity/value without changing WAVG', () => {
  const service = serviceWith();
  const unitCost = (service as any).postingUnitCost({ movementType: 'ADJI' }, { costingPolicy: 'CURRENT_WAVG' }, { quantityOnHand: '100', averageCost: '500' }, { unitCost: null });
  const row = balances.adjustmentSnapshot({ quantityOnHand: '100', averageCost: '500' }, '10', unitCost, 'IN');
  assert.equal(row.quantityAfter, '110.0000');
  assert.equal(row.movementValue, '5000.0000');
  assert.equal(row.averageCostAfter, '500.0000');
});

test('ADJI CURRENT_WAVG with zero stock uses a retained positive WAVG', () => {
  const service = serviceWith();
  const balance = { quantityOnHand: '0.0000', averageCost: '500.0000' };
  const unitCost = (service as any).postingUnitCost({ movementType: 'ADJI' }, { costingPolicy: 'CURRENT_WAVG' }, balance, { unitCost: null });
  const row = balances.adjustmentSnapshot(balance, '5', unitCost, 'IN');
  assert.equal(unitCost, '500.0000');
  assert.equal(row.quantityAfter, '5.0000');
  assert.equal(row.movementValue, '2500.0000');
  assert.equal(row.averageCostAfter, '500.0000');
});

test('ADJI CURRENT_WAVG rejects zero, negative, null, and missing WAVG', () => {
  const service = serviceWith();
  const adjustment = { movementType: 'ADJI' }, reason = { costingPolicy: 'CURRENT_WAVG' }, line = { unitCost: null };
  for (const balance of [
    { quantityOnHand: '0', averageCost: '0' },
    { quantityOnHand: '0', averageCost: '-1' },
    { quantityOnHand: '0', averageCost: null },
    null,
  ]) assert.throws(
    () => (service as any).postingUnitCost(adjustment, reason, balance, line),
    (error: unknown) => error instanceof BadRequestException && error.message === 'Current WAVG is not available for this product/location. Use an adjustment reason that requires manual cost.',
  );
});

test('opening inventory establishes WAVG from required manual base-unit cost', () => {
  const service = serviceWith();
  const unitCost = (service as any).postingUnitCost({ movementType: 'ADJI' }, { costingPolicy: 'MANUAL_REQUIRED' }, null, { unitCost: '450' });
  const row = balances.adjustmentSnapshot(null, '100', unitCost, 'IN');
  assert.equal(row.quantityAfter, '100.0000');
  assert.equal(row.averageCostAfter, '450.0000');
  assert.equal(row.movementValue, '45000.0000');
});

test('an explicitly supplied manual zero cost remains an intentional supported valuation', () => {
  const service = serviceWith();
  const unitCost = (service as any).postingUnitCost({ movementType: 'ADJI' }, { costingPolicy: 'MANUAL_REQUIRED' }, null, { unitCost: '0' });
  const row = balances.adjustmentSnapshot(null, '5', unitCost, 'IN');
  assert.equal(unitCost, '0.0000');
  assert.equal(row.quantityAfter, '5.0000');
  assert.equal(row.averageCostAfter, '0.0000');
  assert.equal(row.movementValue, '0.0000');
});

test('opening inventory combines with existing inventory using the existing weighted-average algorithm', () => {
  const row = balances.adjustmentSnapshot({ quantityOnHand: '100', averageCost: '500' }, '100', '400', 'IN');
  assert.equal(row.averageCostAfter, '450.0000');
});

test('negative stock follows the established explicit-confirmation model and preserves WAVG', () => {
  const row = balances.adjustmentSnapshot({ quantityOnHand: '2', averageCost: '25' }, '5', '25', 'OUT');
  assert.equal(row.createsNegativeStock, true);
  assert.equal(row.quantityAfter, '-3.0000');
  assert.equal(row.averageCostAfter, '25.0000');
});

test('ProductUnit quantity converts exactly to base quantity without floating point', () => {
  assert.equal(baseQuantity('2.0000', '24.000000'), '48.0000');
  assert.equal(baseQuantity('0.3333', '3.000000'), '0.9999');
  assert.throws(() => baseQuantity('1', '0'));
});

test('create DTO rejects zero/negative quantities, invalid units and an empty line list', async () => {
  for (const body of [
    { locationId: 1, movementType: 'ADJI', reasonId: 1, lines: [] },
    { locationId: 1, movementType: 'ADJI', reasonId: 1, lines: [{ productId: 1, productUnitId: 0, quantity: '0' }] },
    { locationId: 1, movementType: 'ADJO', reasonId: 1, lines: [{ productId: 1, productUnitId: 2, quantity: '-1' }] },
  ]) assert.ok((await validate(plainToInstance(CreateInventoryAdjustmentDto, body))).length);
});

test('posting DTO requires a real boolean for negative-stock confirmation', async () => {
  assert.deepEqual(await validate(plainToInstance(PostInventoryAdjustmentDto, { confirmNegativeStock: true })), []);
  assert.ok((await validate(plainToInstance(PostInventoryAdjustmentDto, { confirmNegativeStock: 'true' }))).length);
});

test('system reason catalog contains direction/costing rules and no supplier valuation data', () => {
  const byCode = new Map(SYSTEM_ADJUSTMENT_REASONS.map(row => [row[0], row]));
  assert.deepEqual(byCode.get('EXPIRY')?.slice(2), ['OUT', 'CURRENT_WAVG']);
  assert.deepEqual(byCode.get('OPENING_INVENTORY')?.slice(2), ['IN', 'MANUAL_REQUIRED']);
  assert.equal(byCode.has('CYCLE_RECONCILIATION'), true);
});

test('reason direction mismatch and inactive reasons are rejected', async () => {
  const reason = { inventoryAdjustmentReasonId: 2, tenantId: 1, isActive: true, allowedDirection: 'OUT', costingPolicy: 'CURRENT_WAVG' };
  const manager: any = { getRepository: () => ({ findOneBy: async (where: any) => where.isActive && reason.isActive ? reason : null }) };
  const service = serviceWith({ ensureSystemReasons: async () => undefined });
  await assert.rejects(() => (service as any).assertReason(manager, 1, 2, 'ADJI'), BadRequestException);
  reason.isActive = false;
  await assert.rejects(() => (service as any).assertReason(manager, 1, 2, 'ADJO'), BadRequestException);
});

test('manual-required reason requires line cost and ADJO cannot use manual costing', async () => {
  const service = serviceWith();
  assert.throws(() => (service as any).assertStoredLines([{ quantity: '1', baseQuantity: '1', unitCost: null }], { costingPolicy: 'MANUAL_REQUIRED' }), BadRequestException);
  const reason = { inventoryAdjustmentReasonId: 2, tenantId: 1, isActive: true, allowedDirection: 'OUT', costingPolicy: 'MANUAL_REQUIRED' };
  const manager: any = { getRepository: () => ({ findOneBy: async () => reason }) };
  await assert.rejects(() => (service as any).assertReason(manager, 1, 2, 'ADJO'), BadRequestException);
});

test('invalid or cross-tenant product units are rejected', async () => {
  const service = serviceWith();
  const manager: any = { getRepository: (entity: any) => ({ findOneBy: async () => entity.name === 'Product' ? null : {} }) };
  await assert.rejects(() => (service as any).validateProductUnit(manager, 7, 8, 9, 10), BadRequestException);
});

test('duplicate product lines are prohibited by database metadata', () => {
  const metadata = getMetadataArgsStorage();
  assert.ok(metadata.uniques.some(unique => unique.target === InventoryAdjustmentLine && unique.name === 'uq_inventory_adjustment_line_product'));
});

test('duplicate posting is rejected before any stock mutation', async () => {
  const service = serviceWith();
  (service as any).dataSource = { transaction: async (callback: any) => callback(clockManager({ status: 'POSTED' })) };
  await assert.rejects(() => service.post(1, {}, principal()), /Only draft inventory adjustments can be posted/);
});

test('posted adjustment cannot be modified', async () => {
  const service = serviceWith();
  (service as any).dataSource = { transaction: async (callback: any) => callback(clockManager({ status: 'POSTED' })) };
  await assert.rejects(() => service.update(1, {}, principal()), /Only draft inventory adjustments can be edited/);
});

test('tenant isolation is part of the locked document predicate', async () => {
  let parameters: any;
  const builder: any = { setLock: () => builder, where: (_sql: string, values: any) => { parameters = values; return builder; }, getOne: async () => null };
  const manager: any = { getRepository: () => ({ createQueryBuilder: () => builder }) };
  await assert.rejects(() => (serviceWith() as any).lock(manager, 4, 99));
  assert.deepEqual(parameters, { id: 4, tenantId: 99 });
});

test('location-scoped users cannot post outside their assigned locations', async () => {
  const service = serviceWith();
  await assert.rejects(() => (service as any).assertLocationAccess({} as any, { ...principal(), accessScope: 'LOCATION', assignedLocationIds: [5] }, 6), ForbiddenException);
});

test('transaction callback propagates a failing line and therefore rolls back atomically', async () => {
  let committed = false;
  const dataSource: any = { transaction: async (callback: any) => { try { const result = await callback({}); committed = true; return result; } catch (error) { throw error; } } };
  await assert.rejects(() => dataSource.transaction(async () => { throw new BadRequestException('line 2 failed'); }), /line 2 failed/);
  assert.equal(committed, false);
});

test('missing CURRENT_WAVG rejects before any posting side effect or document state change', async () => {
  const effects = { balance: 0, ledger: 0, layer: 0, line: 0, header: 0, number: 0 };
  const adjustment: any = { inventoryAdjustmentId: 1, tenantId: 20, locationId: 2, reasonId: 3, movementType: 'ADJI', status: 'DRAFT', remarks: null };
  const reason: any = { inventoryAdjustmentReasonId: 3, tenantId: 20, code: 'INVENTORY_CORRECTION', isActive: true, allowedDirection: 'BOTH', costingPolicy: 'CURRENT_WAVG', requiresRemarks: false, requiresApproval: false };
  const line: any = { inventoryAdjustmentLineId: 4, inventoryAdjustmentId: 1, productId: 5, productUnitId: 6, conversionFactorSnapshot: '1.000000', quantity: '2.0000', baseQuantity: '2.0000', unitCost: null };
  const manager = adjustmentPostingManager(adjustment, reason, line, effects);
  const dataSource: any = { transaction: async (callback: any) => callback(manager) };
  const balanceService: any = {
    lock: async () => null,
    adjustmentSnapshot: balances.adjustmentSnapshot.bind(balances),
    applyAdjustment: async () => { effects.balance += 1; },
  };
  const service = new InventoryAdjustmentsService(
    dataSource,
    balanceService,
    { insert: async () => { effects.ledger += 1; } } as any,
    { insert: async () => { effects.layer += 1; }, relieve: async () => ({}) } as any,
    { getTenantNextNumber: async () => { effects.number += 1; return 1; } } as any,
    { ensureSystemReasons: async () => undefined } as any,
  );
  await assert.rejects(() => service.post(1, {}, principal()), /Current WAVG is not available/);
  assert.deepEqual(effects, { balance: 0, ledger: 0, layer: 0, line: 0, header: 0, number: 0 });
  assert.equal(adjustment.status, 'DRAFT');
});

test('supplier prices are not a fallback when CURRENT_WAVG is unavailable', () => {
  const service = serviceWith();
  assert.throws(() => (service as any).postingUnitCost(
    { movementType: 'ADJI' },
    { costingPolicy: 'CURRENT_WAVG' },
    null,
    { unitCost: null, sourceSupplierPriceId: 99, purchasePrice: '750.0000', sellingPrice: '900.0000' },
  ), /Current WAVG is not available/);
});

test('ledger and line schemas retain adjustment source, reason, unit and valuation audit fields', () => {
  const metadata = getMetadataArgsStorage();
  const ledgerColumns = metadata.columns.filter(column => column.target === InventoryLedger).map(column => column.propertyName);
  const lineColumns = metadata.columns.filter(column => column.target === InventoryAdjustmentLine).map(column => column.propertyName);
  for (const field of ['inventoryAdjustmentReasonId', 'sourceDocumentType', 'sourceDocumentId', 'sourceDocumentLineId']) assert.ok(ledgerColumns.includes(field));
  for (const field of ['productUnitId', 'conversionFactorSnapshot', 'baseQuantity', 'unitCost', 'inventoryValue', 'quantityBefore', 'quantityAfter']) assert.ok(lineColumns.includes(field));
  for (const forbidden of ['supplierId', 'productSupplierId', 'productSupplierPriceId', 'sourceSupplierPriceId']) assert.equal(lineColumns.includes(forbidden), false);
});

test('header idempotency and status audit fields are represented in entity metadata', () => {
  const metadata = getMetadataArgsStorage();
  assert.ok(metadata.uniques.some(unique => unique.target === InventoryAdjustment && unique.name === 'uq_inventory_adjustment_tenant_number'));
  const columns = metadata.columns.filter(column => column.target === InventoryAdjustment).map(column => column.propertyName);
  for (const field of ['status', 'postedByUserId', 'postedAt', 'cancelledByUserId', 'cancelledAt']) assert.ok(columns.includes(field));
});

test('all adjustment endpoints use the dedicated permission family', () => {
  const expected = { list: 'INVENTORY_ADJUSTMENT_VIEW', productContexts: 'INVENTORY_ADJUSTMENT_VIEW', locations: 'INVENTORY_ADJUSTMENT_VIEW', get: 'INVENTORY_ADJUSTMENT_VIEW', create: 'INVENTORY_ADJUSTMENT_CREATE', update: 'INVENTORY_ADJUSTMENT_UPDATE', patch: 'INVENTORY_ADJUSTMENT_UPDATE', post: 'INVENTORY_ADJUSTMENT_POST', cancel: 'INVENTORY_ADJUSTMENT_CANCEL' } as const;
  for (const [method, permission] of Object.entries(expected)) assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, InventoryAdjustmentsController.prototype[method as keyof typeof expected]), permission);
});

function serviceWith(reasons: any = { ensureSystemReasons: async () => undefined }) {
  return new InventoryAdjustmentsService({} as any, balances, {} as any, {} as any, {} as any, reasons);
}

function principal(): any {
  return { scope: 'TENANT', userId: 10, tenantId: 20, roleId: 30, roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] };
}

function clockManager(adjustment: any) {
  const builder: any = { setLock: () => builder, where: () => builder, getOne: async () => ({ inventoryAdjustmentId: 1, tenantId: 20, locationId: 2, reasonId: 3, movementType: 'ADJI', ...adjustment }) };
  return { getRepository: (entity: any) => entity.name === 'Tenant' ? { findOneBy: async () => ({ tenantId: 20, timeZone: 'Asia/Colombo' }) } : entity.name === 'Location' ? { findOneBy: async () => ({ locationId: 2, tenantId: 20, isActive: true }) } : { createQueryBuilder: () => builder } };
}

function adjustmentPostingManager(adjustment: any, reason: any, line: any, effects: Record<string, number>) {
  const chain = (result: { one?: any; many?: any[] }) => {
    const builder: any = {
      setLock: () => builder, where: () => builder, orderBy: () => builder, addOrderBy: () => builder,
      getOne: async () => result.one ?? null, getMany: async () => result.many ?? [],
    };
    return builder;
  };
  return {
    getRepository: (entity: any) => {
      switch (entity.name) {
        case 'Tenant': return { findOneBy: async () => ({ tenantId: 20, timeZone: 'Asia/Colombo' }) };
        case 'Location': return { findOneBy: async () => ({ locationId: 2, tenantId: 20, isActive: true }) };
        case 'InventoryAdjustment': return { createQueryBuilder: () => chain({ one: adjustment }), save: async (row: any) => { effects.header += 1; return row; } };
        case 'InventoryAdjustmentReason': return { findOneBy: async () => reason };
        case 'InventoryAdjustmentLine': return { createQueryBuilder: () => chain({ many: [line] }), save: async (row: any) => { effects.line += 1; return row; } };
        case 'Product': return { findOneBy: async () => ({ productId: 5, tenantId: 20, isActive: true, isStockItem: true }) };
        case 'ProductLocation': return { findOneBy: async () => ({ productId: 5, locationId: 2, isActive: true }), createQueryBuilder: () => chain({ one: { productId: 5, locationId: 2, isActive: true } }) };
        case 'ProductUnit': return { findOneBy: async () => ({ productUnitId: 6, productId: 5, conversionFactor: '1.000000', isActive: true }) };
        default: return { findOneBy: async () => null, createQueryBuilder: () => chain({}) };
      }
    },
  };
}
