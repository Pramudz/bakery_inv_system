import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { UserRoleService } from '../user-roles/user-roles.service';
import { RolePermissionService } from '../role-permissions/role-permissions.service';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

test('user-role update cannot move an assignment to a user or role in another tenant', async () => {
  let updates = 0;
  const repository = { findOne: async () => ({ userRoleId: 2, user: { tenantId: 7 } }), update: async () => { updates++; } };
  const dataSource = { getRepository: (entity: unknown) => {
    if (entity === User || entity === Role) return { findOne: async () => null };
    throw new Error('Unexpected entity');
  } };
  const service = new UserRoleService(repository as any, dataSource as any);
  await assert.rejects(() => service.update(2, { userId: 99 }, 7), NotFoundException);
  await assert.rejects(() => service.update(2, { roleId: 99 }, 7), NotFoundException);
  assert.equal(updates, 0);
});

test('role-permission update refuses another tenant role or disabled module', async () => {
  let updates = 0;
  const repository = { findOne: async () => ({ rolePermissionId: 2, role: { tenantId: 7 } }), update: async () => { updates++; } };
  const dataSource = { getRepository: (entity: unknown) => {
    if (entity === Role) return { findOne: async () => null };
    if (entity === Permission) return { findOneBy: async () => ({ permissionId: 8, moduleId: 5 }) };
    if (entity === TenantModule) return { findOneBy: async () => null };
    throw new Error('Unexpected entity');
  } };
  const service = new RolePermissionService(repository as any, dataSource as any);
  await assert.rejects(() => service.update(2, { roleId: 99 }, 7), NotFoundException);
  await assert.rejects(() => service.update(2, { permissionId: 8 }, 7), NotFoundException);
  assert.equal(updates, 0);
});
