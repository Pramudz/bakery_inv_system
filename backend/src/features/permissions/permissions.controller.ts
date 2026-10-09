import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionService } from './permissions.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantPrincipal } from '../auth/auth.types';
@Controller('permissions')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PermissionController {
  constructor(private readonly service:PermissionService) {}
  @Get() @RequirePermission('PERMISSION_VIEW') findAll(@CurrentUser() user: TenantPrincipal) { return this.service.findEnabledForTenant(user.tenantId); }
}
