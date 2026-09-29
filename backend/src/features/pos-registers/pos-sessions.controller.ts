import { Body, Controller, Get, Headers, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { OpenMasterRegisterDto, OpenTerminalRegisterDto } from './dto/open-register.dto';
import { PosSessionsService } from './pos-sessions.service';

@Controller('pos-register-sessions')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PosSessionsController {
  constructor(private readonly service: PosSessionsService) {}

  @Get('context')
  context(@Query('locationId', ParseIntPipe) locationId: number, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.context(locationId, credential, user);
  }

  @Post('terminal/open')
  @RequirePermission('SALES_BILLING')
  openTerminal(@Body() dto: OpenTerminalRegisterDto, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.openTerminal(dto, credential, user);
  }

  @Post('master/open')
  @RequirePermission('SALES_REGISTER_OPEN')
  openMaster(@Body() dto: OpenMasterRegisterDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.openMaster(dto, user);
  }

  @Post('cashier/start')
  @RequirePermission('SALES_BILLING')
  startCashier(@Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.startCashier(credential, user);
  }
}
