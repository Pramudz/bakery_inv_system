import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceListItemDiscount, PriceListItemDiscountType } from './price-list-item-discounts.entity';
import { PriceListItemDiscountService } from './price-list-item-discounts.service';

const parent = { priceListItemId: 11, tenantId: 7, productId: 10, productUnitId: 3, priceListId: 5, sellingPrice: '100.00', minimumQuantity: '1', currencyCode: 'LKR', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-12-31T23:59:59Z'), isActive: true } as PriceListItem;

function publishFixture(overlap = false) {
  const saved: any[] = [];
  const priceBuilder: any = { setLock: () => priceBuilder, leftJoinAndSelect: () => priceBuilder, where: (_sql: string, params: any) => { priceBuilder.params = params; return priceBuilder; }, getOne: async () => priceBuilder.params.tenantId === 7 ? parent : null };
  const discountBuilder: any = { setLock: () => discountBuilder, where: () => discountBuilder, andWhere: () => discountBuilder, getOne: async () => overlap ? { priceListItemDiscountId: 99 } : null };
  const discountRepo: any = { createQueryBuilder: () => discountBuilder, create: (value: any) => value, save: async (value: any) => { const row = { priceListItemDiscountId: 1, ...value }; saved.push(row); return row; } };
  const manager: any = { getRepository: (entity: any) => entity === PriceListItem ? { createQueryBuilder: () => priceBuilder } : entity === PriceListItemDiscount ? discountRepo : {} };
  const dataSource: any = { manager, transaction: (work: any) => work(manager) };
  return { service: new PriceListItemDiscountService(discountRepo, dataSource), saved };
}

const valid = { discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10.00', effectiveFrom: '2026-02-01T00:00:00Z', effectiveTo: '2026-02-28T23:59:59Z' };

test('publishing rejects cross-tenant access', async () => {
  const { service } = publishFixture();
  await assert.rejects(() => service.publishDiscount(11, valid, 8, 2), NotFoundException);
});

test('publishing rejects invalid percentage and dates outside parent validity', async () => {
  const { service } = publishFixture();
  await assert.rejects(() => service.publishDiscount(11, { ...valid, discountValue: '100.0001' }, 7, 2), BadRequestException);
  await assert.rejects(() => service.publishDiscount(11, { ...valid, effectiveFrom: '2025-12-31T00:00:00Z' }, 7, 2), BadRequestException);
  await assert.rejects(() => service.publishDiscount(11, { ...valid, effectiveTo: undefined }, 7, 2), BadRequestException);
});

test('publishing rejects overlapping active or scheduled discounts', async () => {
  const { service, saved } = publishFixture(true);
  await assert.rejects(() => service.publishDiscount(11, valid, 7, 2), (error: any) => error instanceof BadRequestException && /overlaps/.test(error.message));
  assert.equal(saved.length, 0);
});

test('retail and wholesale price items resolve their own discounts independently', async () => {
  const prices = [{ ...parent }, { ...parent, priceListItemId: 12, priceListId: 6, sellingPrice: '80.00' }];
  let priceParams: any; let discountParams: any;
  const priceBuilder: any = { where: (_sql: string, params: any) => { priceParams = params; return priceBuilder; }, andWhere: () => priceBuilder, orderBy: () => priceBuilder, addOrderBy: () => priceBuilder, getMany: async () => prices.filter((row) => row.priceListId === priceParams.priceListId) };
  const discountBuilder: any = { where: (_sql: string, params: any) => { discountParams = params; return discountBuilder; }, andWhere: () => discountBuilder, orderBy: () => discountBuilder, getOne: async () => discountParams.priceListItemId === 11 ? { priceListItemDiscountId: 21, tenantId: 7, priceListItemId: 11, discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true } : { priceListItemDiscountId: 22, tenantId: 7, priceListItemId: 12, discountType: PriceListItemDiscountType.FIXED_AMOUNT, discountValue: '5', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true } };
  const manager: any = { getRepository: (entity: any) => entity === PriceListItem ? { createQueryBuilder: () => priceBuilder, findOneBy: async (where: any) => prices.find((row) => row.priceListItemId === where.priceListItemId && row.tenantId === where.tenantId) } : { createQueryBuilder: () => discountBuilder } };
  const service = new PriceListItemDiscountService({} as any, { manager } as any);
  const retail = await service.resolveSellingPrice({ productId: 10, productUnitId: 3, priceListId: 5, quantity: '1', transactionDate: '2026-03-01T00:00:00Z' }, 7);
  const wholesale = await service.resolveSellingPrice({ productId: 10, productUnitId: 3, priceListId: 6, quantity: '1', transactionDate: '2026-03-01T00:00:00Z' }, 7);
  assert.equal(retail.finalUnitPrice, '90.0000');
  assert.equal(wholesale.finalUnitPrice, '75.0000');
  assert.notEqual(retail.discount?.id, wholesale.discount?.id);
});

test('changing a discount ends the published row and creates a replacement atomically', async () => {
  let rows: any[] = [{ priceListItemDiscountId: 31, tenantId: 7, priceListItemId: 11, discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: new Date('2026-02-01T00:00:00Z'), effectiveTo: null, isActive: true }];
  let discountQueryCount = 0;
  const priceBuilder: any = { setLock: () => priceBuilder, leftJoinAndSelect: () => priceBuilder, where: () => priceBuilder, getOne: async () => parent };
  const discountRepo: any = {
    createQueryBuilder: () => {
      const call = discountQueryCount++;
      const builder: any = { setLock: () => builder, where: () => builder, andWhere: () => builder, orderBy: () => builder, getOne: async () => call === 0 ? rows[0] : null };
      return builder;
    },
    update: async (where: any, values: any) => { rows = rows.map((row) => row.priceListItemDiscountId === where.priceListItemDiscountId ? { ...row, ...values } : row); },
    create: (value: any) => value,
    save: async (value: any) => { const saved = { priceListItemDiscountId: 32, ...value }; rows.push(saved); return saved; },
  };
  const manager: any = { getRepository: (entity: any) => entity === PriceListItem ? { createQueryBuilder: () => priceBuilder } : discountRepo };
  const dataSource: any = { transaction: async (work: any) => { const before = rows.map((row) => ({ ...row })); try { return await work(manager); } catch (error) { rows = before; throw error; } } };
  const service = new PriceListItemDiscountService(discountRepo, dataSource);
  const start = '2026-03-01T00:00:00Z';
  await service.changeDiscount(11, { discountType: PriceListItemDiscountType.FIXED_AMOUNT, discountValue: '15', effectiveFrom: start, effectiveTo: '2026-04-01T00:00:00Z' }, 7, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].effectiveTo.getTime(), new Date(start).getTime() - 1);
  assert.equal(rows[0].endedBy, 2);
  assert.equal(rows[1].discountType, PriceListItemDiscountType.FIXED_AMOUNT);
});

test('change-discount rolls its end operation back when replacement creation fails', async () => {
  let rows: any[] = [{ priceListItemDiscountId: 51, tenantId: 7, priceListItemId: 11, discountType: PriceListItemDiscountType.PERCENTAGE, discountValue: '10', effectiveFrom: new Date('2026-02-01T00:00:00Z'), effectiveTo: null, isActive: true }];
  let calls = 0;
  const priceBuilder: any = { setLock: () => priceBuilder, leftJoinAndSelect: () => priceBuilder, where: () => priceBuilder, getOne: async () => parent };
  const repo: any = {
    createQueryBuilder: () => { const call = calls++; const builder: any = { setLock: () => builder, where: () => builder, andWhere: () => builder, orderBy: () => builder, getOne: async () => call === 0 ? rows[0] : { priceListItemDiscountId: 52 } }; return builder; },
    update: async (_where: any, values: any) => Object.assign(rows[0], values), create: (value: any) => value, save: async (value: any) => value,
  };
  const manager: any = { getRepository: (entity: any) => entity === PriceListItem ? { createQueryBuilder: () => priceBuilder } : repo };
  const service = new PriceListItemDiscountService(repo, { transaction: async (work: any) => { const before = rows.map((row) => ({ ...row })); try { return await work(manager); } catch (error) { rows = before; throw error; } } } as any);
  await assert.rejects(() => service.changeDiscount(11, { ...valid, effectiveFrom: '2026-03-01T00:00:00Z' }, 7, 2), BadRequestException);
  assert.equal(rows[0].effectiveTo, null);
  assert.equal(rows[0].endedBy, undefined);
});

test('ending a discount preserves its parent price', async () => {
  const discount: any = { priceListItemDiscountId: 41, tenantId: 7, priceListItemId: 11, effectiveFrom: new Date('2026-02-01T00:00:00Z'), effectiveTo: null, isActive: true };
  const originalParentEnd = parent.effectiveTo;
  const builder: any = { setLock: () => builder, where: () => builder, getOne: async () => discount };
  const repo: any = { createQueryBuilder: () => builder, findOneBy: async () => discount, update: async (_where: any, values: any) => Object.assign(discount, values), findOneByOrFail: async () => discount };
  const priceBuilder: any = { setLock: () => priceBuilder, leftJoinAndSelect: () => priceBuilder, where: () => priceBuilder, getOne: async () => parent };
  const manager: any = { getRepository: (entity: any) => entity === PriceListItem ? { createQueryBuilder: () => priceBuilder } : repo };
  const service = new PriceListItemDiscountService(repo, { transaction: (work: any) => work(manager) } as any);
  await service.endDiscount(41, { effectiveTo: '2026-03-01T00:00:00Z' }, 7, 2);
  assert.equal(discount.endedBy, 2);
  assert.equal(parent.effectiveTo, originalParentEnd);
});
