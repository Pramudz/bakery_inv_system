import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './products.service';
import { Product } from './products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';

const list = { priceListId: 5, tenantId: 7, code: 'RETAIL', name: 'Retail', currencyCode: 'LKR', isActive: true };
const productUnit = { productUnitId: 9, productId: 10, unitId: 3, conversionFactor: '1', isBaseUnit: true, isActive: true, isSalesUnit: true, unit: { unitId: 3, code: 'EA', name: 'Each' } };

function price(id: number, amount: number, from: Date, to: Date | null = null) {
  return { priceListItemId: id, tenantId: 7, productId: 10, priceListId: 5, productUnitId: 9, unitId: 3, sellingPrice: String(amount), currencyCode: 'LKR', minimumQuantity: '1', effectiveFrom: from, effectiveTo: to, isActive: true, priceList: list, productUnit } as any;
}

function fixture(initial: any[]) {
  let rows = initial.map((row) => ({ ...row }));
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
  const manager: any = {
    getRepository: (entity: any) => {
      if (entity === PriceListItem) return priceRepo;
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
      try { return await work(manager); }
      catch (error) { rows = before; throw error; }
    },
  };
  return { service: new ProductService({} as any, dataSource, {} as any), rows: () => rows };
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
