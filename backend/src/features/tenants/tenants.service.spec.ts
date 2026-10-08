import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateMyTenantDto } from './dto/update-my-tenant.dto';
import { TenantSelfController } from './tenant-self.controller';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import * as bcrypt from 'bcrypt';
import { Tenant } from './tenant.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { UserRole } from '../user-roles/user-roles.entity';
import { ModuleEntity } from '../modules/modules.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { InventoryAdjustmentReason } from '../inventory-adjustments/inventory-adjustment-reason.entity';

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
  await assert.rejects(() => service.create({ code: 'BAKE', name: 'Duplicate', isActive: true, timeZone: 'Asia/Colombo', initialAdminPassword: 'TestBootstrap9!' }), ConflictException);
});

test('blank optional tenant fields do not fail validation', async () => {
  const dto = plainToInstance(CreateTenantDto, { code: 'NEW', name: 'New Tenant', isActive: true, email: '', website: '', countryCode: '', timeZone: 'Asia/Colombo', initialAdminPassword: 'TestBootstrap9!' });
  assert.deepEqual(await validate(dto), []);
});

test('platform tenant creation accepts a valid IANA timezone and rejects invalid values', async () => {
  const valid = plainToInstance(CreateTenantDto, { code: 'NEW', name: 'New Tenant', isActive: true, timeZone: 'America/New_York', initialAdminPassword: 'TestBootstrap9!' });
  const invalid = plainToInstance(CreateTenantDto, { code: 'NEW', name: 'New Tenant', isActive: true, timeZone: 'UTC+05:30', initialAdminPassword: 'TestBootstrap9!' });
  assert.deepEqual(await validate(valid), []);
  assert.ok((await validate(invalid)).some((error) => error.property === 'timeZone'));
});

test('tenant creation requires strong password and explicit timezone', async () => {
  const base = { code: 'NEW', name: 'New Tenant', isActive: true };
  for (const dto of [base, { ...base, timeZone: 'Asia/Colombo' }, { ...base, timeZone: 'UTC+05:30', initialAdminPassword: 'StrongPassword9!' }, { ...base, timeZone: 'Asia/Colombo', initialAdminPassword: 'weakpassword' }]) {
    const errors = await validate(plainToInstance(CreateTenantDto, dto));
    assert.ok(errors.some((error) => ['timeZone', 'initialAdminPassword'].includes(error.property)));
  }
  const service = new TenantsService({ findOneBy: async () => null } as any, {} as any, {} as any);
  await assert.rejects(() => service.create({ ...base, timeZone: 'Asia/Colombo', initialAdminPassword: 'weakpassword' }), BadRequestException);
});

test('tenant creation hashes administrator password and saves all bootstrap records atomically', async () => {
  const saved: Array<{ entity: unknown; row: any }> = [];
  const ids = new Map<unknown, number>();
  let transactionCompleted = false;
  const repo = (entity: unknown) => ({
    findOneBy: async () => null,
    create: (row: any) => row,
    save: async (row: any) => {
      const next = (ids.get(entity) ?? 0) + 1; ids.set(entity, next);
      const idField = entity === Tenant ? 'tenantId' : entity === User ? 'userId' : entity === Role ? 'roleId' : entity === ModuleEntity ? 'moduleId' : 'id';
      const result = { ...row, [idField]: next };
      saved.push({ entity, row: result });
      return result;
    },
  });
  const manager = { getRepository: repo };
  const dataSource = { transaction: async (work: (manager: any) => Promise<any>) => { const result = await work(manager); transactionCompleted = true; return result; } };
  const service = new TenantsService({ findOneBy: async () => null } as any, dataSource as any, {} as any);
  const result = await service.create({ code: 'TIFOAM', name: 'Tifoam', isActive: true, timeZone: 'America/New_York', initialAdminPassword: 'StrongPassword9!' });
  assert.equal(transactionCompleted, true);
  assert.equal(result.tenant.timeZone, 'America/New_York');
  assert.equal((result.tenant as any).initialAdminPassword, undefined);
  assert.equal(JSON.stringify(result).includes('StrongPassword9!'), false);
  assert.equal(saved.filter((entry) => entry.entity === TenantModule).length, 9);
  assert.equal(saved.filter((entry) => entry.entity === InventoryAdjustmentReason).length, 9);
  assert.equal(saved.filter((entry) => entry.entity === UserRole).length, 1);
  const user = saved.find((entry) => entry.entity === User)?.row;
  assert.equal(await bcrypt.compare('StrongPassword9!', user.passwordHash), true);
  assert.notEqual(user.passwordHash, 'StrongPassword9!');
});

test('tenant bootstrap failure propagates and does not complete the transaction', async () => {
  let completed = false;
  const repo = (entity: unknown) => ({ findOneBy: async () => null, create: (row: any) => row, save: async (row: any) => {
    if (entity === Role) throw new Error('role insert failed');
    return { ...row, tenantId: 1, moduleId: 1 };
  } });
  const dataSource = { transaction: async (work: (manager: any) => Promise<any>) => { const result = await work({ getRepository: repo }); completed = true; return result; } };
  const service = new TenantsService({ findOneBy: async () => null } as any, dataSource as any, {} as any);
  await assert.rejects(() => service.create({ code: 'TIFOAM', name: 'Tifoam', isActive: true, timeZone: 'Asia/Colombo', initialAdminPassword: 'StrongPassword9!' }), /role insert failed/);
  assert.equal(completed, false);
});

test('normal platform and My Tenant updates reject timezone changes', async () => {
  const platform = plainToInstance(UpdateTenantDto, { timeZone: 'America/New_York' });
  const self = plainToInstance(UpdateMyTenantDto, { timeZone: 'America/New_York' });
  assert.ok((await validate(platform)).some((error) => error.property === 'timeZone'));
  assert.ok((await validate(self)).some((error) => error.property === 'timeZone'));
});

test('tenant service blocks timezone changes even when called without the HTTP validation pipe', async () => {
  const service = new TenantsService({} as any, {} as any, {} as any);
  await assert.rejects(() => service.update(7, { timeZone: 'America/New_York' } as any), BadRequestException);
  await assert.rejects(() => service.updateMyTenant(7, { timeZone: 'America/New_York' } as any), BadRequestException);
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
