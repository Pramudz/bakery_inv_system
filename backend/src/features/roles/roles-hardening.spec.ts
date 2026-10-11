import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { RoleService } from './roles.service';

test('tenant roles remain scoped, system role code is reserved, and inactive roles can be reactivated', async () => {
  const rows: any[] = [{ roleId: 1, tenantId: 7, code: 'TENANT_ADMIN', name: 'Administrator', isSystemRole: true, isActive: true, accessScope: 'TENANT' },
    { roleId: 2, tenantId: 7, code: 'CASHIER', name: 'Cashier', isSystemRole: false, isActive: true, accessScope: 'LOCATION' },
    { roleId: 3, tenantId: 8, code: 'OTHER', name: 'Other tenant', isSystemRole: false, isActive: true, accessScope: 'TENANT' }];
  const repo: any = {
    find: async ({ where }: any) => rows.filter(row => row.tenantId === where.tenantId),
    findOne: async ({ where }: any) => rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    create: (value: any) => value,
    save: async (value: any) => { value.roleId = rows.length + 1; rows.push(value); return value; },
    update: async (where: any, value: any) => { const row = rows.find(item => item.roleId === where.roleId && item.tenantId === where.tenantId); if (row) Object.assign(row, value); },
  };
  const service = new RoleService(repo);
  await assert.rejects(service.create({ code: ' tenant_admin ', name: 'Escalation' }, 7), /system roles/i);
  await assert.rejects(service.create({ code: 'FAKE', name: 'Escalation', isSystemRole: true }, 7), /system roles/i);
  await assert.rejects(service.deactivate(1, 7), /cannot be deactivated/i);
  await assert.rejects(service.update(3, { name: 'Changed' }, 7), /not found/i);
  await service.deactivate(2, 7);
  assert.equal(rows[1].isActive, false);
  await service.activate(2, 7);
  assert.equal(rows[1].isActive, true);
  await assert.rejects(service.activate(3, 7), /not found/i);
  await service.create({ code: 'STOCK_CLERK', name: 'Stock clerk', accessScope: 'LOCATION' }, 7);
  assert.equal(rows.at(-1).tenantId, 7);
  assert.equal(rows.at(-1).isSystemRole, false);
});
