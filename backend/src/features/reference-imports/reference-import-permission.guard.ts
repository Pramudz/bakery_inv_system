import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Permission } from '../permissions/permissions.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { AuthenticatedRequest, TenantPrincipal } from '../auth/auth.types';
import { isMaster, Master } from './reference-import.schema';

const prefix: Record<Master, string> = {
  categories: 'CATEGORY', brands: 'BRAND', units: 'UNIT', suppliers: 'SUPPLIER',
  'price-lists': 'PRICE_LIST', locations: 'LOCATION',
};

@Injectable()
export class ReferenceImportPermissionGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const master = String(request.params.master);
    if (!isMaster(master)) throw new ForbiddenException('Unknown reference master.');
    const user = request.user as TenantPrincipal;
    if (!user || user.scope !== 'TENANT') throw new ForbiddenException('Tenant authentication is required.');
    const action = request.method === 'POST' ? 'CREATE' : 'VIEW';
    const code = `${prefix[master]}_${action}`;
    const permission = await this.dataSource.getRepository(Permission).findOneBy({ code, isActive: true });
    if (!permission) throw new ForbiddenException('Permission is unavailable.');
    const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({ tenantId: user.tenantId, moduleId: permission.moduleId, isEnabled: true });
    if (!enabled) throw new ForbiddenException('Module is not enabled for this tenant.');
    if (user.roleCode === 'TENANT_ADMIN') return true;
    const grant = await this.dataSource.getRepository(RolePermission).findOneBy({ roleId: user.roleId, permissionId: permission.permissionId });
    if (!grant) throw new ForbiddenException('Required permission is not assigned.');
    return true;
  }
}
