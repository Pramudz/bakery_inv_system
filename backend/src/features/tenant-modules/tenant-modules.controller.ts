import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth-guard';
import { PlatformGuard } from '../auth/platform.guard';
import { TenantModulesService } from './tenant-modules.service';
import { UpdateTenantModuleDto } from './dto/update-tenant-module.dto';

@Controller('tenants/:tenantId/modules')
@UseGuards(AuthGuard, PlatformGuard)
export class TenantModulesController {
  constructor(private readonly service: TenantModulesService) {}
  @Get() findForTenant(@Param('tenantId', ParseIntPipe) tenantId: number) { return this.service.findForTenant(tenantId); }
  @Put(':moduleId') setEnabled(@Param('tenantId', ParseIntPipe) tenantId: number, @Param('moduleId', ParseIntPipe) moduleId: number, @Body() dto: UpdateTenantModuleDto) { return this.service.setEnabled(tenantId, moduleId, dto.isEnabled); }
}
