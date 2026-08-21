import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateMyTenantDto } from './dto/update-my-tenant.dto';
import { TenantSelfController } from './tenant-self.controller';

const tenant = { tenantId: 7, code: 'BAKE', name: 'Bake House', isActive: true, locations: [] };

test('tenant update allows the current tenant to keep its code', async () => {
  const calls: any[] = [];
  const results = [tenant, null, { ...tenant, name: 'Bake House Ltd' }];
  const repository = {
    findOne: async (options: any) => { calls.push(options); return results.shift(); },
    update: async () => ({ affected: 1 }),
  };
  const service = new TenantsService(repository as any, {} as any, {} as any);
  const updated = await service.update(7, { code: 'BAKE', name: 'Bake House Ltd' });
  assert.equal(updated.name, 'Bake House Ltd');
  assert.equal(calls[1].where.tenantId._value, 7);
});

test('tenant update rejects another tenant code', async () => {
  const repository = {
    findOne: async (options: any) => options.where.tenantId === 7 ? tenant : { ...tenant, tenantId: 8 },
    update: async () => ({ affected: 1 }),
  };
  const service = new TenantsService(repository as any, {} as any, {} as any);
  await assert.rejects(() => service.update(7, { code: 'OTHER' }), ConflictException);
});

test('tenant create rejects a globally duplicated code before bootstrap', async () => {
  const repository = { findOneBy: async () => tenant };
  const service = new TenantsService(repository as any, {} as any, {} as any);
  await assert.rejects(() => service.create({ code: 'BAKE', name: 'Duplicate', isActive: true }), ConflictException);
});

test('blank optional tenant fields do not fail validation', async () => {
  const dto = plainToInstance(CreateTenantDto, { code: 'NEW', name: 'New Tenant', isActive: true, email: '', website: '', countryCode: '' });
  assert.deepEqual(await validate(dto), []);
});

test('My Tenant rejects tenant identifiers and tenant code changes', async () => {
  const dto = plainToInstance(UpdateMyTenantDto, { tenantId: 99, code: 'OTHER', name: 'Allowed name' });
  const errors = await validate(dto);
  assert.deepEqual(errors.map((error) => error.property).sort(), ['code', 'tenantId']);
});

test('My Tenant converts cleared optional fields to null', async () => {
  const dto = plainToInstance(UpdateMyTenantDto, { email: '', addressLine2: '' });
  assert.deepEqual(await validate(dto), []);
  assert.equal((dto as any).email, null);
  assert.equal((dto as any).addressLine2, null);
});

test('My Tenant update always uses the authenticated tenant id', async () => {
  let calledTenantId: number | undefined;
  const service = { updateMyTenant: async (tenantId: number, dto: UpdateMyTenantDto) => { calledTenantId = tenantId; return { tenantId, ...dto }; } };
  const controller = new TenantSelfController(service as any);
  await controller.update({ name: 'My company' }, { tenantId: 42 } as any);
  assert.equal(calledTenantId, 42);
});
