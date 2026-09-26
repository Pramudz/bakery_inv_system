import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationService } from './locations.service';
import { LocationType } from './locations.entity';

test('multiple locations are created under the authenticated tenant only', async () => {
  const saved: any[] = [];
  const repository = {
    findOne: async () => null,
    create: (value: any) => value,
    save: async (value: any) => { const row = { ...value, locationId: saved.length + 1 }; saved.push(row); return row; },
  };
  const service = new LocationService(repository as any);
  await service.create({ code: 'HO', name: 'Head Office', locationType: LocationType.HEAD_OFFICE, isActive: true }, 12);
  await service.create({ code: 'WH', name: 'Warehouse', locationType: LocationType.WAREHOUSE, isActive: true }, 12);
  assert.deepEqual(saved.map((row) => [row.tenantId, row.code]), [[12, 'HO'], [12, 'WH']]);
});

test('location reads remain tenant scoped', async () => {
  let where: any;
  const repository = { findOne: async (options: any) => { where = options.where; return { locationId: 4, tenantId: 9 }; } };
  const service = new LocationService(repository as any);
  await service.findOne(4, 9);
  assert.deepEqual(where, { locationId: 4, tenantId: 9 });
});

function locationPageFixture(total = 42) {
  const calls: Record<string, any[]> = {};
  const builder: any = {};
  for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) {
    builder[method] = (...args: any[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    };
  }
  builder.getManyAndCount = async () => [[{
    locationId: 21,
    tenantId: 7,
    code: 'WH',
    name: 'Warehouse',
    tenant: { name: 'Tenant Seven' },
  }], total];
  const repository = { createQueryBuilder: () => builder };
  return { service: new LocationService(repository as any), calls };
}

test('location pagination combines tenant scope, trimmed search, status and page offset', async () => {
  const { service, calls } = locationPageFixture();

  const result = await service.findPage(7, 2, 20, '  warehouse  ', 'active');

  assert.deepEqual(calls.where[0], ['location.tenantId = :tenantId', { tenantId: 7 }]);
  assert.deepEqual(calls.andWhere[0][1], { search: '%warehouse%' });
  assert.deepEqual(calls.andWhere[1], ['location.isActive = :active', { active: true }]);
  assert.deepEqual(calls.skip[0], [20]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 3);
  assert.equal('tenantId' in result.items[0], false);
  assert.equal(result.items[0].tenant.name, 'Tenant Seven');
});

test('location pagination normalizes invalid paging and supports inactive status', async () => {
  const { service, calls } = locationPageFixture(0);

  const result = await service.findPage(9, Number.NaN, 25, '', 'inactive');

  assert.deepEqual(calls.andWhere[0], ['location.isActive = :active', { active: false }]);
  assert.deepEqual(calls.skip[0], [0]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
  assert.equal(result.totalPages, 1);
});
