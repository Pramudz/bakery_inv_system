import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionService } from './permissions.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
@Controller('permissions')
@UseGuards(TenantAuthGuard)
export class PermissionController {
  constructor(private readonly service:PermissionService) {}
  @Get() findAll(@CurrentUser() user: TenantPrincipal) { return this.service.findEnabledForTenant(user.tenantId); }
}
