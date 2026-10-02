import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomerService } from './customers.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCustomerDto } from './dto/create-customers.dto';
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
    customerId: 21,
    tenantId: 7,
    customerCode: 'SUP-000021',
    customerName: 'Example Customer',
  }], total];
  const repository = { createQueryBuilder: () => builder };
  const service = new CustomerService(repository as any);
  return { service, calls };
}

test('customer pagination combines tenant scope, trimmed search, status and page offset', async () => {
  const { service, calls } = pageFixture();

  const result = await service.findPage(7, 2, 20, '  example  ', 'active');

  assert.deepEqual(calls.where[0], ['customer.tenantId = :tenantId', { tenantId: 7 }]);
  assert.deepEqual(calls.andWhere[0][1], { search: '%example%' });
  assert.deepEqual(calls.andWhere[1], ['customer.isActive = :active', { active: true }]);
  assert.deepEqual(calls.orderBy[0], ['customer.customerName', 'ASC']);
  assert.deepEqual(calls.addOrderBy[0], ['customer.customerId', 'ASC']);
  assert.deepEqual(calls.skip[0], [20]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.totalPages, 3);
  assert.equal('tenantId' in result.items[0], false);
});

test('customer pagination normalizes invalid paging and supports inactive status', async () => {
  const { service, calls } = pageFixture(0);

  const result = await service.findPage(9, Number.NaN, 25, '', 'inactive');

  assert.deepEqual(calls.andWhere[0], ['customer.isActive = :active', { active: false }]);
  assert.deepEqual(calls.skip[0], [0]);
  assert.deepEqual(calls.take[0], [20]);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
  assert.equal(result.totalPages, 1);
});

test('customer optional blank email and contact fields validate with active status', () => {
  const dto = plainToInstance(CreateCustomerDto, { customerCode: 'CUS-1', customerName: 'Customer', email: '', mobile: '0771234567', districtOrState: 'Colombo', isActive: false });
  assert.equal(validateSync(dto).length, 0);
  assert.equal(dto.email, null);
  assert.equal(dto.isActive, false);
});
