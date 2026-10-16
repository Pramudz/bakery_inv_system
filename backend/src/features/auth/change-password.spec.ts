import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as bcrypt from 'bcrypt';
import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth-guard';
import { TenantAuthGuard } from './tenant-auth.guard';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from '../users/user.entity';
import { PlatformUser } from '../platform-users/platform-users.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import type { AuthPrincipal } from './auth.types';

const oldPassword = 'PreviousPass123!';
const newPassword = 'UpdatedPass456!';
const dto = { currentPassword: oldPassword, newPassword, confirmPassword: newPassword };
const platform: AuthPrincipal = { scope: 'PLATFORM', platformUserId: 1, username: 'admin' };
const tenant: AuthPrincipal = { scope: 'TENANT', userId: 2, tenantId: 3, username: 'cashier', roleId: 4, roleCode: 'CASHIER', accessScope: 'TENANT', assignedLocationIds: [] };

async function fixture(principal: AuthPrincipal) {
  let passwordHash = await bcrypt.hash(oldPassword, 4);
  const sessions = [{ scope: 'PLATFORM', id: 1, revokedAt: null as Date | null }, { scope: 'TENANT', id: 2, revokedAt: null as Date | null }, { scope: 'TENANT', id: 99, revokedAt: null as Date | null }];
  let failRevocation = false;
  const reads: any[] = [];
  const manager: any = {
    getRepository(entity: any) {
      if (entity === User || entity === PlatformUser) return {
        findOne: async (options: any) => { reads.push(options); return { passwordHash, isActive: true }; },
        update: async (_where: any, values: any) => { passwordHash = values.passwordHash; return { affected: 1 }; },
      };
      if (entity === UserSession || entity === PlatformSession) return {
        update: async (where: any, values: any) => {
          if (failRevocation) throw new Error('Database unavailable');
          const scope = entity === UserSession ? 'TENANT' : 'PLATFORM';
          const id = where.userId ?? where.platformUserId;
          sessions.filter(session => session.scope === scope && session.id === id && !session.revokedAt).forEach(session => { session.revokedAt = values.revokedAt; });
          return { affected: 1 };
        },
      };
      throw new Error('Unexpected entity');
    },
    transaction: async (work: any) => {
      const previous = passwordHash;
      try { return await work(manager); } catch (error) { passwordHash = previous; throw error; }
    },
  };
  const service = new AuthService({ manager } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, sessions, reads, hash: () => passwordHash, fail: () => { failRevocation = true; } };
}

for (const principal of [platform, tenant]) {
  test(`${principal.scope} changes only their password and revokes only their own sessions`, async () => {
    const f = await fixture(principal);
    await f.service.changePassword(principal, dto);
    assert.equal(await bcrypt.compare(newPassword, f.hash()), true);
    assert.equal(await bcrypt.compare(oldPassword, f.hash()), false);
    const id = principal.scope === 'PLATFORM' ? principal.platformUserId : principal.userId;
    for (const session of f.sessions) assert.equal(Boolean(session.revokedAt), session.scope === principal.scope && session.id === id);
    assert.deepEqual(f.reads[0].where, principal.scope === 'PLATFORM' ? { platformUserId: 1 } : { userId: 2, tenantId: 3 });
    assert.equal(f.reads[0].lock.mode, 'pessimistic_write');
  });
}

test('wrong current password, mismatched confirmation, reuse and weak/overlong passwords do not change credentials', async () => {
  const f = await fixture(tenant);
  const initial = f.hash();
  for (const invalid of [
    { ...dto, currentPassword: 'WrongPassword!' },
    { ...dto, confirmPassword: 'DifferentPass789!' },
    { ...dto, newPassword: oldPassword, confirmPassword: oldPassword },
    { ...dto, newPassword: 'short' },
    { ...dto, newPassword: 'lowercaseonlypassword' },
    { ...dto, newPassword: 'Aa1!' + 'é'.repeat(40) },
  ]) await assert.rejects(f.service.changePassword(tenant, invalid), BadRequestException);
  assert.equal(f.hash(), initial);
  assert.ok(f.sessions.every(session => !session.revokedAt));
});

test('password update rolls back if session revocation fails', async () => {
  const f = await fixture(platform);
  const initial = f.hash();
  f.fail();
  await assert.rejects(f.service.changePassword(platform, dto), /Database unavailable/);
  assert.equal(f.hash(), initial);
});

test('change password DTO rejects empty, weak and non-string values', async () => {
  assert.equal((await validate(plainToInstance(ChangePasswordDto, dto))).length, 0);
  for (const invalid of [{}, { ...dto, currentPassword: '' }, { ...dto, newPassword: 'short' }, { ...dto, confirmPassword: 123 }]) {
    assert.ok((await validate(plainToInstance(ChangePasswordDto, invalid))).length > 0);
  }
});

for (const scope of ['PLATFORM', 'TENANT'] as const) {
  test(`${scope} login cannot issue a session after its verified password was changed`, async () => {
    const initialHash = await bcrypt.hash(oldPassword, 4);
    const changedHash = await bcrypt.hash(newPassword, 4);
    let saves = 0;
    const original = { platformUserId: 1, userId: 2, tenantId: 3, passwordHash: initialHash, isActive: true,
      tenant: { isActive: true }, userRoles: [{ role: { roleId: 4, code: 'TENANT_ADMIN', accessScope: 'TENANT', isActive: true } }] };
    const manager: any = {
      transaction: async (work: any) => work(manager),
      getRepository: (entity: any) => entity === PlatformUser || entity === User
        ? { findOne: async () => ({ passwordHash: changedHash, isActive: true }) }
        : { create: (row: any) => row, save: async () => { saves++; } },
    };
    const service = new AuthService(
      { manager, findOne: async () => original } as any, {} as any,
      { findOne: async () => original } as any, {} as any,
      { find: async () => [] } as any, { find: async () => [] } as any, { find: async () => [] } as any, {} as any,
    );
    const login = scope === 'PLATFORM'
      ? service.login({ username: 'admin', password: oldPassword })
      : service.tenantLogin({ tenantCode: 'TENANT', username: 'cashier', password: oldPassword });
    await assert.rejects(login, /credentials have changed/i);
    assert.equal(saves, 0);
  });
}

test('HTTP password changes require the correct session scope and ignore client-supplied account IDs', async () => {
  const calls: any[] = [];
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  @Module({
    controllers: [AuthController],
    providers: [AuthGuard, TenantAuthGuard,
      { provide: AuthService, useValue: { changePassword: async (principal: any, body: any) => { calls.push({ principal, body }); return { message: 'Changed' }; } } },
      { provide: getRepositoryToken(PlatformSession), useValue: {
        findOne: async ({ where }: any) => where.sessionTokenHash === hash('platform') ? {
          platformSessionId: 1, revokedAt: null, expiresAt: new Date(Date.now() + 60000),
          platformUser: { platformUserId: 1, username: 'admin', isActive: true },
        } : null, update: async () => ({ affected: 1 }),
      } },
      { provide: getRepositoryToken(UserSession), useValue: {
        findOne: async ({ where }: any) => where.sessionTokenHash === hash('tenant') ? {
          userSessionId: 2, revokedAt: null, expiresAt: new Date(Date.now() + 60000),
          user: { userId: 2, tenantId: 3, username: 'cashier', isActive: true, tenant: { isActive: true },
            userRoles: [{ role: { roleId: 4, code: 'CASHIER', accessScope: 'TENANT', isActive: true } }], userLocations: [] },
        } : null, update: async () => ({ affected: 1 }),
      } },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const call = (path: string, token?: string, body: any = dto) => fetch(`${base}/auth/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await call('change-password')).status, 401);
    assert.equal((await call('tenant-change-password')).status, 401);
    assert.equal((await call('change-password', 'tenant')).status, 401);
    assert.equal((await call('tenant-change-password', 'platform')).status, 401);
    assert.equal((await call('change-password', 'platform', { ...dto, newPassword: 'short' })).status, 400);
    assert.equal(calls.length, 0);
    for (const [path, token] of [['change-password', 'platform'], ['tenant-change-password', 'tenant']]) {
      assert.equal((await call(path, token, { ...dto, userId: 99, tenantId: 99, platformUserId: 99 })).status, 201);
    }
    assert.equal(calls[0].principal.platformUserId, 1);
    assert.equal(calls[1].principal.userId, 2);
    assert.equal(calls[1].principal.tenantId, 3);
    assert.deepEqual(Object.keys(calls[0].body).sort(), Object.keys(dto).sort());
  } finally { await app.close(); }
});
