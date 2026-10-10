import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductService } from './products.service';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';

test('supplier price revision stores adjacent whole-second versions for DATETIME(0)', async () => {
  const supplierUnit = { productSupplierUnitId: 31, productSupplier: { productId: 5, product: { tenantId: 7 } } };
  const old = { productSupplierPriceId: 11, productSupplierUnitId: 31, productSupplierUnit: supplierUnit,
    purchasePrice: '150', currencyCode: 'LKR', minimumQuantity: '12',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null as Date | null, isActive: true };
  const rows: any[] = [old];
  const repo = {
    findOne: async () => old,
    find: async () => rows,
    update: async (_where: unknown, values: any) => { Object.assign(old, values); },
    create: (values: any) => values,
    save: async (values: any) => { rows.push(values); return values; },
  };
  const manager: any = { getRepository: (entity: any) => {
    if (entity === ProductSupplierPrice) return repo;
    throw Error(`Unexpected ${entity.name}`);
  } };
  const service = new ProductService({} as any, {} as any, {} as any, {} as any) as any;
  await service.publishSupplierPurchasePriceAction(manager, 5, 7, {
    action: 'CHANGE_PRICE', productSupplierPriceId: 11, productSupplierUnitId: 31,
    price: 165, currencyCode: 'LKR', minimumQuantity: 12,
    effectiveMode: 'SCHEDULED', effectiveFrom: '2099-11-01T00:00:00.000Z',
  });
  assert.equal(old.purchasePrice, '150');
  assert.equal(old.effectiveTo?.toISOString(), '2099-10-31T23:59:59.000Z');
  assert.equal(rows[1].purchasePrice, '165');
  assert.equal(rows[1].effectiveFrom.toISOString(), '2099-11-01T00:00:00.000Z');
});
