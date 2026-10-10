import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { ProductImportService } from './product-import.service';
import { ProductImportBatch } from './product-import-batch.entity';
import { ProductImportRef } from './product-import-ref.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductIdentifier } from '../product-identifiers/product-identifiers.entity';
import { Product } from '../products/products.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceListItemDiscount } from '../price-list-item-discounts/price-list-item-discounts.entity';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Location } from '../locations/locations.entity';
import { IdentifierType } from '../identifier-types/identifier-types.entity';
import { Attribute } from '../attributes/attributes.entity';
import { productImportTemplate } from './product-import.excel';
import { Tenant } from '../tenants/tenant.entity';

const user = { scope: 'TENANT', tenantId: 7, userId: 9, roleCode: 'TENANT_ADMIN', roleId: 1, accessScope: 'TENANT', assignedLocationIds: [] } as any;
const service = (dataSource: any = {}) => new ProductImportService(dataSource, {} as any, {} as any, {} as any);
const raw = (sheet: string, values: Record<string, string>) => ({ sheet, rowNumber: 2, values }) as any;

test('onboarding resolves configured master codes to tenant IDs and retains quantity tiers', () => {
  const importer = service() as any;
  const refs = {
    categories: [{ categoryId: 11, categoryCode: 'BIS' }], brands: [{ brandId: 12, brandCode: 'CUSTOM-BRAND' }],
    units: [{ unitId: 13, code: 'EACH' }], suppliers: [{ supplierId: 14, supplierCode: 'MY-SUPPLIER' }],
    lists: [{ priceListId: 17, code: 'CUSTOM-RETAIL', currencyCode: 'LKR' }], locations: [{ locationId: 18, code: 'NORTH' }],
    identifiers: [], attributes: [{ attributeId: 19, code: 'FLAVOUR' }],
  };
  const group = [
    raw('products', { ProductImportKey: 'P001', ProductName: 'Fictional biscuit', CategoryCode: 'BIS', BrandCode: 'CUSTOM-BRAND', BaseUnitCode: 'EACH' }),
    raw('product-units', { ProductImportKey: 'P001', UnitCode: 'EACH', ConversionFactor: '1', IsBaseUnit: 'TRUE', IsSalesUnit: 'TRUE', IsPurchaseUnit: 'TRUE' }),
    raw('selling-prices', { ProductImportKey: 'P001', PriceListCode: 'CUSTOM-RETAIL', UnitCode: 'EACH', SellingPrice: '22', MinimumQuantity: '5', EffectiveFrom: '2026-01-01' }),
    raw('product-suppliers', { ProductImportKey: 'P001', SupplierCode: 'MY-SUPPLIER', IsPrimarySupplier: 'TRUE', BaselineLeadTimeDays: '3' }),
    raw('supplier-units', { ProductImportKey: 'P001', SupplierCode: 'MY-SUPPLIER', UnitCode: 'EACH', MinimumOrderQty: '1' }),
    raw('supplier-prices', { ProductImportKey: 'P001', SupplierCode: 'MY-SUPPLIER', UnitCode: 'EACH', PurchasePrice: '15', MinimumQuantity: '5', EffectiveFrom: '2026-01-01' }),
    raw('product-locations', { ProductImportKey: 'P001', LocationCode: 'NORTH', IsSellable: 'TRUE' }),
    raw('product-attributes', { ProductImportKey: 'P001', AttributeCode: 'FLAVOUR', Value: 'Cocoa' }),
  ];
  const dto = importer.onboardingDto(group, refs);
  assert.equal(dto.categoryId, 11);
  assert.equal(dto.brandId, 12);
  assert.equal(dto.prices[0].priceListId, 17);
  assert.equal(dto.prices[0].minimumQuantity, 5);
  assert.equal(dto.supplierLinks[0].supplierId, 14);
  assert.equal(dto.supplierLinks[0].baselineLeadTimeDays, 3);
  assert.equal(dto.supplierLinks[0].units[0].prices[0].minimumQuantity, 5);
  assert.equal(dto.locations[0].locationId, 18);
  assert.equal(dto.productAttributes[0].attributeId, 19);
  const reversedVersions = [group[0], group[1], raw('selling-prices', {
    ProductImportKey: 'P001', PriceListCode: 'CUSTOM-RETAIL', UnitCode: 'EACH',
    SellingPrice: '25', MinimumQuantity: '5', EffectiveFrom: '2027-01-01',
  }), ...group.slice(2)];
  assert.deepEqual(importer.onboardingDto(reversedVersions, refs).prices.map((price: any) => price.effectiveFrom),
    ['2026-01-01', '2027-01-01']);
});

test('base-unit maintenance can set its sales flag without resupplying the unchanged base flag', async () => {
  const importer = service() as any;
  const existing = { productUnitId: 31, productId: 5, unitId: 13, conversionFactor: '1', isBaseUnit: true, isSalesUnit: true };
  const manager = { getRepository: (entity: any) => {
    if (entity === ProductUnit) return { findOneBy: async () => existing };
    throw Error(`Unexpected ${entity.name}`);
  } };
  const row = raw('product-units', { UnitCode: 'EACH', Operation: 'UPDATE', IsSalesUnit: 'TRUE' });
  importer.validateFields(row, { units: [{ unitId: 13, code: 'EACH' }] }, user);
  const impact = await importer.planIndividual(row, 'UPDATE', { productId: 5 },
    { units: [{ unitId: 13, code: 'EACH' }] }, manager, 7);
  assert.equal(impact.recordId, 31);
});

function identifierFixture(existing: any[] = [], otherTenantProducts: any[] = []) {
  const identifiers = [...existing, ...otherTenantProducts];
  const manager: any = { getRepository(entity: any) {
    if (entity === ProductIdentifier) return {
      findBy: async (where: any) => identifiers.filter((item) => item.tenantId === where.tenantId && item.productId === where.productId),
      findOneBy: async (where: any) => identifiers.find((item) => item.tenantId === where.tenantId &&
        item.normalizedIdentifierValue === where.normalizedIdentifierValue) ?? null,
    };
    if (entity === ProductUnit) return { findOneBy: async () => ({ productUnitId: 31, productId: 5,
      unitId: 13, isActive: true, isBaseUnit: true, isSalesUnit: true }) };
    if (entity === Product) return { findOneBy: async () => ({ productId: 5, tenantId: 7, sku: 'SKU-000013' }) };
    if (entity === Tenant) return { findOneBy: async () => ({ tenantId: 7, timeZone: 'Asia/Colombo' }) };
    if ([Category, Brand, Supplier, PriceList, Location, Attribute].includes(entity)) return { findBy: async () => [] };
    if (entity === UnitOfMeasure) return { findBy: async () => [{ unitId: 13, code: 'EA', isActive: true }] };
    if (entity === IdentifierType) return { findBy: async () => [{ identifierTypeId: 20, code: 'BCOD', isActive: true }] };
    throw Error(`Unexpected repository ${entity.name}`);
  } };
  return { manager, refs: { identifiers: [{ identifierTypeId: 20, code: 'BCOD' }], units: [{ unitId: 13, code: 'EA' }] },
    product: { productId: 5, sku: 'SKU-000013' } };
}

const identifierRow = (operation: string, value: string, oldValue = '', primary = '') => raw('identifiers', {
  SKU: 'SKU-000013', Operation: operation, IdentifierTypeCode: 'BCOD', IdentifierValue: value,
  ExistingIdentifierValue: oldValue, UnitCode: 'EA', IsPrimary: primary,
});

test('identifier UPDATE resolves a changed barcode by ExistingIdentifierValue and updates the same Wizard record', async () => {
  const old = { productIdentifierId: 91, tenantId: 7, productId: 5, identifierTypeId: 20, productUnitId: 31,
    identifierValue: '8901234567001', normalizedIdentifierValue: '8901234567001', isPrimary: true, isActive: true };
  const { manager, refs, product } = identifierFixture([old]);
  const importer = service() as any;
  const row = identifierRow('UPDATE', '8901234567002', old.identifierValue, 'TRUE');
  const impact = await importer.planIndividual(row, 'UPDATE', product, refs, manager, 7);
  assert.equal(impact.recordId, 91);
  assert.equal(impact.oldValue, '8901234567001');
  let applied: any[] = [];
  const applier = new ProductImportService({} as any, { updateIdentifiers: async (_id: number, rows: any[]) => { applied = rows; } } as any, {} as any, {} as any) as any;
  await applier.applyIndividual({ ...row, ...impact, action: 'UPDATE' }, product, refs, manager, user);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].productIdentifierId, 91);
  assert.equal(applied[0].identifierValue, '8901234567002');
  assert.equal(applied[0].isPrimary, true);
  assert.equal(applied[0].productUnitId, 31);
});

test('identifier UPDATE without ExistingIdentifierValue changes attributes on the matching value', async () => {
  const old = { productIdentifierId: 91, tenantId: 7, productId: 5, identifierTypeId: 20, productUnitId: 31,
    identifierValue: '8901234567001', normalizedIdentifierValue: '8901234567001', isPrimary: true, isActive: true };
  const { manager, refs, product } = identifierFixture([old]);
  const impact = await (service() as any).planIndividual(identifierRow('UPDATE', old.identifierValue, '', 'TRUE'), 'UPDATE', product, refs, manager, 7);
  assert.equal(impact.recordId, 91);
  assert.equal(impact.oldValue, old.identifierValue);
});

test('identifier preview rejects tenant-wide duplicate normalized values and primary conflicts', async () => {
  const current = { productIdentifierId: 91, tenantId: 7, productId: 5, identifierTypeId: 20, productUnitId: 31,
    identifierValue: 'OLD', normalizedIdentifierValue: 'OLD', isPrimary: true, isActive: true };
  const duplicate = { productIdentifierId: 92, tenantId: 7, productId: 6, identifierValue: 'DuP', normalizedIdentifierValue: 'DUP' };
  const { manager } = identifierFixture([current], [duplicate]);
  const importer = service() as any;
  const batch = { importType: 'identifiers' };
  const primary = await importer.validate([identifierRow('CREATE', 'NEW', '', 'TRUE')], batch, user, manager);
  assert.equal(primary[0].status, 'ERROR');
  assert.match(primary[0].details, /Only one primary identifier/);
  const collision = await importer.validate([identifierRow('CREATE', ' dup ')], batch, user, manager);
  assert.equal(collision[0].status, 'ERROR');
  assert.match(collision[0].details, /another product/);
  const missing = await importer.validate([identifierRow('UPDATE', 'NEW', 'MISSING')], batch, user, manager);
  assert.equal(missing[0].status, 'ERROR');
  assert.match(missing[0].details, /does not exist/);
});

test('multiple identifier rows are planned in order and a valid primary replacement stays atomic', async () => {
  const current = { productIdentifierId: 91, tenantId: 7, productId: 5, identifierTypeId: 20, productUnitId: 31,
    identifierValue: 'OLD', normalizedIdentifierValue: 'OLD', isPrimary: true, isActive: true };
  const { manager } = identifierFixture([current]);
  const importer = service() as any;
  const demote = identifierRow('UPDATE', 'OLD', '', 'FALSE');
  const replacement = { ...identifierRow('CREATE', 'NEW', '', 'TRUE'), rowNumber: 3 };
  const planned = await importer.validate([demote, replacement], { importType: 'identifiers' }, user, manager);
  assert.deepEqual(planned.map((row: any) => row.status), ['READY', 'READY']);
  const reversed = await importer.validate([replacement, demote], { importType: 'identifiers' }, user, manager);
  assert.equal(reversed[0].status, 'ERROR');
  const repeated = await importer.validate([demote, { ...identifierRow('UPDATE', 'OLD'), rowNumber: 3 }],
    { importType: 'identifiers' }, user, manager);
  assert.equal(repeated[1].status, 'ERROR');
});

test('selling revision matches exact list, unit, currency and tier and warns about attached discounts', async () => {
  const importer = service() as any;
  const price = { priceListItemId: 21, tenantId: 7, productId: 5, priceListId: 17, productUnitId: 31,
    currencyCode: 'LKR', minimumQuantity: '5', sellingPrice: '180.00', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true };
  let predicate: any;
  const manager = { getRepository(entity: any) {
    if (entity === ProductUnit) return { findOneBy: async () => ({ productUnitId: 31, isActive: true, isBaseUnit: true, isSalesUnit: true, conversionFactor: '1' }) };
    if (entity === PriceListItem) return { findBy: async (where: any) => { predicate = where; return [price]; } };
    if (entity === PriceListItemDiscount) return { findBy: async () => [{ priceListItemDiscountId: 42 }] };
    throw Error(`Unexpected ${entity.name}`);
  } };
  const row = raw('selling-prices', { PriceListCode: 'CUSTOM-RETAIL', UnitCode: 'EACH', CurrencyCode: 'LKR', MinimumQuantity: '5',
    Operation: 'REVISE', SellingPrice: '200', EffectiveFrom: '2099-11-01' });
  const impact = await importer.planSellingPrice(row, 'REVISE', { productId: 5 },
    { lists: [{ priceListId: 17, code: 'CUSTOM-RETAIL', currencyCode: 'LKR' }], units: [{ unitId: 13, code: 'EACH' }] }, manager, 7);
  assert.equal(predicate.priceListId, 17);
  assert.equal(predicate.productUnitId, 31);
  assert.equal(predicate.currencyCode, 'LKR');
  assert.equal(predicate.minimumQuantity, '5');
  assert.equal(impact.recordId, 21);
  assert.equal(impact.oldValue, '180.00');
  assert.equal(impact.oldEnd, '2099-10-31T23:59:59.999Z');
  assert.match(impact.details, /attached discount/);
});

test('supplier revision selects the exact supplier purchase unit, currency and quantity tier', async () => {
  const importer = service() as any;
  const existing = { productSupplierPriceId: 81, productSupplierUnitId: 71, currencyCode: 'LKR', minimumQuantity: '12',
    purchasePrice: '150', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true };
  let predicate: any;
  const manager = { getRepository(entity: any) {
    if (entity === ProductSupplier) return { findOneBy: async () => ({ productSupplierId: 61, isActive: true }) };
    if (entity === ProductUnit) return { findOneBy: async () => ({ productUnitId: 51, isActive: true, isPurchaseUnit: true }) };
    if (entity === ProductSupplierUnit) return { findOneBy: async () => ({ productSupplierUnitId: 71, isActive: true }) };
    if (entity === ProductSupplierPrice) return { findBy: async (where: any) => { predicate = where; return [existing]; } };
    throw Error(`Unexpected ${entity.name}`);
  } };
  const row = raw('supplier-prices', { SupplierCode: 'SUP-A', UnitCode: 'BOX', CurrencyCode: 'LKR', MinimumQuantity: '12',
    Operation: 'REVISE', PurchasePrice: '165', EffectiveFrom: '2099-11-01' });
  const impact = await importer.planSupplierPrice(row, 'REVISE', { productId: 5 },
    { suppliers: [{ supplierId: 41, supplierCode: 'SUP-A' }], units: [{ unitId: 42, code: 'BOX' }] }, manager);
  assert.equal(predicate.productSupplierUnitId, 71);
  assert.equal(predicate.currencyCode, 'LKR');
  assert.equal(predicate.minimumQuantity, '12');
  assert.equal(impact.recordId, 81);
  assert.equal(impact.oldValue, '150');
  assert.equal(impact.oldEnd, '2099-10-31T23:59:59.000Z');
});

test('discount preview resolves its actual selling-price version and rejects backdating', async () => {
  const importer = service() as any;
  const parent = { priceListItemId: 91, productId: 5, priceListId: 17, productUnitId: 31, currencyCode: 'LKR',
    minimumQuantity: '1', sellingPrice: '180', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true };
  let existingDiscounts: any[] = [];
  const manager = { getRepository(entity: any) {
    if (entity === ProductUnit) return { findOneBy: async () => ({ productUnitId: 31, isActive: true }) };
    if (entity === PriceListItem) return { findBy: async () => [parent] };
    if (entity === PriceListItemDiscount) return { findBy: async () => existingDiscounts };
    throw Error(`Unexpected ${entity.name}`);
  } };
  const refs = { lists: [{ priceListId: 17, code: 'CUSTOM-RETAIL', currencyCode: 'LKR' }], units: [{ unitId: 13, code: 'EACH' }] };
  const row = raw('selling-discounts', { PriceListCode: 'CUSTOM-RETAIL', UnitCode: 'EACH', CurrencyCode: 'LKR',
    MinimumQuantity: '1', DiscountType: 'FIXED_AMOUNT', DiscountValue: '5', EffectiveFrom: '2099-11-01' });
  const impact = await importer.planDiscount(row, 'CREATE', { productId: 5 }, refs, manager, 7);
  assert.equal(impact.parentId, 91);
  assert.match(impact.details, /base price 180/);
  row.values.EffectiveFrom = '2026-01-01';
  await assert.rejects(importer.planDiscount(row, 'CREATE', { productId: 5 }, refs, manager, 7), /Backdated/);
  row.values.EffectiveFrom = '2099-11-01';
  row.values.DiscountValue = '200';
  await assert.rejects(importer.planDiscount(row, 'CREATE', { productId: 5 }, refs, manager, 7), /price|exceed/i);
  row.values.DiscountValue = '5';
  existingDiscounts = [{ priceListItemDiscountId: 92, effectiveFrom: new Date('2099-12-01'), effectiveTo: null, isActive: true }];
  await assert.rejects(importer.planDiscount(row, 'CREATE', { productId: 5 }, refs, manager, 7), /overlaps/);
});

test('confirmation rejects stale approved plans before any business write', async () => {
  const batch = { batchId: 4, tenantId: 7, importType: 'selling-prices', status: 'PREVIEW',
    rowsJson: '[]', previewJson: JSON.stringify([{ action: 'CREATE' }]), resultsJson: null };
  let saves = 0;
  const manager = { getRepository(entity: any) {
    if (entity !== ProductImportBatch) throw Error('Business repository was touched.');
    return { findOne: async () => batch, save: async () => { saves++; } };
  }, query: async () => [{ tenant_id: 7 }] };
  const importer = service({ transaction: (work: (manager: any) => Promise<any>) => work(manager) }) as any;
  importer.validate = async () => [{ action: 'ERROR', status: 'ERROR', details: 'Only one primary identifier is allowed per product.' }];
  await assert.rejects(importer.confirm('selling-prices', 4, user), /database changed after preview/i);
  assert.equal(saves, 0);
});

test('import history paginates all tenant batches with deterministic newest-first ordering', async () => {
  let options: any;
  const importer = service({ getRepository: (entity: any) => {
    assert.equal(entity, ProductImportBatch);
    return { findAndCount: async (query: any) => { options = query;
      return [[{ batchId: 101, datasetId: 'x', status: 'PREVIEW', createdAt: new Date(), completedAt: null }], 137]; } };
  } });
  const result = await importer.history('identifiers', user, 3, 50);
  assert.deepEqual(options.where, { tenantId: 7, importType: 'identifiers' });
  assert.deepEqual(options.order, { createdAt: 'DESC', batchId: 'DESC' });
  assert.equal(options.skip, 100);
  assert.equal(options.take, 50);
  assert.equal(result.totalCount, 137);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items[0].batchId, 101);
  await assert.rejects(importer.history('identifiers', user, 0, 20), /History page/);
  await assert.rejects(importer.history('identifiers', user, 1, 75), /page size/);
});

test('validation report requires a batch belonging to the authenticated tenant and import option', async () => {
  const importer = service({ manager: { getRepository: () => ({ findOneBy: async () => null }) } });
  await assert.rejects(importer.validationReport('identifiers', 12, user), /batch not found/);
});

test('completed batch retry returns recorded results without another SKU or price write', async () => {
  const results = [{ sheet: 'products', rowNumber: 2, action: 'CREATE', status: 'COMPLETED', sku: 'SKU-000001', values: { ProductImportKey: 'P001' }, details: 'Created' }];
  const batch = { batchId: 5, tenantId: 7, importType: 'onboarding', datasetId: 'catalog-1', status: 'COMPLETED', resultsJson: JSON.stringify(results) };
  const manager = { getRepository(entity: any) {
    if (entity !== ProductImportBatch) throw Error('Business repository was touched on retry.');
    return { findOne: async () => batch };
  }, query: async () => { throw Error('Tenant lock should not run on retry.'); } };
  const importer = service({ transaction: (work: (manager: any) => Promise<any>) => work(manager) });
  const again = await importer.confirm('onboarding', 5, user);
  assert.equal(again.rows[0].sku, 'SKU-000001');
  assert.equal(again.status, 'COMPLETED');
});

test('supplier price END preserves the uploaded future boundary in the shared publisher', async () => {
  let published: any;
  const importer = new ProductImportService({} as any,
    { publishSupplierPurchasePrices: async (_id: number, dto: any) => { published = dto.actions[0]; } } as any,
    {} as any, {} as any) as any;
  await importer.applyIndividual({ sheet: 'supplier-prices', action: 'END', recordId: 44, parentId: 33,
    values: { SKU: 'SKU-000001', EffectiveTo: '2099-11-01T12:00:00Z', CurrencyCode: 'LKR', MinimumQuantity: '1' } },
    { productId: 5 }, {} as any, {} as any, user);
  assert.equal(published.action, 'END_PRICE');
  assert.equal(published.effectiveMode, 'SCHEDULED');
  assert.equal(published.effectiveTo, '2099-11-01T12:00:00.000Z');
});

test('date-only maintenance price start and end use the tenant business day', async () => {
  const importer = service() as any;
  const recentlyPast = new Date(Date.now() - 30_000).toISOString();
  assert.throws(() => importer.schedule(raw('selling-prices', { EffectiveFrom: recentlyPast }), 'REVISE', 'Asia/Colombo'), /Backdated/);
  const start = importer.schedule(raw('selling-prices', { EffectiveFrom: '2099-11-01' }), 'REVISE', 'Asia/Colombo');
  assert.equal(start.from.toISOString(), '2099-10-31T18:30:00.000Z');
  const finish = importer.schedule(raw('supplier-prices', { EffectiveTo: '2099-11-01' }), 'END', 'Asia/Colombo');
  assert.equal(finish.end.toISOString(), '2099-11-01T18:29:59.999Z');
  let published: any;
  const ender = new ProductImportService({} as any,
    { publishSupplierPurchasePrices: async (_id: number, dto: any) => { published = dto.actions[0]; } } as any,
    {} as any, {} as any) as any;
  await ender.applyIndividual({ sheet: 'supplier-prices', action: 'END', recordId: 44, parentId: 33,
    values: { SKU: 'SKU-000001', EffectiveTo: '2099-11-01', CurrencyCode: 'LKR', MinimumQuantity: '1' } },
    { productId: 5 }, {} as any, {} as any, user, 'Asia/Colombo');
  assert.equal(published.effectiveTo, '2099-11-01T18:29:59.000Z');
  assert.throws(() => importer.supplierPriceDate('2099-11-01T12:00:00.123Z', 'EffectiveFrom', 'Asia/Colombo'), /whole-second/);
});

test('discount date-only start and end reach the shared service as tenant-local boundaries', async () => {
  let published: any;
  const importer = new ProductImportService({} as any, {} as any, {} as any,
    { publishDiscount: async (_id: number, dto: any) => { published = dto; } } as any) as any;
  await importer.applyIndividual({ sheet: 'selling-discounts', action: 'CREATE', parentId: 91,
    values: { SKU: 'SKU-000001', DiscountType: 'PERCENTAGE', DiscountValue: '5',
      EffectiveFrom: '2099-11-01', EffectiveTo: '2099-11-30' } },
    { productId: 5 }, {} as any, {} as any, user, 'Asia/Colombo');
  assert.equal(published.effectiveFrom, '2099-10-31T18:30:00.000Z');
  assert.equal(published.effectiveTo, '2099-11-30T18:29:59.999Z');
});

test('combined preview resolves ten sheets, creates one Wizard aggregate and stores a durable key mapping', async () => {
  const records = new Map<any, any[]>([
    [Category, [{ categoryId: 11, tenantId: 7, categoryCode: 'BISCUITS', isActive: true }]],
    [Brand, [{ brandId: 12, tenantId: 7, brandCode: 'SAMPLE', isActive: true }]],
    [UnitOfMeasure, [{ unitId: 13, tenantId: 7, code: 'PCS', isActive: true }]],
    [Supplier, [{ supplierId: 14, tenantId: 7, supplierCode: 'SUP-001', isActive: true }]],
    [PriceList, [{ priceListId: 17, tenantId: 7, code: 'RETAIL-2026', currencyCode: 'LKR', isActive: true }]],
    [Location, [{ locationId: 18, tenantId: 7, code: 'MAIN-STORE', isActive: true }]],
    [IdentifierType, [{ identifierTypeId: 20, code: 'BARCODE', isActive: true }]],
    [Attribute, [{ attributeId: 19, tenantId: 7, code: 'FLAVOUR', isActive: true }]],
    [ProductImportBatch, []], [ProductImportRef, []],
    [Tenant, [{ tenantId: 7, timeZone: 'Asia/Colombo' }]],
    [ProductUnit, [{ productUnitId: 31, productId: 1, unitId: 13, isActive: true, isBaseUnit: true, isSalesUnit: true }]],
  ]);
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
  const manager: any = { query: async () => [{ tenant_id: 7 }], getRepository(entity: any) {
    const rows = records.get(entity);
    if (!rows) throw Error(`Unexpected repository ${entity.name}`);
    return { create: (row: any) => row, findBy: async (where: any) => rows.filter((row) => matches(row, where)),
      findOneBy: async (where: any) => rows.find((row) => matches(row, where)) ?? null,
      findOneByOrFail: async (where: any) => rows.find((row) => matches(row, where)) ?? Promise.reject(Error('Missing row')),
      findOne: async ({ where }: any) => rows.find((row) => matches(row, where)) ?? null,
      save: async (row: any) => { const key = entity === ProductImportBatch ? 'batchId' : 'id'; if (!row[key]) { row[key] = rows.length + 1; rows.push(row); } return row; },
      update: async (where: any, values: any) => { const row = rows.find((item) => matches(item, where)); if (row) Object.assign(row, values); },
    };
  } };
  let created = 0;
  let identifiers = 0;
  const productService: any = { createWithManager: async (dto: any) => {
    created++;
    assert.equal(dto.prices[0].priceListId, 17);
    assert.equal(dto.supplierLinks[0].supplierId, 14);
    return { productId: 1, sku: 'SKU-000001' };
  }, updateIdentifiers: async (_id: number, rows: any[]) => { identifiers = rows.length; } };
  const dataSource: any = { manager, getRepository: (entity: any) => manager.getRepository(entity), transaction: (work: any) => work(manager) };
  const importer = new ProductImportService(dataSource, productService, {} as any, {} as any);
  const uploaded = await importer.preview('onboarding', 'catalog-1', await productImportTemplate('onboarding', true), user);
  assert.equal(uploaded.status, 'PREVIEW');
  assert.equal(uploaded.counts.error, 0);
  assert.equal(uploaded.counts.create, 10);
  assert.equal(created, 0);
  const completed = await importer.confirm('onboarding', uploaded.batchId, user);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(created, 1);
  assert.equal(identifiers, 1);
  assert.ok(completed.rows.every((row) => row.sku === 'SKU-000001'));
  const refs = records.get(ProductImportRef)!;
  assert.equal(refs[0].importKey, 'P001');
  assert.equal(refs[0].sku, 'SKU-000001');
  await importer.confirm('onboarding', uploaded.batchId, user);
  assert.equal(created, 1);
  const invalidWorkbook = new ExcelJS.Workbook();
  await invalidWorkbook.xlsx.load(await productImportTemplate('onboarding', true) as any);
  const sellingSheet = invalidWorkbook.getWorksheet('04 Selling Prices')!;
  let dateColumn = 0;
  sellingSheet.getRow(1).eachCell((cell, index) => { if (cell.value === 'EffectiveFrom') dateColumn = index; });
  sellingSheet.getRow(2).getCell(dateColumn).value = '2099-11-01T00:00:00Z';
  const invalid = await importer.preview('onboarding', 'catalog-date-check', Buffer.from(await invalidWorkbook.xlsx.writeBuffer()), user);
  assert.match(invalid.rows.find((row) => row.sheet === 'selling-prices')!.details, /YYYY-MM-DD during onboarding/);
  assert.ok(invalid.counts.error > 0);
});
