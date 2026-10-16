import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRetailDiscount } from './retail-discount';
import type { PosPriceLine } from './pos-pricing.service';
const base = { quantity: 2, unitPrice: 500, grossTotal: 1000, discountAmount: 20, discountPercentage: 2, netTotal: 980, priceListItemDiscountId: 3 } as PosPriceLine;
test('retail percentage and amount discounts use the server price and synchronize totals', () => {
  const percentage = applyRetailDiscount(base, 'RETAIL', {type:'PERCENTAGE',value:10});
  assert.equal(percentage.discountAmount, 100);
  assert.equal(percentage.netTotal, 900);
  assert.equal(percentage.priceListItemDiscountId, null);
  const amount = applyRetailDiscount(base, 'RETAIL', {type:'AMOUNT',value:125});
  assert.equal(amount.discountPercentage, 12.5);
  assert.equal(amount.netTotal, 875);
  assert.equal(amount.discountPerUnit, 62.5);
});
test('manual discounts are rejected for wholesale and invalid values', () => {
  assert.throws(() => applyRetailDiscount(base, 'WHOLESALE', {type:'AMOUNT',value:10}), /retail/i);
  for (const override of [{type:'PERCENTAGE',value:101},{type:'AMOUNT',value:1001},{type:'AMOUNT',value:-1},{type:'AMOUNT',value:NaN},{type:'INVALID',value:10}]) {
    assert.throws(() => applyRetailDiscount(base, 'RETAIL', override as any));
  }
  assert.equal(applyRetailDiscount(base, 'WHOLESALE'), base);
  assert.equal(applyRetailDiscount(base, 'RETAIL', {type:'AMOUNT',value:0}).discountAmount, 0);
});

import { PosPricingService } from './pos-pricing.service';
import { PriceList } from '../price-lists/price-lists.entity';
import { Product } from '../products/products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
test('real pricing service applies retail edits to quotes and keeps wholesale rules unchanged', async () => {
  const manager: any = { getRepository(entity: unknown) {
    if (entity === PriceList) return { findBy: async () => [{priceListId:1,priceListType:'RETAIL',isDefault:true},{priceListId:2,priceListType:'WHOLESALE',isDefault:true}] };
    if (entity === Product) return { findOneBy: async (where: any) => ({productId:where.productId,baseUnitId:1}) };
    if (entity === ProductLocation) return { findOneBy: async () => ({}) };
    if (entity === ProductUnit) return { findOneBy: async () => ({productUnitId:1,conversionFactor:'1'}) };
    throw new Error('Unexpected repository');
  } };
  const discounts: any = { resolveSellingPriceWithManager: async () => ({originalUnitPrice:'500',priceListItemId:40,currencyCode:'LKR',discount:{id:3,type:'PERCENTAGE',value:'2',amountPerUnit:'10'}}) };
  const service = new PosPricingService({manager} as any, discounts);
  const retail = await service.quote(1,1,'RETAIL',[{productId:10,quantity:2,retailDiscount:{type:'AMOUNT',value:125}}]);
  assert.equal(retail.subtotal,1000);
  assert.equal(retail.discountTotal,125);
  assert.equal(retail.grandTotal,875);
  const percent = await service.quote(1,1,'RETAIL',[{productId:10,quantity:3,retailDiscount:{type:'PERCENTAGE',value:10}}]);
  assert.equal(percent.discountTotal,150);
  const wholesale = await service.quote(1,1,'WHOLESALE',[{productId:10,quantity:2}]);
  assert.equal(wholesale.discountTotal,20);
  await assert.rejects(service.quote(1,1,'WHOLESALE',[{productId:10,quantity:2,retailDiscount:{type:'AMOUNT',value:10}}]),/retail/i);
});
