import { Controller, Get, UseGuards } from '@nestjs/common';
import { ModuleEntityService } from './modules.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
@Controller('modules')
@UseGuards(TenantAuthGuard)
export class ModuleEntityController {
  constructor(private readonly service:ModuleEntityService) {}
  @Get() findAll(@CurrentUser() user: TenantPrincipal) { return this.service.findEnabledForTenant(user.tenantId); }
}
