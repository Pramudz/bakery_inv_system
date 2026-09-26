import assert from 'node:assert/strict';
import test from 'node:test';
import { BrandService } from './brands.service';

function brandPageFixture(total = 45) {
  const calls: Record<string, any[]> = {};
  const builder: any = {};
  for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) {
    builder[method] = (...args: any[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    };
  }
  builder.getManyAndCount = async () => [[{
    brandId: 21,
    tenantId: 7,
    brandCode: 'BR-21',
    brandName: 'Example Brand',
    tenant: { name: 'Tenant Seven' },
  }], total];
  const repository = { createQueryBuilder: () => builder };
  return { service: new BrandService(repository as any), calls };
}

test('brand pagination combines tenant scope, trimmed search, status and page offset', async () => {
  const { service, calls } = brandPageFixture();

  const result = await service.findPage(7, 2, 20, '  example  ', 'active');

  assert.deepEqual(calls.where[0], ['brand.tenantId = :tenantId', { tenantId: 7 }]);
  assert.deepEqual(calls.andWhere[0][1], { search: '%example%' });
  assert.deepEqual(calls.andWhere[1], ['brand.isActive = :active', { active: true }]);
  assert.deepEqual(calls.orderBy[0], ['brand.brandName', 'ASC']);
  assert.deepEqual(calls.addOrderBy[0], ['brand.brandId', 'ASC']);
  assert.deepEqual(calls.skip[0], [20]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.totalPages, 3);
  assert.equal('tenantId' in result.items[0], false);
  assert.equal(result.items[0].tenant.name, 'Tenant Seven');
});

test('brand pagination normalizes invalid paging and supports inactive status', async () => {
  const { service, calls } = brandPageFixture(0);

  const result = await service.findPage(9, Number.NaN, 25, '', 'inactive');

  assert.deepEqual(calls.andWhere[0], ['brand.isActive = :active', { active: false }]);
  assert.deepEqual(calls.skip[0], [0]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
  assert.equal(result.totalPages, 1);
});
