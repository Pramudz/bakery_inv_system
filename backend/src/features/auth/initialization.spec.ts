import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthorizationCatalogService } from './authorization-catalog.service';
import { ModuleEntity } from '../modules/modules.entity';
import { Permission } from '../permissions/permissions.entity';
import { Tenant } from '../tenants/tenant.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { PlatformUsersController } from '../platform-users/platform-users.controller';

test('production HTTP bootstrap routes reject requests before service calls', async () => {
  const before = { NODE_ENV: process.env.NODE_ENV, ENABLE_HTTP_BOOTSTRAP: process.env.ENABLE_HTTP_BOOTSTRAP };
  let calls = 0;
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_HTTP_BOOTSTRAP = 'true';
  try {
    const auth = new AuthController({ bootstrap: async () => { calls++; } } as any);
    const users = new PlatformUsersController({ bootstrap: async () => { calls++; } } as any);
    await assert.rejects(auth.bootstrap({ username: 'root', password: 'AnyPassword1!' }), ForbiddenException);
    await assert.rejects(users.bootstrap({ username: 'root', password: 'AnyPassword1!' }), ForbiddenException);
    assert.equal(calls, 0);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('platform login needs no tenant records and creates a hashed session token', async () => {
  const hash = await bcrypt.hash('StrongPlatform9!', 4);
  let tokenHash = '';
  const service = new AuthService(
    { findOne: async () => ({ platformUserId: 1, username: 'Platform', passwordHash: hash, isActive: true }) } as any,
    { create: (row: any) => row, save: async (row: any) => { tokenHash = row.sessionTokenHash; return row; } } as any,
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  const result = await service.login({ username: 'Platform', password: 'StrongPlatform9!' });
  assert.equal(result.scope, 'PLATFORM');
  assert.ok(result.accessToken);
  assert.notEqual(tokenHash, result.accessToken);
});

test('platform bootstrap refuses to create a second administrator', async () => {
  let creates = 0;
  const service = new AuthService(
    { count: async () => 1 } as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any,
    { create: async () => { creates++; } } as any,
  );
  await assert.rejects(() => service.bootstrap({ username: 'Another', password: 'StrongPlatform9!' }), ConflictException);
  assert.equal(creates, 0);
});

test('authorization catalog initializes without tenants and is idempotent', async () => {
  const modules = new Map<string, any>();
  const permissions = new Map<string, any>();
  const moduleRepo = {
    findOneBy: async ({ code }: any) => modules.get(code) ?? null,
    create: (row: any) => row,
    save: async (row: any) => { const saved = { ...row, moduleId: modules.size + 1 }; modules.set(row.code, saved); return saved; },
  };
  const permissionRepo = {
    findOneBy: async ({ code }: any) => permissions.get(code) ?? null,
    create: (row: any) => row,
    save: async (row: any) => { const saved = { ...row, permissionId: permissions.size + 1 }; permissions.set(row.code, saved); return saved; },
  };
  const dataSource = { getRepository: (entity: unknown) => {
    if (entity === ModuleEntity) return moduleRepo;
    if (entity === Permission) return permissionRepo;
    if (entity === Tenant) return { find: async () => [] };
    if (entity === TenantModule) return { findOneBy: async () => null, create: (row: any) => row, save: async (row: any) => row };
    throw new Error('Unexpected repository');
  } };
  const catalog = new AuthorizationCatalogService(dataSource as any);
  await catalog.onModuleInit();
  assert.equal(modules.size, 10);
  for (const code of ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'ROLE_VIEW', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DEACTIVATE', 'PERMISSION_VIEW', 'ROLE_PERMISSION_VIEW', 'ROLE_PERMISSION_UPDATE']) {
    assert.equal(permissions.get(code)?.moduleId, modules.get('USER_MANAGEMENT').moduleId);
  }
  const count = permissions.size;
  await catalog.onModuleInit();
  assert.equal(permissions.size, count);
  assert.equal(modules.size, 10);
});
