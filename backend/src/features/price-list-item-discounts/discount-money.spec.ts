import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { discountBreakdown } from './discount-money';
import { discountStatus, PriceListItemDiscountService } from './price-list-item-discounts.service';
import { PriceListItemDiscountType } from './price-list-item-discounts.entity';

test('percentage discount calculation uses decimal arithmetic', () => {
  assert.deepEqual(discountBreakdown('1000.00', PriceListItemDiscountType.PERCENTAGE, '10.00'), { amount: '100.0000', finalPrice: '900.0000' });
});

test('fixed-amount discount calculation uses decimal arithmetic', () => {
  assert.deepEqual(discountBreakdown('1000.00', PriceListItemDiscountType.FIXED_AMOUNT, '125.50'), { amount: '125.5000', finalPrice: '874.5000' });
});

test('fixed discount exceeding the base price is rejected', () => {
  assert.throws(() => discountBreakdown('10', PriceListItemDiscountType.FIXED_AMOUNT, '10.0001'), BadRequestException);
});

test('scheduled discount is future, current, then ended around its validity', () => {
  const row = { isActive: true, effectiveFrom: new Date('2026-01-02T00:00:00Z'), effectiveTo: new Date('2026-01-03T00:00:00Z') };
  assert.equal(discountStatus(row as any, new Date('2026-01-01T00:00:00Z')), 'FUTURE');
  assert.equal(discountStatus(row as any, new Date('2026-01-02T12:00:00Z')), 'CURRENT');
  assert.equal(discountStatus(row as any, new Date('2026-01-04T00:00:00Z')), 'ENDED');
});

test('no-discount resolution returns the original unit price', async () => {
  const price = { priceListItemId: 1, tenantId: 7, productId: 10, productUnitId: 3, priceListId: 5, sellingPrice: '99.95', minimumQuantity: '1', currencyCode: 'LKR', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true };
  const priceBuilder: any = { where: () => priceBuilder, andWhere: () => priceBuilder, orderBy: () => priceBuilder, addOrderBy: () => priceBuilder, getMany: async () => [price] };
  const discountBuilder: any = { where: () => discountBuilder, andWhere: () => discountBuilder, orderBy: () => discountBuilder, getOne: async () => null };
  const manager: any = { getRepository: (entity: any) => entity.name === 'PriceListItem' ? { createQueryBuilder: () => priceBuilder, findOneBy: async () => price } : { createQueryBuilder: () => discountBuilder } };
  const service = new PriceListItemDiscountService({} as any, { manager } as any);
  const result = await service.resolveSellingPrice({ productId: 10, productUnitId: 3, priceListId: 5, quantity: '2', transactionDate: '2026-02-01T00:00:00Z' }, 7);
  assert.equal(result.discount, null);
  assert.equal(result.finalUnitPrice, '99.9500');
});
