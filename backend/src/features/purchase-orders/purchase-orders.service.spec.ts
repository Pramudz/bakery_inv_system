import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { PurchaseOrdersService } from './purchase-orders.service';

const service = new PurchaseOrdersService({} as any, {} as any) as any;

test('PO manual cost and supplier-price variance require a trimmed override reason', () => {
  assert.throws(() => service.costOverrideReason('  ', true), BadRequestException);
  assert.equal(service.costOverrideReason(' Market shortage ', true), 'Market shortage');
  assert.equal(service.costOverrideReason(undefined, false), null);
});

test('PO selected supplier price is resolved at order date and currency', async () => {
  const price = { productSupplierPriceId: 9, productSupplierUnitId: 7, minimumQuantity: '1', currencyCode: 'LKR', isActive: true, purchasePrice: '25', effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-12-31') };
  const manager: any = { getRepository: (entity: any) => entity === ProductSupplierPrice ? { findOneBy: async () => price } : {} };
  assert.equal((await service.resolveSupplierPrice(manager, { sourceSupplierPriceId: 9, orderedQty: 2 }, 7, '2026-08-22', 'LKR')).productSupplierPriceId, 9);
  await assert.rejects(() => service.resolveSupplierPrice(manager, { sourceSupplierPriceId: 9, orderedQty: 2 }, 7, '2027-01-01', 'LKR'), BadRequestException);
});

test('PO eligibility rejects contradictory client unit and enforces product, location, supplier and supplier-unit chain', async () => {
  const values = new Map<any, any>([
    [Product, { productId: 1 }], [ProductLocation, { productLocationId: 2 }],
    [ProductUnit, { productUnitId: 3, unitId: 4, conversionFactor: '12' }],
    [ProductSupplier, { productSupplierId: 5 }], [ProductSupplierUnit, { productSupplierUnitId: 6 }],
  ]);
  const manager: any = { getRepository: (entity: any) => ({ findOneBy: async () => values.get(entity) }) };
  await assert.rejects(() => service.resolvePurchasingContext(manager, 1, 3, 99, 8, 9, 10), (error: any) => error instanceof BadRequestException && /Unit does not match/.test(error.message));
  const result = await service.resolvePurchasingContext(manager, 1, 3, 4, 8, 9, 10);
  assert.equal(result.supplierUnit.productSupplierUnitId, 6);
});
