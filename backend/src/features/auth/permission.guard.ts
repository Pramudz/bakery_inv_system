import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { REQUIRE_ANY_PERMISSION, REQUIRE_PERMISSION } from './require-permission.decorator';
import { AuthenticatedRequest, TenantPrincipal } from './auth.types';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly dataSource: DataSource) {}
  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[] | string>(REQUIRE_PERMISSION, [context.getHandler(), context.getClass()]);
    const requiredAny = this.reflector.getAllAndOverride<string[]>(REQUIRE_ANY_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!required && !requiredAny?.length) return true;
    const codes = Array.isArray(required) ? required : [required];
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user as TenantPrincipal;
    if (!user || user.scope !== 'TENANT') throw new ForbiddenException('Tenant authentication is required.');
    for (const code of codes.filter(Boolean) as string[]) {
      const permission = await this.dataSource.getRepository(Permission).findOneBy({ code, isActive: true });
      if (!permission) throw new ForbiddenException('Permission is unavailable.');
      const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({ tenantId: user.tenantId, moduleId: permission.moduleId, isEnabled: true });
      if (!enabled) throw new ForbiddenException('Module is not enabled for this tenant.');
      if (user.roleCode === 'TENANT_ADMIN') continue;
      const grant = await this.dataSource.getRepository(RolePermission).findOne({ where: { roleId: user.roleId, permissionId: permission.permissionId } });
      if (!grant) throw new ForbiddenException('Required permission is not assigned.');
    }
    if (requiredAny?.length) {
      let allowed = false;
      for (const code of requiredAny) {
        const permission = await this.dataSource.getRepository(Permission).findOneBy({ code, isActive: true });
        if (!permission) continue;
        const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({ tenantId: user.tenantId, moduleId: permission.moduleId, isEnabled: true });
        if (!enabled) continue;
        if (user.roleCode === 'TENANT_ADMIN') { allowed = true; break; }
        const grant = await this.dataSource.getRepository(RolePermission).findOne({ where: { roleId: user.roleId, permissionId: permission.permissionId } });
        if (grant) { allowed = true; break; }
      }
      if (!allowed) throw new ForbiddenException('None of the required permissions are assigned.');
    }
    return true;
  }
}
