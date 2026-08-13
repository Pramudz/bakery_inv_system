import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { REQUIRE_PERMISSION } from './require-permission.decorator';
import { AuthenticatedRequest, TenantPrincipal } from './auth.types';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly dataSource: DataSource) {}
  async canActivate(context: ExecutionContext) {
    const code = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!code) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user as TenantPrincipal;
    if (!user || user.scope !== 'TENANT') throw new ForbiddenException('Tenant authentication is required.');
    const permission = await this.dataSource.getRepository(Permission).findOneBy({ code, isActive: true });
    if (!permission) throw new ForbiddenException('Permission is unavailable.');
    const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({ tenantId: user.tenantId, moduleId: permission.moduleId, isEnabled: true });
    if (!enabled) throw new ForbiddenException('Module is not enabled for this tenant.');
    if (user.roleCode === 'TENANT_ADMIN') return true;
    const grant = await this.dataSource.getRepository(RolePermission).findOne({ where: { roleId: user.roleId, permissionId: permission.permissionId } });
    if (!grant) throw new ForbiddenException('Required permission is not assigned.');
    return true;
  }
}
