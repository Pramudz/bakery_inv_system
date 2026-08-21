import assert from 'node:assert/strict';
import test from 'node:test';
import { CategoryService } from './categories.service';

function categoryPageFixture(total = 45) {
  const calls: Record<string, any[]> = {};
  const builder: any = {};
  for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) {
    builder[method] = (...args: any[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    };
  }
  builder.getManyAndCount = async () => [[{ categoryId: 21 }], total];
  const repository = { createQueryBuilder: () => builder };
  return { service: new CategoryService(repository as any), calls };
}

test('category pagination combines tenant scope, trimmed search, status and page offset', async () => {
  const { service, calls } = categoryPageFixture();

  const result = await service.findPage(7, 2, 20, '  Rice  ', 'active');

  assert.deepEqual(calls.where[0], ['category.tenantId = :tenantId', { tenantId: 7 }]);
  assert.deepEqual(calls.andWhere[0][1], { search: '%Rice%' });
  assert.deepEqual(calls.andWhere[1], ['category.isActive = :active', { active: true }]);
  assert.deepEqual(calls.skip[0], [20]);
  assert.deepEqual(calls.take[0], [20]);
  assert.deepEqual(result, {
    items: [{ categoryId: 21 }],
    page: 2,
    limit: 20,
    total: 45,
    totalPages: 3,
  });
});

test('category pagination normalizes invalid paging values and supports inactive status', async () => {
  const { service, calls } = categoryPageFixture(0);

  const result = await service.findPage(9, Number.NaN, 25, '', 'inactive');

  assert.deepEqual(calls.andWhere[0], ['category.isActive = :active', { active: false }]);
  assert.deepEqual(calls.skip[0], [0]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
  assert.equal(result.totalPages, 1);
});
