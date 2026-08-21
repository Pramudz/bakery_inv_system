import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './products.service';
import { Product } from './products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { PurchaseOrderLine } from '../purchase-orders/purchase-order-line.entity';
import { GoodsReceiptLine } from '../goods-receipts/goods-receipt-line.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { ProductIdentifier } from '../product-identifiers/product-identifiers.entity';

type FixtureOptions = { purchaseOrderUnitId?: number; productHasHistory?: boolean; productBaseUnitId?: number };

function fixture(existing: any[], options: FixtureOptions = {}) {
  const deleted: any[] = [];
  const saved: any[] = [];
  const unitRepository: any = {
    find: async () => existing,
    create: (value: any) => value,
    save: async (value: any) => {
      const result = { productUnitId: value.productUnitId ?? 100 + saved.length, ...value };
      saved.push(result);
      return result;
    },
    delete: async (where: any) => deleted.push(where),
  };
  const countForUnit = (where: any) => Number(where.productUnitId) === Number(options.purchaseOrderUnitId) ? 1 : 0;
  const manager: any = {
    getRepository: (entity: any) => {
      if (entity === ProductUnit) return unitRepository;
      if (entity === Product) return { findOneByOrFail: async () => ({ productId: 10, baseUnitId: options.productBaseUnitId ?? 1 }) };
      if (entity === InventoryBalance) return { count: async () => options.productHasHistory ? 1 : 0 };
      if (entity === InventoryLedger || entity === InventoryAgeLayer) return { countBy: async () => 0 };
      if (entity === PurchaseOrderLine) return { countBy: async (where: any) => where.productId ? (options.productHasHistory ? 1 : 0) : countForUnit(where) };
      if (entity === GoodsReceiptLine || entity === ProductSupplier || entity === ProductSupplierUnit || entity === ProductSupplierPrice || entity === PriceListItem || entity === ProductIdentifier) return { countBy: async () => 0 };
      throw new Error(`Unexpected repository: ${entity?.name}`);
    },
  };
  const service = new ProductService({} as any, { manager } as any, {} as any);
  return { service, manager, deleted, saved };
}

const base = { productUnitId: 1, productId: 10, unitId: 1, conversionFactor: '1', isBaseUnit: true, isPurchaseUnit: true, isSalesUnit: true, isActive: true, unit: { name: 'Each' } };
const caseUnit = { productUnitId: 2, productId: 10, unitId: 2, conversionFactor: '24', isBaseUnit: false, isPurchaseUnit: true, isSalesUnit: false, isActive: true, unit: { name: 'Case' } };
const baseRow = { productUnitId: 1, unitId: 1, conversionFactor: 1, isBaseUnit: true, isPurchaseUnit: true, isSalesUnit: true, isActive: true };

test('removes an absent saved non-base ProductUnit when it has no references', async () => {
  const { service, manager, deleted } = fixture([{ ...base }, { ...caseUnit }]);
  await (service as any).syncProductUnits(manager, 10, [baseRow]);
  assert.deepEqual(deleted, [{ productUnitId: 2, productId: 10 }]);
});

test('rejects removal of a referenced ProductUnit and names the reason', async () => {
  const { service, manager, deleted } = fixture([{ ...base }, { ...caseUnit }], { purchaseOrderUnitId: 2 });
  await assert.rejects(
    () => (service as any).syncProductUnits(manager, 10, [baseRow]),
    (error: any) => error instanceof BadRequestException && /Case cannot be removed.*purchase order history.*Deactivate it instead/.test(error.message),
  );
  assert.equal(deleted.length, 0);
});

test('allows a referenced non-base ProductUnit to be deactivated', async () => {
  const { service, manager, saved } = fixture([{ ...base }, { ...caseUnit }], { purchaseOrderUnitId: 2 });
  await (service as any).syncProductUnits(manager, 10, [baseRow, { ...caseUnit, isActive: false }]);
  assert.equal(saved.find((unit) => unit.productUnitId === 2)?.isActive, false);
});

test('automatically makes only the base ProductUnit sales-enabled', async () => {
  const { service, manager, saved } = fixture([{ ...base }, { ...caseUnit }]);
  await (service as any).syncProductUnits(manager, 10, [
    { ...baseRow, isSalesUnit: false },
    { ...caseUnit, isSalesUnit: true },
  ]);
  assert.equal(saved.find((unit) => unit.productUnitId === 1)?.isSalesUnit, true);
  assert.equal(saved.find((unit) => unit.productUnitId === 2)?.isSalesUnit, false);
});

test('blocks base unit identity or conversion changes after stock or transactions exist', async () => {
  const { service, manager } = fixture([{ ...base }, { ...caseUnit }], { productHasHistory: true });
  await assert.rejects(
    () => (service as any).syncProductUnits(manager, 10, [{ ...baseRow, conversionFactor: 2 }]),
    (error: any) => error instanceof BadRequestException && error.message === 'Base unit conversion must be 1.',
  );
  const changedBase = fixture([{ ...base }, { ...caseUnit }], { productHasHistory: true, productBaseUnitId: 2 });
  await assert.rejects(
    () => (changedBase.service as any).syncProductUnits(changedBase.manager, 10, [{ ...baseRow, productUnitId: 2, unitId: 2 }]),
    (error: any) => error instanceof BadRequestException && error.message === 'Base unit cannot be changed after product creation.',
  );
});

test('never permits the base ProductUnit to be removed or deactivated', async () => {
  const { service, manager } = fixture([{ ...base }]);
  await assert.rejects(
    () => (service as any).syncProductUnits(manager, 10, []),
    (error: any) => error instanceof BadRequestException && error.message === 'Exactly one active base unit is required.',
  );
  await assert.rejects(
    () => (service as any).syncProductUnits(manager, 10, [{ ...baseRow, isActive: false }]),
    (error: any) => error instanceof BadRequestException && error.message === 'Exactly one active base unit is required.',
  );
});
