import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupplierDto } from './dto/create-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-suppliers.dto';
import { Supplier } from './suppliers.entity';
import { SupplierService } from './suppliers.service';

function fixture(options: { duplicate?: boolean; failSave?: boolean } = {}) {
  let savedSupplier: any; let sequenceCalls = 0; let rolledBack = false;
  const supplierRepository = {
    findOneBy: async ({ tenantId, supplierCode }: any) => options.duplicate && tenantId === 3 && supplierCode === 'MANUAL' ? { supplierId: 99 } : null,
    create: (value: any) => value,
    save: async (value: any) => { if (options.failSave) throw new Error('supplier failed'); savedSupplier = { ...value, supplierId: 10 }; return savedSupplier; },
  };
  const manager = { getRepository: (entity: any) => entity === Supplier ? supplierRepository : undefined };
  const dataSource = { transaction: async (work: any) => { try { return await work(manager); } catch (error) { rolledBack = true; throw error; } } };
  const outerRepository = { findOneBy: async () => savedSupplier };
  const sequences = { getTenantNextNumber: async (receivedManager: any, tenantId: number, key: string) => { assert.equal(receivedManager, manager); assert.equal(tenantId, 3); assert.equal(key, 'SUPPLIER'); sequenceCalls += 1; return sequenceCalls; } };
  return { service: new SupplierService(outerRepository as any, dataSource as any, sequences as any), state: { get savedSupplier() { return savedSupplier; }, get sequenceCalls() { return sequenceCalls; }, get rolledBack() { return rolledBack; } } };
}

test('generates supplier code and saves direct optional contact/address fields', async () => {
  const { service, state } = fixture();
  const result = await service.create({ supplierName: ' Flour Mill ', contactName: ' Jane ', mobile: ' 123 ', addressLine1: ' 1 Main St ', districtOrState: ' Western ' }, 3);
  assert.equal(result.supplierCode, 'SUP-000001');
  assert.equal(state.savedSupplier.tenantId, 3);
  assert.equal(result.contactName, 'Jane');
  assert.equal(result.addressLine1, '1 Main St');
});

test('manual supplier code is normalized and does not consume a sequence', async () => {
  const { service, state } = fixture();
  const result = await service.create({ supplierCode: ' custom-7 ', supplierName: 'Manual' }, 3);
  assert.equal(result.supplierCode, 'CUSTOM-7');
  assert.equal(state.sequenceCalls, 0);
});

test('manual supplier code uniqueness is scoped to the authenticated tenant', async () => {
  const duplicate = fixture({ duplicate: true });
  await assert.rejects(() => duplicate.service.create({ supplierCode: 'manual', supplierName: 'Duplicate' }, 3), ConflictException);
  const anotherTenant = fixture({ duplicate: true });
  await anotherTenant.service.create({ supplierCode: 'manual', supplierName: 'Allowed elsewhere' }, 4);
  assert.equal(anotherTenant.state.savedSupplier.tenantId, 4);
});

test('supplier save failure rolls back generated sequence transaction', async () => {
  const { service, state } = fixture({ failSave: true });
  await assert.rejects(() => service.create({ supplierName: 'Rollback' }, 3), /supplier failed/);
  assert.equal(state.sequenceCalls, 1);
  assert.equal(state.rolledBack, true);
});

test('supplier may be created without optional contact or address values', async () => {
  const { service } = fixture();
  const supplier = await service.create({ supplierName: 'No optional details' }, 3);
  assert.equal(supplier.contactName, undefined);
  assert.equal(supplier.addressLine1, undefined);
});

test('supplier DTO rejects tenantId and update DTO rejects supplierCode', async () => {
  const createErrors = await validate(plainToInstance(CreateSupplierDto, { tenantId: 9, supplierName: 'Invalid' }));
  const updateErrors = await validate(plainToInstance(UpdateSupplierDto, { supplierCode: 'CHANGE' }));
  assert.equal(createErrors.some((error) => error.property === 'tenantId'), true);
  assert.equal(updateErrors.some((error) => error.property === 'supplierCode'), true);
});

function pageFixture(total = 45) {
  const calls: Record<string, any[]> = {};
  const builder: any = {};
  for (const method of ['where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) {
    builder[method] = (...args: any[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    };
  }
  builder.getManyAndCount = async () => [[{
    supplierId: 21,
    tenantId: 7,
    supplierCode: 'SUP-000021',
    supplierName: 'Example Supplier',
  }], total];
  const repository = { createQueryBuilder: () => builder };
  const service = new SupplierService(repository as any, {} as any, {} as any);
  return { service, calls };
}

test('supplier pagination combines tenant scope, trimmed search, status and page offset', async () => {
  const { service, calls } = pageFixture();

  const result = await service.findPage(7, 2, 20, '  example  ', 'active');

  assert.deepEqual(calls.where[0], ['supplier.tenantId = :tenantId', { tenantId: 7 }]);
  assert.deepEqual(calls.andWhere[0][1], { search: '%example%' });
  assert.deepEqual(calls.andWhere[1], ['supplier.isActive = :active', { active: true }]);
  assert.deepEqual(calls.orderBy[0], ['supplier.supplierName', 'ASC']);
  assert.deepEqual(calls.addOrderBy[0], ['supplier.supplierId', 'ASC']);
  assert.deepEqual(calls.skip[0], [20]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.totalPages, 3);
  assert.equal('tenantId' in result.items[0], false);
});

test('supplier pagination normalizes invalid paging and supports inactive status', async () => {
  const { service, calls } = pageFixture(0);

  const result = await service.findPage(9, Number.NaN, 25, '', 'inactive');

  assert.deepEqual(calls.andWhere[0], ['supplier.isActive = :active', { active: false }]);
  assert.deepEqual(calls.skip[0], [0]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
  assert.equal(result.totalPages, 1);
});
