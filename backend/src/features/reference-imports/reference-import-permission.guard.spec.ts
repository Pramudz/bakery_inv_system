import assert from 'node:assert/strict';
import test from 'node:test';
import { ReferenceImportPermissionGuard } from './reference-import-permission.guard';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';

function guardFixture(granted: boolean) {
  const queried: string[] = [];
  const dataSource: any = { getRepository(entity: any) {
    if (entity === Permission) return { findOneBy: async ({ code }: any) => { queried.push(code); return { permissionId: code === 'BRAND_CREATE' ? 2 : 1, moduleId: 3 }; } };
    if (entity === TenantModule) return { findOneBy: async ({ tenantId }: any) => tenantId === 7 ? { isEnabled: true } : null };
    if (entity === RolePermission) return { findOneBy: async () => granted ? { roleId: 5 } : null };
    throw Error('Unexpected repository');
  } };
  return { guard: new ReferenceImportPermissionGuard(dataSource), queried };
}
const context = (method: string, master: string, tenantId = 7): any => ({ switchToHttp: () => ({ getRequest: () => ({ method, params: { master }, user: { scope: 'TENANT', tenantId, roleId: 5, roleCode: 'STAFF' } }) }) });

test('read endpoints need master view permission and writes need create permission', async () => {
  const { guard, queried } = guardFixture(true);
  assert.equal(await guard.canActivate(context('GET', 'brands')), true);
  assert.equal(await guard.canActivate(context('POST', 'brands')), true);
  assert.deepEqual(queried, ['BRAND_VIEW', 'BRAND_CREATE']);
});
test('import permission guard rejects missing grants, disabled tenant module and unknown master', async () => {
  const { guard } = guardFixture(false);
  await assert.rejects(guard.canActivate(context('POST', 'brands')), /permission is not assigned/i);
  await assert.rejects(guard.canActivate(context('GET', 'brands', 8)), /module is not enabled/i);
  await assert.rejects(guard.canActivate(context('GET', 'toString')), /Unknown reference master/i);
});
