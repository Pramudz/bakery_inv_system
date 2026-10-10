import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { businessDateAt } from '../../common/business-date';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryOpeningClaim } from '../inventory-adjustments/inventory-opening-claim.entity';
import { InventoryAdjustmentLine } from '../inventory-adjustments/inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from '../inventory-adjustments/inventory-adjustment-reason.entity';
import { lockOpeningTarget } from '../inventory-adjustments/inventory-opening-guard';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Location } from '../locations/locations.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Tenant } from '../tenants/tenant.entity';
import { OpeningInventoryImportBatch } from './opening-inventory-import-batch.entity';
import { OpeningRawRow, OpeningResultRow, openingResultsWorkbook, openingTemplate, openingValidationWorkbook, parseOpeningWorkbook } from './opening-inventory-import.excel';
import { OpeningInventoryImportService } from './opening-inventory-import.service';

const user = { scope: 'TENANT', tenantId: 7, userId: 9, roleCode: 'TENANT_ADMIN', roleId: 1,
  accessScope: 'TENANT', assignedLocationIds: [] } as any;
const row = (location = 'MAIN', sku = 'SKU-1', unit = 'EA', quantity = '2', cost = '3.2500'): OpeningRawRow => ({
  rowNumber: 2, values: { LocationCode: location, SKU: sku, UnitCode: unit, Quantity: quantity,
    BaseUnitCost: cost, Remarks: '', RowReference: 'REF-1' },
});
const importer = () => new OpeningInventoryImportService({} as any, {} as any, {} as any, {} as any) as any;

function fixture() {
  const products: any[] = [
    { productId: 11, tenantId: 7, sku: 'SKU-1', productName: 'Flour', baseUnitId: 31, isActive: true, isStockItem: true,
      trackBatch: false, trackExpiry: false, trackSerial: false },
    { productId: 12, tenantId: 7, sku: 'SKU-2', productName: 'Sugar', baseUnitId: 31, isActive: true, isStockItem: true,
      trackBatch: false, trackExpiry: false, trackSerial: false },
    { productId: 90, tenantId: 8, sku: 'OTHER-TENANT', productName: 'Private', baseUnitId: 31, isActive: true, isStockItem: true },
  ];
  const locations: any[] = [
    { locationId: 21, tenantId: 7, code: 'MAIN', isActive: true },
    { locationId: 22, tenantId: 7, code: 'NORTH', isActive: true },
    { locationId: 91, tenantId: 8, code: 'PRIVATE', isActive: true },
  ];
  const units: any[] = [
    { unitId: 31, tenantId: 7, code: 'EA', isActive: true, allowsDecimalQuantity: false, quantityPrecision: 0 },
    { unitId: 32, tenantId: 7, code: 'CASE', isActive: true, allowsDecimalQuantity: true, quantityPrecision: 2 },
  ];
  const productUnits: any[] = products.slice(0, 2).flatMap(product => [
    { productUnitId: product.productId * 10 + 1, productId: product.productId, unitId: 31,
      conversionFactor: '1.000000', isActive: true, isBaseUnit: true, isPurchaseUnit: false, isSalesUnit: true },
    { productUnitId: product.productId * 10 + 2, productId: product.productId, unitId: 32,
      conversionFactor: '24.000000', isActive: true, isBaseUnit: false, isPurchaseUnit: true, isSalesUnit: false },
  ]);
  const links: any[] = products.slice(0, 2).flatMap(product => locations.slice(0, 2).map(location =>
    ({ productId: product.productId, locationId: location.locationId, isActive: true })));
  const balances: any[] = [], ledger: any[] = [], claims: any[] = [], layers: any[] = [];
  const rows = new Map<any, any[]>([[Product, products], [Location, locations], [UnitOfMeasure, units],
    [ProductUnit, productUnits], [ProductLocation, links], [InventoryBalance, balances],
    [InventoryLedger, ledger], [InventoryOpeningClaim, claims], [InventoryAgeLayer, layers]]);
  const manager: any = { getRepository(entity: any) {
    const data = rows.get(entity);
    if (!data) throw Error(`Unexpected repository ${entity.name}`);
    return {
      createQueryBuilder: () => {
        let params: any;
        const query: any = { where: (_sql: string, values: any) => { params = values; return query; },
          getMany: async () => data.filter(item => item.tenantId === params.tenantId &&
            (params.skus ?? params.codes).includes(String(item.sku ?? item.code).toUpperCase())) };
        return query;
      },
      findBy: async () => data,
      findOneBy: async (scope: any) => data.find(item => Object.entries(scope).every(([key, value]) => item[key] === value)) ?? null,
    };
  } };
  return { manager, products, locations, units, productUnits, links, balances, ledger, claims, layers };
}

test('template, sample and validation/results reports use exact columns and escape formula-like output', async () => {
  const blank = new ExcelJS.Workbook(); await blank.xlsx.load(await openingTemplate(false) as any);
  assert.deepEqual((blank.getWorksheet('Opening Stock')!.getRow(1).values as ExcelJS.CellValue[]).slice(1),
    ['LocationCode', 'SKU', 'UnitCode', 'Quantity', 'BaseUnitCost', 'Remarks', 'RowReference']);
  assert.match(String(blank.getWorksheet('Instructions')!.getRow(7).getCell(2).value), /business date/);
  assert.equal(blank.getWorksheet('Opening Stock')!.rowCount, 1);
  const sample = await parseOpeningWorkbook(await openingTemplate(true));
  assert.equal(sample.length, 2);
  const result = { ...row(), status: 'ERROR', details: '=Unsafe', productName: '+Formula' } as OpeningResultRow;
  const report = new ExcelJS.Workbook(); await report.xlsx.load(await openingValidationWorkbook([result], 'demo') as any);
  assert.equal(report.getWorksheet('Validation Report')!.getRow(2).getCell(7).value, "'+Formula");
  assert.equal(report.getWorksheet('Validation Report')!.getRow(2).getCell(20).value, "'=Unsafe");
  const posted = new ExcelJS.Workbook(); await posted.xlsx.load(await openingResultsWorkbook([{ ...result, status: 'POSTED', ledgerId: 55 }], 'demo') as any);
  assert.equal(posted.getWorksheet('Results')!.getRow(2).getCell(24).value, '55');
});

test('parser rejects formulas, changed headers, empty sheets and more than 1,000 data rows', async () => {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await openingTemplate(true) as any);
  const sheet = book.getWorksheet('Opening Stock')!;
  sheet.getRow(2).getCell(4).value = { formula: '1+1', result: 2 };
  await assert.rejects(parseOpeningWorkbook(Buffer.from(await book.xlsx.writeBuffer())), /Formula is not allowed/);
  sheet.getRow(2).getCell(4).value = '2'; sheet.getRow(1).getCell(1).value = 'Wrong';
  await assert.rejects(parseOpeningWorkbook(Buffer.from(await book.xlsx.writeBuffer())), /Invalid Opening Stock headers/);
  sheet.getRow(1).getCell(1).value = 'LocationCode'; sheet.getRow(2).values = []; sheet.getRow(3).values = [];
  await assert.rejects(parseOpeningWorkbook(Buffer.from(await book.xlsx.writeBuffer())), /no populated opening rows/);
  const sparse = new ExcelJS.Workbook(); await sparse.xlsx.load(await openingTemplate(false) as any);
  sparse.getWorksheet('Opening Stock')!.getRow(1500).values = ['MAIN', 'SKU-1', 'EA', '2', '3.25'];
  assert.equal((await parseOpeningWorkbook(Buffer.from(await sparse.xlsx.writeBuffer()))).length, 1);
  for (let index = 2; index <= 1002; index++) sheet.getRow(index).getCell(1).value = 'MAIN';
  await assert.rejects(parseOpeningWorkbook(Buffer.from(await book.xlsx.writeBuffer())), /Maximum 1,000/);
});

test('preview accepts base and converted units across locations and keeps quantities grouped by base unit', async () => {
  const f = fixture();
  const rows = [row(), { ...row('NORTH', 'SKU-1', 'CASE', '2', '3.25'), rowNumber: 3 },
    { ...row('MAIN', 'SKU-2', 'EA', '3', '4'), rowNumber: 4 }];
  const validated = await importer().validate(rows, user, f.manager) as OpeningResultRow[];
  assert.deepEqual(validated.map(item => [item.status, item.baseQuantity, item.openingValue]),
    [['READY', '2.0000', '6.5000'], ['READY', '48.0000', '156.0000'], ['READY', '3.0000', '12.0000']]);
  const summary = importer().format({ batchId: 1, datasetId: 'd', status: 'PREVIEW' }, validated).summary;
  assert.deepEqual(summary.baseQuantitiesByUnit, { EA: '53.0000' });
  assert.equal(summary.locationsAffected, 2);
});

test('preview rejects unknown/cross-tenant references, inactive or non-stock products and unsupported tracking', async () => {
  for (const [description, edit, source, expected] of [
    ['unknown SKU', (_f: ReturnType<typeof fixture>) => {}, row('MAIN', 'MISSING'), /SKU is not an existing/],
    ['cross-tenant SKU', (_f: ReturnType<typeof fixture>) => {}, row('MAIN', 'OTHER-TENANT'), /SKU is not an existing/],
    ['unknown location', (_f: ReturnType<typeof fixture>) => {}, row('MISSING'), /LocationCode is not an existing/],
    ['cross-tenant location', (_f: ReturnType<typeof fixture>) => {}, row('PRIVATE'), /LocationCode is not an existing/],
    ['inactive product', (f: ReturnType<typeof fixture>) => { f.products[0].isActive = false; }, row(), /Product must be active/],
    ['non-stock product', (f: ReturnType<typeof fixture>) => { f.products[0].isStockItem = false; }, row(), /Product must be active/],
    ['inactive location', (f: ReturnType<typeof fixture>) => { f.locations[0].isActive = false; }, row(), /Location is inactive/],
    ['unlinked product location', (f: ReturnType<typeof fixture>) => { f.links[0].isActive = false; }, row(), /Product is not active at this location/],
    ['inactive unit', (f: ReturnType<typeof fixture>) => { f.productUnits[0].isActive = false; }, row(), /eligible active Product Unit/],
    ['batch', (f: ReturnType<typeof fixture>) => { f.products[0].trackBatch = true; }, row(), /tracked products are unsupported/],
    ['expiry', (f: ReturnType<typeof fixture>) => { f.products[0].trackExpiry = true; }, row(), /tracked products are unsupported/],
    ['serial', (f: ReturnType<typeof fixture>) => { f.products[0].trackSerial = true; }, row(), /tracked products are unsupported/],
  ] as const) {
    const f = fixture(); edit(f);
    const [result] = await importer().validate([source], user, f.manager) as OpeningResultRow[];
    assert.equal(result.status, 'ERROR', description);
    assert.match(result.details, expected, description);
  }
});

test('preview rejects invalid quantities, costs, unsafe conversion, duplicate targets and prior stock/history', async () => {
  for (const [quantity, cost, expected] of [
    ['0', '3', /Quantity must be greater than zero/], ['-1', '3', /Quantity must be greater than zero/],
    ['1.00001', '3', /at most four decimal/], ['1', '0', /BaseUnitCost must be greater than zero/],
    ['1', '-2', /BaseUnitCost must be greater than zero/], ['1', '2.12345', /at most four decimal/],
  ] as const) {
    const [result] = await importer().validate([row('MAIN', 'SKU-1', 'EA', quantity, cost)], user, fixture().manager);
    assert.equal(result.status, 'ERROR'); assert.match(result.details, expected);
  }
  const f = fixture(); f.productUnits[1].conversionFactor = '0.333333';
  const [unsafe] = await importer().validate([row('MAIN', 'SKU-1', 'CASE', '1')], user, f.manager);
  assert.match(unsafe.details, /Conversion would round/);
  const duplicated = await importer().validate([row(), { ...row(), rowNumber: 3 }], user, fixture().manager);
  assert.match(duplicated[1].details, /Duplicate product\/location/);
  for (const [field, value] of [
    ['balances', { tenantId: 7, productId: 11, locationId: 21, quantityOnHand: '2.0000', averageCost: '3.0000', lastMovementAt: null }],
    ['balances', { tenantId: 7, productId: 11, locationId: 21, quantityOnHand: '0.0000', averageCost: '4.0000', lastMovementAt: null }],
    ['ledger', { tenantId: 7, productId: 11, locationId: 21 }],
    ['claims', { tenantId: 7, productId: 11, locationId: 21 }],
    ['layers', { tenantId: 7, productId: 11, locationId: 21 }],
  ] as const) {
    const state = fixture(); (state[field] as any[]).push(value);
    const [result] = await importer().validate([row()], user, state.manager);
    assert.match(result.details, /Prior inventory movement/);
  }
});

test('location-scoped preview hides stock at unassigned locations', async () => {
  const f = fixture(); f.balances.push({ tenantId: 7, productId: 11, locationId: 21,
    quantityOnHand: '100.0000', averageCost: '35.0000', lastMovementAt: new Date() });
  const [result] = await importer().validate([row()], { ...user, accessScope: 'LOCATION', assignedLocationIds: [22] }, f.manager);
  assert.equal(result.status, 'ERROR'); assert.match(result.details, /outside your assigned scope/);
  assert.equal(result.existingQuantity, undefined); assert.equal(result.existingWavg, undefined);
});

test('opening lock reserves a balance row before checking claims, ledger, layers and valuation', async () => {
  const events: string[] = [];
  const manager: any = {
    getRepository(entity: any) {
      assert.equal(entity, ProductLocation);
      const query: any = { setLock: () => query, where: () => query,
        getOne: async () => { events.push('product-location'); return { isActive: true }; } };
      return { createQueryBuilder: () => query };
    },
    query: async (sql: string) => { events.push(sql.includes('opening_claim') ? 'claim' : sql.includes('inventory_ledger') ? 'ledger' : 'age'); return []; },
  };
  const balances: any = { lockOrCreateZero: async () => { events.push('balance'); return { quantityOnHand: '0.0000', averageCost: '0.0000', lastMovementAt: null }; } };
  await lockOpeningTarget(manager, balances, { tenantId: 7, productId: 11, locationId: 21 });
  assert.deepEqual(events, ['product-location', 'balance', 'claim', 'ledger', 'age']);
  manager.query = async (sql: string) => sql.includes('inventory_ledger') ? [{ inventory_ledger_id: 1 }] : [];
  await assert.rejects(lockOpeningTarget(manager, balances, { tenantId: 7, productId: 11, locationId: 21 }), /only once/);
});

test('confirmation passes one transaction manager through multiple locations and never completes after a late failure', async () => {
  const raw = [row(), { ...row('NORTH', 'SKU-2'), rowNumber: 3 }];
  const planned = raw.map((source, index) => ({ ...source, status: 'READY', details: 'Ready to post.',
    productId: index ? 12 : 11, locationId: index ? 22 : 21, productUnitId: index ? 121 : 111,
    baseQuantity: '2.0000', baseUnitCode: 'EA', openingValue: '6.5000', existingQuantity: '0.0000',
    existingWavg: '0.0000', historicalMovement: false, openingClaim: false })) as OpeningResultRow[];
  const batch: any = { batchId: 4, tenantId: 7, datasetId: 'opening-2026', status: 'PREVIEW',
    rowsJson: JSON.stringify(raw), previewJson: JSON.stringify(planned), resultsJson: null };
  const events: string[] = []; let saved = 0; let posts = 0;
  const query: any = { setLock: () => query, where: () => query,
    getOne: async () => ({ isActive: true }) };
  const manager: any = {
    query: async () => [],
    getRepository(entity: any) {
      if (entity === OpeningInventoryImportBatch) return { findOne: async ({ where }: any) => {
        assert.equal(where.tenantId, 7); events.push('batch-lock'); return batch;
      }, save: async () => { saved++; return batch; } };
      if ([Product, Location, ProductUnit, UnitOfMeasure, ProductLocation].includes(entity)) return { createQueryBuilder: () => query };
      if (entity === InventoryAdjustmentReason) return { findOneBy: async () => ({ inventoryAdjustmentReasonId: 2,
        isSystemReason: true, allowedDirection: 'IN', costingPolicy: 'MANUAL_REQUIRED', requiresApproval: false }) };
      if (entity === Tenant) return { findOneBy: async () => ({ tenantId: 7, timeZone: 'Asia/Colombo' }) };
      if (entity === InventoryAdjustmentLine) return { findBy: async () => [{ productId: 11, inventoryAdjustmentLineId: 70,
        quantityAfter: '2.0000' }] };
      if (entity === InventoryLedger) return { findOneByOrFail: async () => ({ inventoryLedgerId: 90, averageCostAfter: '3.2500' }) };
      throw Error(`Unexpected repository ${entity.name}`);
    },
  };
  const dataSource: any = { transaction: async (isolation: string, callback: any) => {
    assert.equal(isolation, 'READ COMMITTED'); events.push('transaction'); return callback(manager);
  } };
  const balances: any = { lockOrCreateZero: async () => ({ quantityOnHand: '0.0000', averageCost: '0.0000', lastMovementAt: null }) };
  const adjustments: any = {
    createWithManager: async (received: any, dto: any) => {
      assert.equal(received, manager); events.push(`create:${dto.locationId}`);
      return { inventoryAdjustmentId: dto.locationId };
    },
    postWithManager: async (received: any, id: number) => {
      assert.equal(received, manager); events.push(`post:${id}`); posts++;
      if (posts === 2) throw Error('Final location ledger failure');
      return { inventoryAdjustmentId: id, adjustmentNumber: `ADJ-${id}` };
    },
  };
  const service = new OpeningInventoryImportService(dataSource, balances, adjustments,
    { ensureSystemReasons: async () => {} } as any) as any;
  service.validate = async () => (JSON.parse(batch.previewJson) as OpeningResultRow[]).map(value => ({ ...value }));
  await assert.rejects(service.confirm(4, user), /Final location ledger failure/);
  assert.equal(saved, 0); assert.equal(batch.status, 'PREVIEW');
  assert.deepEqual(events.filter(event => event.startsWith('create:') || event.startsWith('post:')),
    ['create:21', 'post:21', 'create:22', 'post:22']);
  batch.status = 'COMPLETED'; batch.resultsJson = JSON.stringify(planned.map(value => ({ ...value, status: 'POSTED' })));
  events.length = 0;
  const retry = await service.confirm(4, user);
  assert.equal(retry.status, 'COMPLETED'); assert.equal(posts, 2);
  assert.deepEqual(events, ['transaction', 'batch-lock']);
  batch.status = 'PREVIEW'; batch.resultsJson = null; batch.rowsJson = JSON.stringify([raw[0]]);
  batch.previewJson = JSON.stringify([planned[0]]); events.length = 0;
  const success = await service.confirm(4, user);
  assert.equal(success.status, 'COMPLETED'); assert.equal(saved, 1);
  assert.equal(success.rows[0].postingDate, businessDateAt(new Date(), 'Asia/Colombo'));
  assert.deepEqual([success.rows[0].adjustmentNumber, success.rows[0].ledgerId, success.rows[0].finalWavg],
    ['ADJ-21', 90, '3.2500']);
});

test('re-uploading an identical completed dataset returns stored results without revalidation or posting', async () => {
  const buffer = await openingTemplate(true);
  const completed: any = { batchId: 8, tenantId: 7, datasetId: 'opening-2026', status: 'COMPLETED',
    createdByUserId: 9, resultsJson: JSON.stringify([{ ...row(), status: 'POSTED', details: 'Posted',
      baseUnitCode: 'EA', baseQuantity: '2.0000', openingValue: '6.5000' }]) };
  let writes = 0;
  const dataSource: any = { getRepository: () => ({ findOneBy: async ({ tenantId, datasetId }: any) => {
    assert.equal(tenantId, 7); assert.equal(datasetId, 'opening-2026'); return completed;
  }, save: async () => { writes++; } }) };
  const service = new OpeningInventoryImportService(dataSource, {} as any, {} as any, {} as any) as any;
  service.validate = async () => { throw Error('Completed retry must not validate or post.'); };
  const result = await service.preview('opening-2026', buffer, user);
  assert.equal(result.status, 'COMPLETED'); assert.equal(writes, 0);
  assert.equal(result.summary.postedRows, 1);
});

test('preview finishing after confirmation returns completed results instead of a stale ready view', async () => {
  const buffer = await openingTemplate(true);
  const completed = { ...row(), status: 'POSTED', details: 'Opening inventory posted.',
    baseUnitCode: 'EA', baseQuantity: '2.0000', openingValue: '6.5000' } as OpeningResultRow;
  const batch: any = { batchId: 8, tenantId: 7, datasetId: 'opening-2026', status: 'PREVIEW',
    createdByUserId: 9, previewJson: null, resultsJson: null };
  const repo: any = {
    findOneBy: async () => batch,
    update: async () => { batch.status = 'COMPLETED'; batch.resultsJson = JSON.stringify([completed]); },
    findOneByOrFail: async () => batch,
  };
  const service = new OpeningInventoryImportService({ getRepository: () => repo } as any,
    {} as any, {} as any, {} as any) as any;
  service.validate = async () => [{ ...completed, status: 'READY' }];
  const result = await service.preview('opening-2026', buffer, user);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.summary.postedRows, 1);
});
