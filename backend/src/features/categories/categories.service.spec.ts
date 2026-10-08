import assert from 'node:assert/strict';
import test from 'node:test';
import { CategoryService, validateCategoryPlacement } from './categories.service';

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

test('category hierarchy allows three levels and rejects a fourth', () => {
  const rows = [
    { categoryId: 1, parentCategoryId: null },
    { categoryId: 2, parentCategoryId: 1 },
    { categoryId: 3, parentCategoryId: 2 },
  ];
  assert.doesNotThrow(() => validateCategoryPlacement(rows, null, null));
  assert.doesNotThrow(() => validateCategoryPlacement(rows, null, 1));
  assert.doesNotThrow(() => validateCategoryPlacement(rows, null, 2));
  assert.throws(() => validateCategoryPlacement(rows, null, 3), /maximum of 3 levels/);
});

test('category moves check the whole subtree and prevent cycles', () => {
  const rows = [
    { categoryId: 1, parentCategoryId: null },
    { categoryId: 2, parentCategoryId: 1 },
    { categoryId: 3, parentCategoryId: 2 },
    { categoryId: 4, parentCategoryId: null },
  ];
  assert.throws(() => validateCategoryPlacement(rows, 1, 4), /maximum of 3 levels/);
  assert.throws(() => validateCategoryPlacement(rows, 1, 1), /own descendant/);
  assert.throws(() => validateCategoryPlacement(rows, 1, 3), /own descendant/);
  assert.doesNotThrow(() => validateCategoryPlacement(rows, 2, 4));
});

test('category create and update endpoints apply the depth rule', async () => {
  const rows = [
    { categoryId: 1, tenantId: 7, parentCategoryId: null },
    { categoryId: 2, tenantId: 7, parentCategoryId: 1 },
    { categoryId: 3, tenantId: 7, parentCategoryId: 2 },
    { categoryId: 4, tenantId: 7, parentCategoryId: null },
  ];
  const repo = {
    find: async () => rows,
    findOne: async ({ where }: any) => where.categoryId ? rows.find(row => row.categoryId === where.categoryId) ?? null : null,
    create: (value: any) => value,
    save: async (value: any) => value,
    update: async () => undefined,
  };
  const service = new CategoryService(repo as any);
  await assert.rejects(service.create({ parentCategoryId: 3, categoryCode: 'L4', categoryName: 'Level 4' }, 7), /maximum of 3 levels/);
  await assert.doesNotReject(service.create({ parentCategoryId: 2, categoryCode: 'L3', categoryName: 'Level 3' }, 7));
  await assert.rejects(service.update(1, { parentCategoryId: 4 }, 7), /maximum of 3 levels/);
  await assert.rejects(service.update(1, { parentCategoryId: 3 }, 7), /own descendant/);
});
