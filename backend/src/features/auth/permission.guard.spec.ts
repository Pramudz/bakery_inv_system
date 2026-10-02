import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../permissions/permissions.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { PermissionGuard } from './permission.guard';
import { REQUIRE_ANY_PERMISSION } from './require-permission.decorator';

function fixture(grantedCodes: string[]) {
  const permissions = new Map([
    ['SALES_BILLING', { permissionId: 1, moduleId: 5, code: 'SALES_BILLING', isActive: true }],
    ['SALES_REGISTER_VERIFY', { permissionId: 2, moduleId: 5, code: 'SALES_REGISTER_VERIFY', isActive: true }],
  ]);
  const reflector = { getAllAndOverride: (key: string) => key === REQUIRE_ANY_PERMISSION ? ['SALES_BILLING', 'SALES_REGISTER_VERIFY'] : undefined } as unknown as Reflector;
  const dataSource = { getRepository: (entity: unknown) => {
    if (entity === Permission) return { findOneBy: async ({ code }: any) => permissions.get(code) ?? null };
    if (entity === TenantModule) return { findOneBy: async () => ({ isEnabled: true }) };
    if (entity === RolePermission) return { findOne: async ({ where }: any) => grantedCodes.some((code) => permissions.get(code)?.permissionId === where.permissionId) ? { roleId: 9 } : null };
    throw new Error('Unexpected repository');
  } } as any;
  const context = { getHandler: () => fixture, getClass: () => PermissionGuard, switchToHttp: () => ({ getRequest: () => ({ user: { scope: 'TENANT', tenantId: 1, roleId: 9, roleCode: 'MANAGER' } }) }) } as any;
  return { guard: new PermissionGuard(reflector, dataSource), context };
}

test('permission guard accepts any one applicable register permission', async () => {
  const { guard, context } = fixture(['SALES_REGISTER_VERIFY']);
  assert.equal(await guard.canActivate(context), true);
});

test('permission guard rejects a user with none of the applicable permissions', async () => {
  const { guard, context } = fixture([]);
  await assert.rejects(guard.canActivate(context), ForbiddenException);
});
