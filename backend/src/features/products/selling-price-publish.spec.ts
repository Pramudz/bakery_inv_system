import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './products.service';
import { Product } from './products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceListItemDiscount, PriceListItemDiscountType } from '../price-list-item-discounts/price-list-item-discounts.entity';
import { Tenant } from '../tenants/tenant.entity';

const list = { priceListId: 5, tenantId: 7, code: 'RETAIL', name: 'Retail', currencyCode: 'LKR', isActive: true };
const productUnit = { productUnitId: 9, productId: 10, unitId: 3, conversionFactor: '1', isBaseUnit: true, isActive: true, isSalesUnit: true, unit: { unitId: 3, code: 'EA', name: 'Each' } };

function price(id: number, amount: number, from: Date, to: Date | null = null) {
  return { priceListItemId: id, tenantId: 7, productId: 10, priceListId: 5, productUnitId: 9, unitId: 3, sellingPrice: String(amount), currencyCode: 'LKR', minimumQuantity: '1', effectiveFrom: from, effectiveTo: to, isActive: true, priceList: list, productUnit } as any;
}

function fixture(initial: any[], initialDiscounts: any[] = []) {
  let rows = initial.map((row) => ({ ...row }));
  let discounts: any[] = initialDiscounts.map((row) => ({ ...row }));
  let querySkip = 0, queryTake = 25;
  const historyBuilder: any = {
    leftJoinAndSelect: () => historyBuilder,
    where: () => historyBuilder,
    andWhere: () => historyBuilder,
    orderBy: () => historyBuilder,
    addOrderBy: () => historyBuilder,
    skip: (value: number) => { querySkip = value; return historyBuilder; },
    take: (value: number) => { queryTake = value; return historyBuilder; },
    getManyAndCount: async () => [rows.slice(querySkip, querySkip + queryTake), rows.length],
  };
  const priceRepo: any = {
    findBy: async (where: any) => rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] == value)),
    find: async (options: any) => {
      const where = options?.where ?? {};
      return rows.filter((row) => Object.entries(where).every(([key, value]) => value === undefined || row[key] == value));
    },
    findOne: async (options: any) => rows.find((row) => Object.entries(options.where).every(([key, value]) => row[key] == value)) ?? null,
    create: (value: any) => ({ ...value, priceList: list, productUnit }),
    save: async (value: any) => {
      const saved = { priceListItemId: value.priceListItemId ?? Math.max(0, ...rows.map((row) => row.priceListItemId)) + 1, ...value };
      rows.push(saved); return saved;
    },
    update: async (where: any, values: any) => { rows = rows.map((row) => Object.entries(where).every(([key, value]) => row[key] == value) ? { ...row, ...values } : row); },
    createQueryBuilder: () => historyBuilder,
  };
  const discountBuilder: any = {
    setLock: () => discountBuilder,
    where: () => discountBuilder,
    andWhere: () => discountBuilder,
    getMany: async () => discounts.filter((row) => row.isActive),
    getOne: async () => null,
  };
  const discountRepo: any = {
    createQueryBuilder: () => discountBuilder,
    create: (value: any) => ({ ...value }),
    save: async (value: any) => { const saved = { priceListItemDiscountId: Math.max(0, ...discounts.map((row) => row.priceListItemDiscountId)) + 1, ...value }; discounts.push(saved); return saved; },
    update: async (where: any, values: any) => { discounts = discounts.map((row) => Object.entries(where).every(([key, value]) => row[key] == value) ? { ...row, ...values } : row); },
  };
  const manager: any = {
    getRepository: (entity: any) => {
      if (entity === PriceListItem) return priceRepo;
      if (entity === PriceListItemDiscount) return discountRepo;
      if (entity === Tenant) return { findOneBy: async () => ({ tenantId: 7, timeZone: 'Asia/Colombo' }) };
      if (entity === Product) return { findOneBy: async (where: any) => Number(where.productId) === 10 && Number(where.tenantId) === 7 ? { productId: 10, tenantId: 7 } : null };
      if (entity === PriceList) return { findOneBy: async (where: any) => Number(where.priceListId) === 5 && Number(where.tenantId) === 7 ? list : null };
      if (entity === ProductUnit) return {
        findOne: async (options: any) => Number(options.where.productUnitId) === 9 && Number(options.where.productId) === 10 ? productUnit : null,
        findOneBy: async (where: any) => Number(where.productId) === 10 && Number(where.unitId) === 3 ? productUnit : null,
      };
      throw new Error(`Unexpected repository ${entity?.name}`);
    },
  };
  const dataSource: any = {
    manager,
    transaction: async (work: any) => {
      const before = rows.map((row) => ({ ...row }));
      const beforeDiscounts = discounts.map((row) => ({ ...row }));
      try { return await work(manager); }
      catch (error) { rows = before; discounts = beforeDiscounts; throw error; }
    },
  };
  const discountService = { breakdownForItem: async () => ({ currentDiscount: null, finalUnitPrice: '0.0000' }) };
  return { service: new ProductService({} as any, dataSource, {} as any, discountService as any), rows: () => rows, discounts: () => discounts };
}

test('summary returns current and only the nearest future selling-price revision', async () => {
  const now = Date.now();
  const { service } = fixture([
    price(1, 100, new Date(now - 100_000)),
    price(2, 110, new Date(now + 100_000)),
    price(3, 120, new Date(now + 200_000)),
  ]);
  const summary = await service.getSellingPriceSummary(10, 7);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].current!.priceListItemId, 1);
  assert.equal(summary[0].nextScheduled!.priceListItemId, 2);
  assert.equal(summary[0].historyCount, 3);
});

test('Product Create selling-price sync still saves through the aggregate transaction context', async () => {
  const { service, rows } = fixture([]);
  const manager = (service as any).dataSource.manager;
  await (service as any).syncSellingPrices(manager, 10, [{ priceListId: 5, unitId: 3, sellingPrice: 99, effectiveFrom: '2026-08-18' }], [], 7);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].tenantId, 7);
  assert.equal(rows()[0].productUnitId, 9);
  assert.equal(rows()[0].sellingPrice, '99');
});

test('Product Create saves an optional percentage discount with its generated price item', async () => {
  const { service, rows, discounts } = fixture([]);
  const manager = (service as any).dataSource.manager;
  await (service as any).syncSellingPrices(manager, 10, [{ priceListId: 5, unitId: 3, sellingPrice: 250, effectiveFrom: '2026-08-18', discount: { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: '2026-08-18' } }], [], 7, 4);
  assert.equal(rows().length, 1);
  assert.equal(discounts().length, 1);
  assert.equal(discounts()[0].priceListItemId, rows()[0].priceListItemId);
  assert.equal(discounts()[0].discountValue, '10');
  assert.equal(discounts()[0].createdBy, 4);
});

test('Product Create supports fixed discount and independent discounted/non-discounted price rows', async () => {
  const { service, rows, discounts } = fixture([]);
  const manager = (service as any).dataSource.manager;
  await (service as any).syncSellingPrices(manager, 10, [
    { priceListId: 5, unitId: 3, sellingPrice: 250, effectiveFrom: '2026-08-18', discount: { discountType: PriceListItemDiscountType.FIXED_AMOUNT, discountValue: '25', effectiveFrom: '2026-08-18' } },
    { priceListId: 6, unitId: 3, sellingPrice: 200, effectiveFrom: '2026-08-18' },
  ], [], 7, 4);
  assert.equal(rows().length, 2);
  assert.equal(discounts().length, 1);
  assert.equal(discounts()[0].priceListItemId, rows()[0].priceListItemId);
  assert.equal(discounts().some((discount) => discount.priceListItemId === rows()[1].priceListItemId), false);
});

test('Product Create rejects invalid initial discount values and parent periods', async () => {
  const invalidRows: any[] = [
    { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '101', effectiveFrom: '2026-08-18' },
    { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '0', effectiveFrom: '2026-08-18' },
    { discountType: PriceListItemDiscountType.FIXED_AMOUNT, discountValue: '-1', effectiveFrom: '2026-08-18' },
    { discountType: PriceListItemDiscountType.FIXED_AMOUNT, discountValue: '251', effectiveFrom: '2026-08-18' },
    { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: '2026-08-17' },
    { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: '2026-08-18', effectiveTo: '2026-08-21' },
    { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: '2026-08-18' },
  ];
  for (const [index, discount] of invalidRows.entries()) {
    const { service } = fixture([]);
    const manager = (service as any).dataSource.manager;
    const priceEnd = index >= 5 ? '2026-08-20' : undefined;
    await assert.rejects(() => (service as any).syncSellingPrices(manager, 10, [{ priceListId: 5, unitId: 3, sellingPrice: 250, effectiveFrom: '2026-08-18', effectiveTo: priceEnd, discount }], [], 7, 4), BadRequestException);
  }
});

test('Product Create keeps Retail and Wholesale initial discounts independent', async () => {
  const { service, rows, discounts } = fixture([]);
  const manager = (service as any).dataSource.manager;
  await (service as any).syncSellingPrices(manager, 10, [
    { priceListId: 5, unitId: 3, sellingPrice: 250, effectiveFrom: '2026-08-18', discount: { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: '2026-08-18' } },
    { priceListId: 6, unitId: 3, sellingPrice: 200, effectiveFrom: '2026-08-18', discount: { discountType: PriceListItemDiscountType.FIXED_AMOUNT, discountValue: '15', effectiveFrom: '2026-08-18' } },
  ], [], 7, 4);
  assert.equal(discounts().length, 2);
  assert.equal(discounts().find((discount) => discount.priceListItemId === rows()[0].priceListItemId)?.discountValue, '10');
  assert.equal(discounts().find((discount) => discount.priceListItemId === rows()[1].priceListItemId)?.discountValue, '15');
});

test('Product Create transaction rolls back price items and discounts when one initial discount fails', async () => {
  const { service, rows, discounts } = fixture([]);
  const dataSource = (service as any).dataSource;
  await assert.rejects(() => dataSource.transaction((manager: any) => (service as any).syncSellingPrices(manager, 10, [
    { priceListId: 5, unitId: 3, sellingPrice: 250, effectiveFrom: '2026-08-18', discount: { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: '2026-08-18' } },
    { priceListId: 6, unitId: 3, sellingPrice: 200, effectiveFrom: '2026-08-18', discount: { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '120', effectiveFrom: '2026-08-18' } },
  ], [], 7, 4)), BadRequestException);
  assert.equal(rows().length, 0);
  assert.equal(discounts().length, 0);
});

test('new selling prices reject a non-base ProductUnit', async () => {
  const { service } = fixture([]);
  const manager = (service as any).dataSource.manager;
  const original = manager.getRepository;
  manager.getRepository = (entity: any) => entity === ProductUnit ? {
    findOneBy: async () => ({ ...productUnit, isBaseUnit: false, isSalesUnit: false, conversionFactor: '24' }),
  } : original(entity);
  await assert.rejects(
    () => (service as any).syncSellingPrices(manager, 10, [{ priceListId: 5, unitId: 4, sellingPrice: 99, effectiveFrom: '2026-08-18' }], [], 7),
    (error: any) => error instanceof BadRequestException && /only use the active base Product Unit/.test(error.message),
  );
});

test('selling-price history uses server-side pages of 25 rows by default', async () => {
  const now = Date.now();
  const { service } = fixture(Array.from({ length: 60 }, (_, index) => price(index + 1, 100 + index, new Date(now - index * 1000))));
  const page = await service.getSellingPriceHistory(10, 7, { page: '2' });
  assert.equal(page.page, 2);
  assert.equal(page.limit, 25);
  assert.equal(page.items.length, 25);
  assert.equal(page.totalItems, 60);
  assert.equal(page.totalPages, 3);
});

test('immediate publish closes the current revision one millisecond before the new server-timed revision', async () => {
  const { service, rows } = fixture([price(1, 100, new Date(Date.now() - 100_000))]);
  await service.publishSellingPrices(10, { actions: [{ action: 'CHANGE_PRICE', priceListItemId: 1, price: 125, effectiveMode: 'NOW' }] }, 7);
  const saved = rows().find((row) => row.priceListItemId !== 1)!;
  const old = rows().find((row) => row.priceListItemId === 1)!;
  assert.equal(saved.sellingPrice, '125');
  assert.equal(saved.effectiveFrom.getTime() - old.effectiveTo.getTime(), 1);
});

test('scheduled publish rejects an existing future revision without modifying history', async () => {
  const now = Date.now();
  const initial = [price(1, 100, new Date(now - 100_000)), price(2, 110, new Date(now + 200_000))];
  const { service, rows } = fixture(initial);
  await assert.rejects(
    () => service.publishSellingPrices(10, { actions: [{ action: 'CHANGE_PRICE', priceListItemId: 1, price: 120, effectiveMode: 'SCHEDULED', effectiveFrom: new Date(now + 100_000).toISOString() }] }, 7),
    (error: any) => error instanceof BadRequestException && /future selling price already exists/.test(error.message),
  );
  assert.equal(rows().length, 2);
  assert.equal(rows()[0].effectiveTo, null);
});

test('an invalid action rolls back every earlier action in the publish batch', async () => {
  const now = Date.now();
  const first = price(1, 100, new Date(now - 200_000));
  const second = { ...price(2, 200, new Date(now - 200_000)), priceListId: 6, priceList: { ...list, priceListId: 6, name: 'Wholesale' } };
  const { service, rows } = fixture([first, second]);
  await assert.rejects(() => service.publishSellingPrices(10, { actions: [
    { action: 'END_PRICE', priceListItemId: 1, effectiveTo: new Date(now + 100_000).toISOString() },
    { action: 'END_PRICE', priceListItemId: 2, effectiveTo: new Date(now - 100_000).toISOString() },
  ] }, 7));
  assert.equal(rows().find((row) => row.priceListItemId === 1)?.effectiveTo, null);
  assert.equal(rows().find((row) => row.priceListItemId === 2)?.effectiveTo, null);
});

test('changing a base price caps its discount and does not inherit it automatically', async () => {
  const oldPrice = price(1, 100, new Date(Date.now() - 100_000));
  const attached = { priceListItemDiscountId: 10, tenantId: 7, priceListItemId: 1, discountType: 'PERCENTAGE', discountValue: '10', effectiveFrom: oldPrice.effectiveFrom, effectiveTo: null, isActive: true };
  const { service, rows, discounts } = fixture([oldPrice], [attached]);
  await service.publishSellingPrices(10, { actions: [{ action: 'CHANGE_PRICE', priceListItemId: 1, price: 120, effectiveMode: 'NOW' }] }, 7, 3);
  const replacement = rows().find((row) => row.priceListItemId !== 1)!;
  assert.equal(discounts().length, 1);
  assert.equal(discounts()[0].effectiveTo.getTime(), rows()[0].effectiveTo.getTime());
  assert.equal(discounts().some((row) => row.priceListItemId === replacement.priceListItemId), false);
});

test('a price change creates a child discount only when explicitly requested', async () => {
  const oldPrice = price(1, 100, new Date(Date.now() - 100_000));
  const { service, rows, discounts } = fixture([oldPrice]);
  const effectiveFrom = new Date(Date.now() + 60_000).toISOString();
  await service.publishSellingPrices(10, { actions: [{ action: 'CHANGE_PRICE', priceListItemId: 1, price: 200, effectiveMode: 'SCHEDULED', effectiveFrom, newDiscount: { discountType: 'PERCENTAGE' as any, discountValue: '5', effectiveFrom } }] }, 7, 3);
  const replacement = rows().find((row) => row.priceListItemId !== 1)!;
  assert.equal(discounts().length, 1);
  assert.equal(discounts()[0].priceListItemId, replacement.priceListItemId);
});

test('price and child discount changes roll back together when replacement validation fails', async () => {
  const oldPrice = price(1, 100, new Date(Date.now() - 100_000));
  const attached = { priceListItemDiscountId: 10, tenantId: 7, priceListItemId: 1, discountType: 'PERCENTAGE', discountValue: '10', effectiveFrom: oldPrice.effectiveFrom, effectiveTo: null, isActive: true };
  const { service, rows, discounts } = fixture([oldPrice], [attached]);
  const effectiveFrom = new Date(Date.now() + 60_000).toISOString();
  await assert.rejects(() => service.publishSellingPrices(10, { actions: [{ action: 'CHANGE_PRICE', priceListItemId: 1, price: 200, effectiveMode: 'SCHEDULED', effectiveFrom, newDiscount: { discountType: 'PERCENTAGE' as any, discountValue: '101', effectiveFrom } }] }, 7, 3), BadRequestException);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].effectiveTo, null);
  assert.equal(discounts().length, 1);
  assert.equal(discounts()[0].effectiveTo, null);
});
