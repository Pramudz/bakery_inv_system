import { Controller, Get, Headers, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequireAnyPermission, RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PosRegisterManagementService } from './pos-register-management.service';
import { PosListQueryDto } from './dto/pos-list-query.dto';

@Controller('pos-register-management')
@UseGuards(TenantAuthGuard, PermissionGuard)
@RequireAnyPermission('SALES_BILLING', 'SALES_POS_REGISTER_ADMIN', 'SALES_REGISTER_OPEN', 'SALES_REGISTER_CLOSE', 'SALES_REGISTER_VERIFY', 'SALES_REGISTER_PAYOUT')
export class PosRegisterManagementController {
  constructor(private readonly service: PosRegisterManagementService) {}

  @Get('locations')
  locations(@CurrentUser() user: TenantPrincipal) { return this.service.locations(user); }

  @Get('overview')
  overview(@Query('locationId', ParseIntPipe) locationId: number, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.overview(locationId, credential, user);
  }

  @Get('history')
  @RequireAnyPermission('SALES_POS_REGISTER_ADMIN', 'SALES_REGISTER_CLOSE', 'SALES_REGISTER_VERIFY')
  history(@Query('locationId', ParseIntPipe) locationId: number, @Query() query: PosListQueryDto, @Query('kind') kind: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.history(locationId, query, kind, user);
  }

  @Get('cashier-sessions')
  cashierSessions(@Query('locationId', ParseIntPipe) locationId: number, @Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.history(locationId, query, 'CASHIERS', user);
  }

  @Get('verification-queue')
  @RequirePermission('SALES_REGISTER_VERIFY')
  verificationQueue(@Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.verificationQueue(query, user);
  }
}
