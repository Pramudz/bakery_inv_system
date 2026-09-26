import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductSupplierService } from '../product-suppliers/product-suppliers.service';
import { ProductUnitService } from '../product-units/product-units.service';
import { ProductLocationService } from '../product-locations/product-locations.service';
import { Product } from './products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Location } from '../locations/locations.entity';

test('relationship entities declare the required product-scoped unique constraints', () => {
  const uniques = getMetadataArgsStorage().uniques;
  const columns = (target: Function) => uniques
    .filter((unique) => unique.target === target)
    .map((unique) => typeof unique.columns === 'function' ? unique.columns({} as never) : unique.columns);
  assert.ok(columns(ProductSupplier).some((value) => JSON.stringify(value) === JSON.stringify(['productId', 'supplierId'])));
  assert.ok(columns(ProductUnit).some((value) => JSON.stringify(value) === JSON.stringify(['productId', 'unitId'])));
  assert.ok(columns(ProductLocation).some((value) => JSON.stringify(value) === JSON.stringify(['productId', 'locationId'])));
});

test('duplicate product supplier is rejected and an inactive relationship is reactivated', async () => {
  const existing: any = { productSupplierId: 5, productId: 10, supplierId: 20, isActive: true };
  const repository: any = {
    findOneBy: async () => existing,
    create: (value: any) => value,
    save: async (value: any) => value,
    update: async () => undefined,
  };
  const manager: any = { getRepository: (entity: any) => entity === ProductSupplier ? repository : { findOneBy: async () => ({}) } };
  const dataSource: any = { transaction: async (work: any) => work(manager), getRepository: manager.getRepository };
  const service = new ProductSupplierService(repository, dataSource);
  await assert.rejects(() => service.create({ productId: 10, supplierId: 20 }, 1), ConflictException);
  existing.isActive = false;
  const reactivated = await service.create({ productId: 10, supplierId: 20 }, 1);
  assert.equal(reactivated.isActive, true);
  assert.equal(reactivated.productSupplierId, 5);
});

test('primary supplier selection clears other active relationships in the same transaction', async () => {
  const updates: any[] = [];
  const repository: any = {
    findOneBy: async () => null,
    create: (value: any) => value,
    save: async (value: any) => ({ ...value, productSupplierId: 9 }),
    update: async (where: any, values: any) => updates.push({ where, values }),
  };
  const manager: any = { getRepository: (entity: any) => entity === ProductSupplier ? repository : { findOneBy: async () => ({}) } };
  const service = new ProductSupplierService(repository, { transaction: async (work: any) => work(manager) } as any);
  const saved = await service.create({ productId: 10, supplierId: 21, isPrimarySupplier: true }, 1);
  assert.equal(saved.isPrimarySupplier, true);
  assert.deepEqual(updates[0], { where: { productId: 10, isActive: true }, values: { isPrimarySupplier: false } });
});

test('duplicate product unit and product location assignments are rejected', async () => {
  const duplicateRepo: any = {
    findOneBy: async () => ({ productUnitId: 1, productLocationId: 1 }),
    save: async (value: any) => value,
    create: (value: any) => value,
  };
  const dataSource: any = {
    getRepository: (entity: any) => ({
      findOne: async () => entity === Product || entity === UnitOfMeasure || entity === Location ? {} : null,
    }),
  };
  await assert.rejects(
    () => new ProductUnitService(duplicateRepo, dataSource).create({ productId: 1, unitId: 2, conversionFactor: 1 }, 7),
    ConflictException,
  );
  await assert.rejects(
    () => new ProductLocationService(duplicateRepo, dataSource).create({ productId: 1, locationId: 3 }, 7),
    ConflictException,
  );
});
