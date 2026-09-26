import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { assertProductOperationalReadiness } from './product-operational-readiness';
import { Product } from './products.entity';
import { Tenant } from '../tenants/tenant.entity';

function managerFor(product: Partial<Product>, sellingCount = 1, supplierCount = 1, locationCount = 1) {
  const builder = (count: number) => {
    const query: any = { innerJoin: () => query, where: () => query, andWhere: () => query, getCount: async () => count };
    return query;
  };
  return {
    getRepository(entity: any) {
      if (entity === Product) return { findOneBy: async () => ({ productId: 10, tenantId: 3, isActive: true, isSellable: false, isPurchasable: false, isStockItem: false, ...product }) };
      if (entity === Tenant) return { findOneBy: async () => ({ tenantId: 3, timeZone: 'Asia/Colombo' }) };
      if (entity === PriceListItem) return { createQueryBuilder: () => builder(sellingCount) };
      if (entity === ProductSupplierPrice) return { createQueryBuilder: () => builder(supplierCount) };
      if (entity === ProductLocation) return { countBy: async () => locationCount };
      return {};
    },
  } as any;
}

test('inactive products may remain operationally incomplete', async () => {
  await assert.doesNotReject(() => assertProductOperationalReadiness(managerFor({ isActive: false, isSellable: true, isPurchasable: true, isStockItem: true }, 0, 0, 0), 10, 3));
});

test('active sellable products require a current usable selling price without requiring a location', async () => {
  await assert.rejects(() => assertProductOperationalReadiness(managerFor({ isSellable: true }, 0, 1, 0), 10, 3), (error: any) => error instanceof BadRequestException && /selling price/.test(error.message));
  await assert.doesNotReject(() => assertProductOperationalReadiness(managerFor({ isSellable: true }, 1, 1, 0), 10, 3));
});

test('active purchasable products require a coherent supplier price chain without requiring a location', async () => {
  await assert.rejects(() => assertProductOperationalReadiness(managerFor({ isPurchasable: true }, 1, 0, 0), 10, 3), (error: any) => error instanceof BadRequestException && /supplier/.test(error.message));
  await assert.doesNotReject(() => assertProductOperationalReadiness(managerFor({ isPurchasable: true }, 1, 1, 0), 10, 3));
});

test('active stock items require an active location but no purchasing or selling location flags', async () => {
  await assert.rejects(() => assertProductOperationalReadiness(managerFor({ isStockItem: true }, 1, 1, 0), 10, 3), BadRequestException);
  await assert.doesNotReject(() => assertProductOperationalReadiness(managerFor({ isStockItem: true }, 1, 1, 1), 10, 3));
});
