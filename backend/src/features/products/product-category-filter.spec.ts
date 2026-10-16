import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './products.service';

test('product category filtering preserves tenant, search and status restrictions', async () => {
  const conditions: Array<[string, unknown]> = [];
  const query: any = {
    leftJoinAndSelect: () => query,
    where: (sql: string, params: unknown) => { conditions.push([sql, params]); return query; },
    andWhere: (sql: string, params: unknown) => { conditions.push([sql, params]); return query; },
    orderBy: () => query, skip: () => query, take: () => query,
    getManyAndCount: async () => [[], 0],
  };
  const service = new ProductService({ createQueryBuilder: () => query } as any, {} as any, {} as any, {} as any);
  await service.findPage(7, 1, 100, 'cake', 'active', 3);
  assert.deepEqual(conditions[0], ['product.tenantId = :tenantId', { tenantId: 7 }]);
  assert.ok(conditions.some(([sql, params]) => sql === 'product.categoryId = :categoryId' && (params as any).categoryId === 3));
  assert.ok(conditions.some(([sql]) => sql.includes('identifier.tenant_id = product.tenant_id')));
  assert.ok(conditions.some(([sql, params]) => sql === 'product.isActive = :active' && (params as any).active === true));
  conditions.length = 0;
  await service.findPage(7, 1, 20, '', '');
  assert.equal(conditions.length, 1);
  for (const invalid of [0, -1, NaN, 1.5]) {
    await assert.rejects(service.findPage(7, 1, 20, '', '', invalid), BadRequestException);
  }
});
