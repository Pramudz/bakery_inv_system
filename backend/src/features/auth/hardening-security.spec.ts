import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthGuard } from './auth-guard';
import { TenantAuthGuard } from './tenant-auth.guard';
import { PlatformGuard } from './platform.guard';
import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { UserSessionController } from '../user-sessions/user-sessions.controller';
import { UserSessionService } from '../user-sessions/user-sessions.service';
import { IdentifierTypeController, PlatformIdentifierTypesController } from '../identifier-types/identifier-types.controller';
import { IdentifierTypeService } from '../identifier-types/identifier-types.service';
import { ModuleEntityController, PlatformModulesController } from '../modules/modules.controller';
import { ModuleEntityService } from '../modules/modules.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

test('HTTP administrative routes require platform credentials; tenant catalog reads remain available', async () => {
  let platformRevoked = false;
  let tenantRevoked = false;
  const platformRepository = {
    findOne: async ({ where }: any) => where.sessionTokenHash === hash('platform-test') ? {
      platformSessionId: 1, revokedAt: platformRevoked ? new Date() : null,
      expiresAt: new Date(Date.now() + 60_000), platformUser: { platformUserId: 1, username: 'platform', isActive: true },
    } : null,
    update: async () => ({ affected: platformRevoked ? 0 : 1 }),
  };
  const tenantRepository = {
    findOne: async ({ where }: any) => where.sessionTokenHash === hash('tenant-test') ? {
      userSessionId: 2, revokedAt: tenantRevoked ? new Date() : null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { userId: 3, tenantId: 4, username: 'tenant', isActive: true, tenant: { isActive: true },
        userRoles: [{ role: { roleId: 5, code: 'TENANT_ADMIN', accessScope: 'TENANT', isActive: true } }], userLocations: [] },
    } : null,
    update: async () => ({ affected: tenantRevoked ? 0 : 1 }),
  };
  const writes: string[] = [];
  @Module({
    controllers: [AuthController, UserSessionController, IdentifierTypeController, PlatformIdentifierTypesController, ModuleEntityController, PlatformModulesController],
    providers: [AuthGuard, TenantAuthGuard, PlatformGuard,
      { provide: getRepositoryToken(PlatformSession), useValue: platformRepository },
      { provide: getRepositoryToken(UserSession), useValue: tenantRepository },
      { provide: AuthService, useValue: { logout: async (_authorization: string, scope: string) => {
        writes.push(`${scope.toLowerCase()}-logout`);
        if (scope === 'TENANT') tenantRevoked = true;
        else platformRevoked = true;
        return { revoked: true };
      } } },
      { provide: UserSessionService, useValue: { findAll: async () => [{ userSessionId: 2, tenantId: 4, revokedAt: null }],
        findOne: async () => ({ userSessionId: 2, tenantId: 4, revokedAt: null }), deactivate: async () => { writes.push('revoke'); return { revokedAt: new Date() }; } } },
      { provide: IdentifierTypeService, useValue: { findAll: async () => [{ code: 'BARCODE' }], findOne: async () => ({ code: 'BARCODE' }),
        create: async () => { writes.push('identifier'); return {}; }, update: async () => { writes.push('identifier'); return {}; }, deactivate: async () => { writes.push('identifier'); return {}; } } },
      { provide: ModuleEntityService, useValue: { findEnabledForTenant: async () => [{ code: 'SALES' }], findAll: async () => [{ code: 'SALES' }], findOne: async () => ({ code: 'SALES' }),
        create: async () => { writes.push('module'); return {}; }, update: async () => { writes.push('module'); return {}; }, deactivate: async () => { writes.push('module'); return {}; } } },
    ],
  })
  class SecurityTestModule {}
  const app = await NestFactory.create(SecurityTestModule, { logger: ['error'], abortOnError: false });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const call = (path: string, method = 'GET', token?: string) => fetch(`${base}${path}`, {
      method, headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
      ...(method === 'POST' || method === 'PUT' ? { body: JSON.stringify({ code: 'TEST', name: 'Test' }) } : {}),
    });
    for (const path of ['/user-sessions', '/platform/modules', '/platform/identifier-types']) {
      assert.equal((await call(path)).status, 401);
      assert.equal((await call(path, 'POST')).status, path === '/user-sessions' ? 404 : 401);
      assert.equal((await call(path, 'POST', 'tenant-test')).status, path === '/user-sessions' ? 404 : 401);
    }
    assert.equal((await call('/user-sessions/2/deactivate', 'PATCH')).status, 401);
    assert.equal((await call('/user-sessions/2/deactivate', 'PATCH', 'tenant-test')).status, 401);
    assert.equal((await call('/identifier-types', 'GET', 'tenant-test')).status, 200);
    assert.equal((await call('/modules', 'GET', 'tenant-test')).status, 200);
    assert.equal((await call('/identifier-types', 'POST', 'tenant-test')).status, 404);
    assert.equal((await call('/modules', 'POST', 'tenant-test')).status, 404);
    assert.equal((await call('/user-sessions', 'GET', 'platform-test')).status, 200);
    assert.equal((await call('/platform/identifier-types', 'POST', 'platform-test')).status, 201);
    assert.equal((await call('/platform/modules', 'POST', 'platform-test')).status, 201);
    assert.equal((await call('/user-sessions/2/deactivate', 'PATCH', 'platform-test')).status, 200);
    assert.deepEqual(writes, ['identifier', 'module', 'revoke']);
    assert.equal((await call('/auth/logout', 'POST', 'tenant-test')).status, 401);
    assert.equal((await call('/auth/tenant-logout', 'POST', 'platform-test')).status, 401);
    assert.equal((await call('/auth/tenant-logout', 'POST', 'tenant-test')).status, 201);
    assert.equal((await call('/auth/logout', 'POST', 'platform-test')).status, 201);
    assert.deepEqual(writes.slice(-2), ['tenant-logout', 'platform-logout']);
    assert.equal((await call('/identifier-types', 'GET', 'tenant-test')).status, 401);
    assert.equal((await call('/user-sessions', 'GET', 'platform-test')).status, 401);
  } finally {
    await app.close();
  }
});

test('logout revokes only the authenticated token hash in the selected session store', async () => {
  const calls: Array<{ scope: string; criteria: any; values: any }> = [];
  const service = Object.create(AuthService.prototype) as AuthService;
  (service as any).platformSessionRepository = { update: async (criteria: any, values: any) => calls.push({ scope: 'PLATFORM', criteria, values }) };
  (service as any).userSessionRepository = { update: async (criteria: any, values: any) => calls.push({ scope: 'TENANT', criteria, values }) };
  await service.logout('Bearer one', 'TENANT');
  await service.logout('Bearer two', 'PLATFORM');
  assert.deepEqual(calls.map((call) => call.scope), ['TENANT', 'PLATFORM']);
  assert.equal(calls[0].criteria.sessionTokenHash, hash('one'));
  assert.equal(calls[1].criteria.sessionTokenHash, hash('two'));
  assert.ok(calls.every((call) => call.values.revokedAt instanceof Date));
  assert.ok(calls.every((call) => call.criteria.revokedAt instanceof Object));
  await assert.rejects(service.logout(undefined, 'TENANT'), /token is required/i);
});

test('conditional activity update never writes a revoked session back to active state', async () => {
  const stale = { platformSessionId: 1, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), platformUser: { platformUserId: 1, username: 'platform', isActive: true } };
  let saved = false;
  const guard = new AuthGuard({ findOne: async () => stale, save: async () => { saved = true; }, update: async () => ({ affected: 0 }) } as any);
  const context = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer platform-test' } }) }) } as any;
  await assert.rejects(guard.canActivate(context), /revoked/i);
  assert.equal(saved, false);
});
