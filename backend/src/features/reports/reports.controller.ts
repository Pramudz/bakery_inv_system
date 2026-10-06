import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('locations')
  locations(@CurrentUser() user: TenantPrincipal) {
    return this.service.locations(user);
  }

  @Get(':reportId')
  run(
    @Param('reportId') reportId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('locationId') locationId: string,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.run(reportId, { from, to, locationId }, user);
  }
}
