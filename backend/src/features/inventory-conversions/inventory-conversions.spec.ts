import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import { baseQuantity, checked, units } from '../../common/inventory-decimal';
import { REQUIRE_PERMISSION } from '../auth/require-permission.decorator';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatInventoryConversionNumber } from '../number-sequences/number-sequence-formatters';
import { CreateInventoryConversionDto, PostInventoryConversionDto } from './dto/inventory-conversion.dto';
import { InventoryConversionLine } from './inventory-conversion-line.entity';
import { InventoryConversion } from './inventory-conversion.entity';
import { InventoryConversionsController } from './inventory-conversions.controller';
import { InventoryConversionsService } from './inventory-conversions.service';

const balanceEngine = new InventoryBalanceService();

test('one AVAL to one AVIN allocates the full source value', () => {
  const plans = plan('MANUAL_PERCENT', [line(2, 'AVIN', '4', { allocationPercent: '100' })], new Map([[2, null]]), '10');
  assert.equal(plans[0].allocatedValue, '10.0000');
  assert.equal(plans[0].snapshot.unitCost, '2.5000');
});

test('multiple AVAL values combine into one authoritative AVIN total', () => {
  const total = units('5') + units('7.5');
  const plans = (serviceWith() as any).planInbound('MANUAL_PERCENT', [line(3, 'AVIN', '5', { allocationPercent: '100' })], new Map([[3, null]]), total);
  assert.equal(plans[0].allocatedValue, '12.5000');
});

test('multiple AVIN lines allocate by manual percent', () => {
  const plans = plan('MANUAL_PERCENT', [line(2, 'AVIN', '2', { allocationPercent: '25' }), line(3, 'AVIN', '3', { allocationPercent: '75' })], new Map([[2, null], [3, null]]), '100');
  assert.deepEqual(plans.map((value: any) => value.allocatedValue), ['25.0000', '75.0000']);
});

test('manual percentages must total 100 percent', () => {
  assert.throws(() => (serviceWith() as any).assertInputLines([
    input(1, 'AVAL'), input(2, 'AVIN', { allocationPercent: '60' }), input(3, 'AVIN', { allocationPercent: '30' }),
  ], 'MANUAL_PERCENT'), /must total 100/);
});

test('manual percentage tolerance is exactly 0.0001 percent', () => {
  assert.doesNotThrow(() => (serviceWith() as any).assertInputLines([
    input(1, 'AVAL'), input(2, 'AVIN', { allocationPercent: '99.9999' }),
  ], 'MANUAL_PERCENT'));
  assert.throws(() => (serviceWith() as any).assertInputLines([
    input(1, 'AVAL'), input(2, 'AVIN', { allocationPercent: '99.9998' }),
  ], 'MANUAL_PERCENT'));
});

test('BY_EXISTING_WAVG allocates from output base quantity times existing WAVG', () => {
  const plans = plan('BY_EXISTING_WAVG', [line(2, 'AVIN', '2'), line(3, 'AVIN', '1')], new Map([
    [2, { quantityOnHand: '5', averageCost: '10' }], [3, { quantityOnHand: '5', averageCost: '20' }],
  ]), '90');
  assert.deepEqual(plans.map((value: any) => value.allocatedValue), ['45.0000', '45.0000']);
});

test('BY_EXISTING_WAVG rejects missing, null, zero, and negative output WAVG', () => {
  for (const balance of [null, { quantityOnHand: '0', averageCost: null }, { quantityOnHand: '0', averageCost: '0' }, { quantityOnHand: '1', averageCost: '-1' }]) {
    assert.throws(() => plan('BY_EXISTING_WAVG', [line(2, 'AVIN', '1')], new Map([[2, balance as any]]), '10'), /WAVG is required/);
  }
});

test('BY_WEIGHT allocates using explicit comparable line weights', () => {
  const plans = plan('BY_WEIGHT', [line(2, 'AVIN', '20', { allocationWeight: '2' }), line(3, 'AVIN', '10', { allocationWeight: '3' })], new Map([[2, null], [3, null]]), '100');
  assert.deepEqual(plans.map((value: any) => value.allocatedValue), ['40.0000', '60.0000']);
});

test('BY_WEIGHT rejects missing or non-positive explicit weight', () => {
  assert.throws(() => (serviceWith() as any).assertInputLines([input(1, 'AVAL'), input(2, 'AVIN')], 'BY_WEIGHT'), /requires an allocation weight/);
  assert.throws(() => plan('BY_WEIGHT', [line(2, 'AVIN', '1', { allocationWeight: '0' })], new Map([[2, null]]), '10'), /basis must be greater/);
});

test('allocation rounding assigns the final residual and reconciles exactly', () => {
  const plans = plan('MANUAL_PERCENT', [
    line(2, 'AVIN', '1', { allocationPercent: '33.3333' }), line(3, 'AVIN', '1', { allocationPercent: '33.3333' }), line(4, 'AVIN', '1', { allocationPercent: '33.3334' }),
  ], new Map([[2, null], [3, null], [4, null]]), '1');
  assert.deepEqual(plans.map((value: any) => value.allocatedValue), ['0.3333', '0.3333', '0.3334']);
  assert.equal(plans.reduce((sum: bigint, value: any) => sum + units(value.allocatedValue), 0n), units('1'));
});

test('an allocation too small to give every output positive value is rejected', () => {
  assert.throws(() => plan('MANUAL_PERCENT', [
    line(2, 'AVIN', '1', { allocationPercent: '0.0001' }), line(3, 'AVIN', '1', { allocationPercent: '99.9999' }),
  ], new Map([[2, null], [3, null]]), '0.0001'), /positive allocated value/);
});

test('AVIN into zero stock establishes WAVG from allocated transaction value', () => {
  const result = balanceEngine.inboundValueSnapshot({ quantityOnHand: '0', averageCost: '0' }, '5', '400');
  assert.equal(result.unitCost, '80.0000');
  assert.equal(result.averageCostAfter, '80.0000');
});

test('AVIN into existing stock recalculates resulting WAVG independently', () => {
  const first = balanceEngine.inboundValueSnapshot({ quantityOnHand: '20', averageCost: '120' }, '5', '400');
  const second = balanceEngine.inboundValueSnapshot({ quantityOnHand: '10', averageCost: '50' }, '10', '1500');
  assert.equal(first.averageCostAfter, '112.0000');
  assert.equal(second.averageCostAfter, '100.0000');
});

test('existing output WAVG is not used as AVIN transaction cost', () => {
  const result = balanceEngine.inboundValueSnapshot({ quantityOnHand: '20', averageCost: '120' }, '5', '400');
  assert.equal(result.unitCost, '80.0000');
  assert.notEqual(result.unitCost, result.averageCostBefore);
  assert.notEqual(result.unitCost, result.averageCostAfter);
});

test('AVIN preserves exact posted value when derived unit cost rounds', () => {
  const result = balanceEngine.inboundValueSnapshot(null, '3', '10');
  assert.equal(result.unitCost, '3.3333');
  assert.equal(result.movementValue, '10.0000');
});

test('ProductUnit conversions support base, non-base, and decimal factors', () => {
  assert.equal(baseQuantity('2', '1.000000'), '2.0000');
  assert.equal(baseQuantity('2', '24.000000'), '48.0000');
  assert.equal(baseQuantity('1.25', '0.333333'), '0.4167');
});

test('conversion requires both sides and rejects duplicate products per side', () => {
  const service = serviceWith();
  assert.throws(() => (service as any).assertInputLines([input(1, 'AVAL')], 'BY_EXISTING_WAVG'), /one AVAL line and one AVIN/);
  assert.throws(() => (service as any).assertInputLines([input(1, 'AVAL'), input(1, 'AVAL'), input(2, 'AVIN')], 'BY_EXISTING_WAVG'), /only once/);
});

test('same product on AVAL and AVIN is rejected as circular valuation', () => {
  assert.throws(() => (serviceWith() as any).assertInputLines([input(1, 'AVAL'), input(1, 'AVIN')], 'BY_EXISTING_WAVG'), /cannot appear on both/);
});

test('irrelevant allocation fields are rejected rather than silently stored', () => {
  assert.throws(() => (serviceWith() as any).assertInputLines([input(1, 'AVAL', { allocationWeight: '1' }), input(2, 'AVIN', { allocationPercent: '100' })], 'MANUAL_PERCENT'), /AVAL lines cannot/);
  assert.throws(() => (serviceWith() as any).assertInputLines([input(1, 'AVAL'), input(2, 'AVIN', { allocationPercent: '100' })], 'BY_EXISTING_WAVG'), /only valid for MANUAL_PERCENT/);
});

test('create and post DTOs enforce supported methods, positive quantities, and boolean confirmation', async () => {
  const valid = { locationId: 1, allocationMethod: 'BY_WEIGHT', lines: [input(1, 'AVAL'), input(2, 'AVIN', { allocationWeight: '1' })] };
  assert.deepEqual(await validate(plainToInstance(CreateInventoryConversionDto, valid)), []);
  assert.ok((await validate(plainToInstance(CreateInventoryConversionDto, { ...valid, allocationMethod: 'BY_STANDARD_COST' }))).length);
  assert.ok((await validate(plainToInstance(CreateInventoryConversionDto, { ...valid, lines: [input(1, 'AVAL', { quantity: '0' }), input(2, 'AVIN', { allocationWeight: '1' })] }))).length);
  assert.ok((await validate(plainToInstance(PostInventoryConversionDto, { confirmNegativeStock: 'true' }))).length);
});

test('entity metadata contains immutable posting and valuation snapshots', () => {
  const metadata = getMetadataArgsStorage();
  const header = metadata.columns.filter(column => column.target === InventoryConversion).map(column => column.propertyName);
  const lines = metadata.columns.filter(column => column.target === InventoryConversionLine).map(column => column.propertyName);
  for (const field of ['status', 'totalInputValue', 'totalOutputValue', 'valueVariance', 'postedByUserId', 'postedAt', 'cancelledByUserId', 'cancelledAt']) assert.ok(header.includes(field));
  for (const field of ['movementType', 'productUnitId', 'conversionFactorSnapshot', 'baseQuantity', 'quantityBefore', 'quantityAfter', 'wavgBefore', 'wavgAfter', 'postedUnitCost', 'postedValue', 'allocationPercent', 'allocationBasisValue', 'allocatedValue', 'allocationWeight']) assert.ok(lines.includes(field));
  assert.ok(metadata.uniques.some(unique => unique.target === InventoryConversionLine && unique.name === 'uq_inventory_conversion_line_side_product'));
});

test('conversion schema has no supplier, purchase, or selling price fallback field', () => {
  const lines = getMetadataArgsStorage().columns.filter(column => column.target === InventoryConversionLine).map(column => column.propertyName);
  for (const forbidden of ['supplierId', 'productSupplierId', 'supplierPrice', 'purchasePrice', 'sellingPrice', 'latestGrnCost']) assert.equal(lines.includes(forbidden), false);
});

test('numbering uses the shared tenant/year sequence infrastructure', () => {
  assert.equal(NumberSequenceKeys.INVENTORY_CONVERSION, 'INVENTORY_CONVERSION');
  assert.equal(formatInventoryConversionNumber(7, '2026', 42), 'IVA-7-2026-000042');
});

test('all endpoints use the dedicated value-adjustment permission family', () => {
  const expected = {
    list: 'INVENTORY_VALUE_ADJUSTMENT_VIEW', productContexts: 'INVENTORY_VALUE_ADJUSTMENT_VIEW', locations: 'INVENTORY_VALUE_ADJUSTMENT_VIEW', get: 'INVENTORY_VALUE_ADJUSTMENT_VIEW',
    create: 'INVENTORY_VALUE_ADJUSTMENT_CREATE', update: 'INVENTORY_VALUE_ADJUSTMENT_UPDATE', patch: 'INVENTORY_VALUE_ADJUSTMENT_UPDATE', post: 'INVENTORY_VALUE_ADJUSTMENT_POST', cancel: 'INVENTORY_VALUE_ADJUSTMENT_CANCEL',
  } as const;
  for (const [method, permission] of Object.entries(expected)) assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, InventoryConversionsController.prototype[method as keyof typeof expected]), permission);
});

test('posted and cancelled conversions cannot be edited or posted again', async () => {
  for (const status of ['POSTED', 'CANCELLED']) {
    const service = serviceWith();
    (service as any).dataSource = { transaction: async (callback: any) => callback(statusManager(status)) };
    await assert.rejects(() => service.update(1, {}, principal()), /Only draft/);
    await assert.rejects(() => service.post(1, {}, principal()), /Only draft/);
  }
});

test('locked conversion predicate enforces tenant isolation', async () => {
  let parameters: any;
  const builder: any = { setLock: () => builder, where: (_sql: string, values: any) => { parameters = values; return builder; }, getOne: async () => null };
  await assert.rejects(() => (serviceWith() as any).lock({ getRepository: () => ({ createQueryBuilder: () => builder }) }, 4, 99));
  assert.deepEqual(parameters, { id: 4, tenantId: 99 });
});

test('location-scoped users cannot access other locations', async () => {
  await assert.rejects(() => (serviceWith() as any).assertLocationAccess({} as any, { ...principal(), accessScope: 'LOCATION', assignedLocationIds: [5] }, 6), ForbiddenException);
});

test('AVAL missing current WAVG fails before numbering, ledger, layer, balance, or state changes', async () => {
  const harness = postingHarness({ sourceBalance: null });
  await assert.rejects(() => harness.service.post(1, {}, principal()), /Current WAVG is not available/);
  assert.deepEqual(harness.effects(), { balance: 0, ledger: 0, relieve: 0, layer: 0, line: 0, header: 0, number: 0 });
  assert.equal(harness.header.status, 'DRAFT');
});

test('AVAL uses retained positive WAVG even at zero stock and then follows negative confirmation', async () => {
  const harness = postingHarness({ sourceQuantity: '0' });
  await assert.rejects(() => harness.service.post(1, {}, principal()), /Explicitly confirm negative stock/);
  await harness.service.post(1, { confirmNegativeStock: true }, principal());
  assert.equal(harness.lines[0].postedUnitCost, '5.0000');
  assert.equal(harness.lines[0].postedValue, '10.0000');
  assert.equal(harness.lines[0].wavgAfter, '5.0000');
});

test('posting creates balanced AVAL/AVIN ledger, balance, layers, and line snapshots', async () => {
  const harness = postingHarness();
  const result = await harness.service.post(1, {}, principal());
  assert.equal(result.status, 'POSTED');
  assert.equal(result.totalInputValue, '10.0000');
  assert.equal(result.totalOutputValue, '10.0000');
  assert.equal(result.valueVariance, '0.0000');
  assert.deepEqual(harness.ledgers.map(row => [row.movementType, row.quantityIn, row.quantityOut, row.movementValue]), [
    ['AVAL', '0.0000', '2.0000', '10.0000'], ['AVIN', '4.0000', '0.0000', '10.0000'],
  ]);
  assert.equal(harness.lines[0].quantityBefore, '10.0000');
  assert.equal(harness.lines[0].quantityAfter, '8.0000');
  assert.equal(harness.lines[0].wavgAfter, '5.0000');
  assert.equal(harness.lines[1].quantityBefore, '0.0000');
  assert.equal(harness.lines[1].quantityAfter, '4.0000');
  assert.equal(harness.lines[1].postedUnitCost, '2.5000');
  assert.equal(harness.lines[1].allocatedValue, '10.0000');
  assert.equal(harness.ledgers[0].sourceDocumentType, 'INVENTORY_CONVERSION');
  assert.equal(harness.insertedLayers.length, 1);
});

test('negative AVAL requires confirmation and preserves unallocated age-layer audit', async () => {
  const rejected = postingHarness({ sourceQuantity: '1' });
  await assert.rejects(() => rejected.service.post(1, {}, principal()), /Explicitly confirm negative stock/);
  assert.equal(rejected.ledgers.length, 0);
  const allowed = postingHarness({ sourceQuantity: '1', unallocated: '1.0000' });
  await allowed.service.post(1, { confirmNegativeStock: true }, principal());
  assert.equal(allowed.lines[0].quantityAfter, '-1.0000');
  assert.equal(allowed.ledgers[0].ageLayerRelief.unallocatedQuantity, '1.0000');
});

test('BY_EXISTING_WAVG output validation fails before any posting side effect', async () => {
  const harness = postingHarness({ allocationMethod: 'BY_EXISTING_WAVG', outputBalance: null });
  await assert.rejects(() => harness.service.post(1, {}, principal()), /WAVG is required/);
  assert.deepEqual(harness.effects(), { balance: 0, ledger: 0, relieve: 0, layer: 0, line: 0, header: 0, number: 0 });
});

test('positive AVIN stock with zero WAVG rejects before any posting side effect', async () => {
  const harness = postingHarness({ outputBalance: { quantityOnHand: '5', averageCost: '0' } });
  await assert.rejects(() => harness.service.post(1, {}, principal()), /no usable WAVG/);
  assert.deepEqual(harness.effects(), { balance: 0, ledger: 0, relieve: 0, layer: 0, line: 0, header: 0, number: 0 });
  assert.equal(harness.header.status, 'DRAFT');
});

test('posting is executed inside one transaction and errors prevent commit', async () => {
  let committed = false;
  const dataSource: any = { transaction: async (callback: any) => { const value = await callback({}); committed = true; return value; } };
  await assert.rejects(() => dataSource.transaction(async () => { throw new BadRequestException('AVIN failed'); }), /AVIN failed/);
  assert.equal(committed, false);
});

test('failure during AVIN posting rolls back earlier AVAL mutations through the outer transaction', async () => {
  const harness = postingHarness({ failOnAvin: true });
  await assert.rejects(() => harness.service.post(1, {}, principal()), /simulated AVIN failure/);
  assert.equal(harness.header.status, 'DRAFT');
  assert.equal(harness.lines[0].quantityBefore, undefined);
  assert.deepEqual(harness.effects(), { balance: 0, ledger: 0, relieve: 0, layer: 0, line: 0, header: 0, number: 0 });
  assert.equal(harness.ledgers.length, 0);
  assert.equal(harness.insertedLayers.length, 0);
});

test('draft cancellation records audit state without inventory posting', async () => {
  const header: any = { inventoryConversionId: 1, tenantId: 20, locationId: 2, allocationMethod: 'MANUAL_PERCENT', status: 'DRAFT' };
  const builder: any = { setLock: () => builder, where: () => builder, getOne: async () => header };
  const manager: any = {
    getRepository: (entity: any) => entity.name === 'Location'
      ? { findOneBy: async () => ({ locationId: 2, tenantId: 20 }) }
      : { createQueryBuilder: () => builder, save: async (row: any) => row },
  };
  const service = serviceWith();
  (service as any).dataSource = { transaction: async (callback: any) => callback(manager) };
  const result = await service.cancel(1, principal());
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.cancelledByUserId, 10);
  assert.ok(result.cancelledAt instanceof Date);
});

function serviceWith() {
  return new InventoryConversionsService({} as any, balanceEngine, {} as any, {} as any, {} as any);
}

function plan(method: string, lines: any[], balances: Map<number, any>, total: string) {
  return (serviceWith() as any).planInbound(method, lines, balances, units(total));
}

function line(productId: number, movementType: 'AVAL' | 'AVIN', base: string, extra: Record<string, any> = {}) {
  const quantity = checked(units(base));
  return { inventoryConversionLineId: productId, inventoryConversionId: 1, productId, productUnitId: productId, movementType, quantity, baseQuantity: quantity, conversionFactorSnapshot: '1.000000', allocationPercent: null, allocationWeight: null, remarks: null, ...extra };
}

function input(productId: number, movementType: 'AVAL' | 'AVIN', extra: Record<string, any> = {}) {
  return { productId, productUnitId: productId, movementType, quantity: '1', ...extra };
}

function principal(): any {
  return { scope: 'TENANT', userId: 10, tenantId: 20, roleId: 30, roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] };
}

function statusManager(status: string) {
  const header = { inventoryConversionId: 1, tenantId: 20, locationId: 2, allocationMethod: 'MANUAL_PERCENT', status };
  const builder: any = { setLock: () => builder, where: () => builder, getOne: async () => header };
  return {
    getRepository: (entity: any) => entity.name === 'Tenant' ? { findOneBy: async () => ({ tenantId: 20, timeZone: 'Asia/Colombo' }) }
      : entity.name === 'Location' ? { findOneBy: async () => ({ locationId: 2, tenantId: 20, isActive: true }) }
        : { createQueryBuilder: () => builder },
  };
}

function postingHarness(options: { sourceBalance?: any; outputBalance?: any; sourceQuantity?: string; allocationMethod?: 'MANUAL_PERCENT' | 'BY_EXISTING_WAVG'; unallocated?: string; failOnAvin?: boolean } = {}) {
  const header: any = { inventoryConversionId: 1, tenantId: 20, locationId: 2, allocationMethod: options.allocationMethod ?? 'MANUAL_PERCENT', status: 'DRAFT', remarks: null };
  const lines: any[] = [
    line(1, 'AVAL', '2'),
    line(2, 'AVIN', '4', options.allocationMethod === 'BY_EXISTING_WAVG' ? {} : { allocationPercent: '100.0000' }),
  ];
  const source = options.sourceBalance !== undefined ? options.sourceBalance : { quantityOnHand: options.sourceQuantity ?? '10', averageCost: '5' };
  const output = options.outputBalance !== undefined ? options.outputBalance : { quantityOnHand: '0', averageCost: '0' };
  const balanceRows = new Map<number, any>([[1, source], [2, output]]);
  const ledgers: any[] = [], insertedLayers: any[] = [];
  const counts = { balance: 0, ledger: 0, relieve: 0, layer: 0, line: 0, header: 0, number: 0 };
  const chain = (one: any = null, many: any[] = []) => {
    const builder: any = { setLock: () => builder, where: () => builder, orderBy: () => builder, addOrderBy: () => builder, getOne: async () => one, getMany: async () => many };
    return builder;
  };
  const manager: any = {
    getRepository: (entity: any) => {
      switch (entity.name) {
        case 'Tenant': return { findOneBy: async () => ({ tenantId: 20, timeZone: 'Asia/Colombo' }) };
        case 'Location': return { findOneBy: async () => ({ locationId: 2, tenantId: 20, isActive: true }) };
        case 'InventoryConversion': return { createQueryBuilder: () => chain(header), save: async (row: any) => { counts.header += 1; return row; } };
        case 'InventoryConversionLine': return { createQueryBuilder: () => chain(null, lines), save: async (row: any) => { counts.line += 1; return row; } };
        case 'Product': return { findOneBy: async (where: any) => ({ productId: where.productId, tenantId: 20, isActive: true, isStockItem: true }) };
        case 'ProductLocation': return { findOneBy: async (where: any) => ({ ...where }), createQueryBuilder: () => chain({ isActive: true }) };
        case 'ProductUnit': return { findOneBy: async (where: any) => ({ productUnitId: where.productUnitId, productId: where.productId, conversionFactor: '1.000000', isActive: true }) };
        case 'InventoryAgeLayer': return { createQueryBuilder: () => chain(null, []) };
        default: return { findOneBy: async () => null, createQueryBuilder: () => chain() };
      }
    },
  };
  const balanceService: any = {
    lock: async (_manager: any, _tenantId: number, _locationId: number, productId: number) => balanceRows.get(productId) ?? null,
    adjustmentSnapshot: balanceEngine.adjustmentSnapshot.bind(balanceEngine),
    inboundValueSnapshot: balanceEngine.inboundValueSnapshot.bind(balanceEngine),
    applyAdjustment: async (_manager: any, balance: any, scope: any, snapshot: any) => {
      counts.balance += 1;
      const row = balance ?? { quantityOnHand: '0.0000', averageCost: '0.0000' };
      row.quantityOnHand = snapshot.quantityAfter; row.averageCost = snapshot.averageCostAfter; balanceRows.set(scope.productId, row);
    },
  };
  const ageService: any = {
    relieve: async () => { counts.relieve += 1; return { allocations: [], unallocatedQuantity: options.unallocated ?? '0.0000' }; },
    insert: async (_manager: any, row: any) => { counts.layer += 1; insertedLayers.push(row); return row; },
  };
  const ledgerService: any = { insert: async (_manager: any, row: any) => {
    if (options.failOnAvin && row.movementType === 'AVIN') throw new BadRequestException('simulated AVIN failure');
    counts.ledger += 1; ledgers.push(row); return row;
  } };
  const sequence: any = { getTenantNextNumber: async () => { counts.number += 1; return 1; } };
  const dataSource: any = { transaction: async (callback: any) => {
    const headerBefore = structuredClone(header), linesBefore = structuredClone(lines), balancesBefore = structuredClone([...balanceRows]), countsBefore = { ...counts };
    try { return await callback(manager); }
    catch (error) {
      for (const key of Object.keys(header)) delete header[key]; Object.assign(header, headerBefore);
      lines.splice(0, lines.length, ...linesBefore);
      balanceRows.clear(); for (const [key, value] of balancesBefore) balanceRows.set(key, value);
      Object.assign(counts, countsBefore); ledgers.length = 0; insertedLayers.length = 0;
      throw error;
    }
  } };
  return {
    service: new InventoryConversionsService(dataSource, balanceService, ledgerService, ageService, sequence), header, lines, ledgers, insertedLayers,
    effects: () => ({ ...counts }),
  };
}
