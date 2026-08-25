import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { IdentifierType } from '../identifier-types/identifier-types.entity';
import { Product } from '../products/products.entity';
import { ProductIdentifier } from './product-identifiers.entity';
import { ProductIdentifierService } from './product-identifiers.service';
import { ProductUnit } from '../product-units/product-units.entity';

type StoredIdentifier = Partial<ProductIdentifier> & {
  productIdentifierId: number;
  tenantId: number;
  productId: number;
  normalizedIdentifierValue: string;
};

function fixture(initial: StoredIdentifier[] = []) {
  const rows = initial.map((row) => ({ identifierTypeId: 1, productUnitId: 101, isActive: true, ...row }));
  let nextId = Math.max(0, ...rows.map((row) => row.productIdentifierId)) + 1;
  const identifierRepository = {
    findOne: async ({ where }: any) => {
      const excludedId = where.productIdentifierId?._value;
      return rows.find((row) =>
        row.tenantId === where.tenantId &&
        row.normalizedIdentifierValue === where.normalizedIdentifierValue &&
        row.productIdentifierId !== excludedId,
      ) ?? null;
    },
    findOneBy: async ({ productIdentifierId, tenantId }: any) =>
      rows.find((row) => row.productIdentifierId === productIdentifierId && row.tenantId === tenantId) ?? null,
    create: (value: any) => value,
    save: async (value: any) => {
      if (value.productIdentifierId) {
        const index = rows.findIndex((row) => row.productIdentifierId === value.productIdentifierId);
        rows[index] = { ...rows[index], ...value };
        return rows[index];
      }
      const saved = { ...value, productIdentifierId: nextId++ };
      rows.push(saved);
      return saved;
    },
  };
  const productRepository = {
    findOneBy: async ({ productId, tenantId }: any) =>
      [1, 2].includes(productId) && [10, 20].includes(tenantId) ? { productId, tenantId } : null,
  };
  const typeRepository = { findOneBy: async ({ identifierTypeId }: any) => identifierTypeId === 1 ? { identifierTypeId, code: 'BARCODE', isActive: true } : null };
  const productUnitRepository = { findOne: async ({ where }: any) => where.productUnitId === (where.productId === 1 ? 101 : 102) ? { productUnitId: where.productUnitId, productId: where.productId, isActive: true, isBaseUnit: true, isSalesUnit: true } : where.productUnitId === 201 && where.productId === 1 ? { productUnitId: 201, productId: 1, isActive: true, isBaseUnit: false, isSalesUnit: false } : null };
  const manager = {
    getRepository: (entity: any) => entity === ProductIdentifier
      ? identifierRepository
      : entity === Product
        ? productRepository
        : entity === IdentifierType
          ? typeRepository
          : entity === ProductUnit
            ? productUnitRepository
          : undefined,
  };
  const dataSource = { transaction: async (work: any) => work(manager) };
  return { service: new ProductIdentifierService(identifierRepository as any, dataSource as any), rows };
}

test('blocks the same normalized barcode on two products in one tenant', async () => {
  const { service } = fixture([{ productIdentifierId: 1, tenantId: 10, productId: 1, normalizedIdentifierValue: '12345678', identifierValue: '12345678' }]);
  await assert.rejects(
    () => service.create({ productId: 2, identifierTypeId: 1, productUnitId: 102, identifierValue: ' 12345678 ' }, 10),
    (error: any) => error instanceof BadRequestException && error.message === 'Identifier already belongs to another product in this tenant.',
  );
});

test('allows an unchanged identifier row during product update', async () => {
  const { service } = fixture([{ productIdentifierId: 1, tenantId: 10, productId: 1, normalizedIdentifierValue: 'ABC123', identifierValue: 'ABC123' }]);
  const updated = await service.update(1, { identifierValue: ' abc123 ' }, 10);
  assert.equal(updated.normalizedIdentifierValue, 'ABC123');
  assert.equal(updated.identifierValue, 'abc123');
});

test('allows different identifiers on the same product', async () => {
  const { service, rows } = fixture([{ productIdentifierId: 1, tenantId: 10, productId: 1, normalizedIdentifierValue: 'ABC123', identifierValue: 'ABC123' }]);
  await service.create({ productId: 1, identifierTypeId: 1, productUnitId: 101, identifierValue: 'XYZ789' }, 10);
  assert.deepEqual(rows.map((row) => row.normalizedIdentifierValue), ['ABC123', 'XYZ789']);
});

test('allows the same barcode in different tenants', async () => {
  const { service, rows } = fixture([{ productIdentifierId: 1, tenantId: 10, productId: 1, normalizedIdentifierValue: 'SHARED', identifierValue: 'SHARED' }]);
  await service.create({ productId: 2, identifierTypeId: 1, productUnitId: 102, identifierValue: ' shared ' }, 20);
  assert.equal(rows.filter((row) => row.normalizedIdentifierValue === 'SHARED').length, 2);
});

test('rejects a POS identifier linked to a non-base or different product unit', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.create({ productId: 1, identifierTypeId: 1, productUnitId: 201, identifierValue: 'CASE-CODE' }, 10),
    (error: any) => error instanceof BadRequestException && /only use the active base Product Unit/.test(error.message),
  );
  await assert.rejects(
    () => service.create({ productId: 1, identifierTypeId: 1, productUnitId: 102, identifierValue: 'OTHER-PRODUCT' }, 10),
    (error: any) => error instanceof BadRequestException && /belong to this product and tenant/.test(error.message),
  );
});

test('identifier reads cannot cross tenant scope', async () => {
  const { service } = fixture([{ productIdentifierId: 1, tenantId: 10, productId: 1, normalizedIdentifierValue: 'TENANT10', identifierValue: 'Tenant10' }]);
  await assert.rejects(() => service.findOne(1, 20), /ProductIdentifier not found/);
});
