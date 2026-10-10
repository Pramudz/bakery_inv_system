import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Permission } from '../permissions/permissions.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { isProductImportType } from './product-import.schema';

@Injectable()
export class ProductImportPermissionGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: TenantPrincipal; params: { type?: string }; method: string }>();
    const user = request.user;
    if (!user || user.scope !== 'TENANT') throw new ForbiddenException('Tenant authentication is required.');
    const type = String(request.params.type ?? '');
    if (!isProductImportType(type)) throw new ForbiddenException('Unknown product import type.');
    const required = request.method === 'POST'
      ? type === 'onboarding' ? ['PRODUCT_CREATE'] : type === 'products' ? ['PRODUCT_CREATE', 'PRODUCT_UPDATE'] : ['PRODUCT_UPDATE']
      : ['PRODUCT_VIEW'];
    for (const code of required) {
      const permission = await this.dataSource.getRepository(Permission).findOneBy({ code, isActive: true });
      if (!permission) throw new ForbiddenException(`${code} permission is unavailable.`);
      const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({ tenantId: user.tenantId, moduleId: permission.moduleId, isEnabled: true });
      if (!enabled) throw new ForbiddenException('Product module is not enabled for this tenant.');
      if (user.roleCode !== 'TENANT_ADMIN' && !await this.dataSource.getRepository(RolePermission).findOneBy({ roleId: user.roleId, permissionId: permission.permissionId }))
        throw new ForbiddenException(`${code} permission is required.`);
    }
    return true;
  }
}
