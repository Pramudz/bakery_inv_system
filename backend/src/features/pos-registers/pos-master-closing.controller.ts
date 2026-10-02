import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { SubmitMasterRegisterCountDto, VerifyMasterRegisterCountDto } from './dto/master-closing.dto';
import { PosMasterClosingService } from './pos-master-closing.service';
import { PosListQueryDto } from './dto/pos-list-query.dto';

@Controller('pos-master-closing')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PosMasterClosingController {
  constructor(private readonly service: PosMasterClosingService) {}

  @Get('locations') @RequirePermission('SALES_REGISTER_CLOSE')
  locations(@CurrentUser() user: TenantPrincipal) { return this.service.locations(user); }

  @Get('summary') @RequirePermission('SALES_REGISTER_CLOSE')
  summary(@Query('locationId', ParseIntPipe) locationId: number, @CurrentUser() user: TenantPrincipal) { return this.service.summary(locationId, user); }

  @Get('history') @RequirePermission('SALES_REGISTER_CLOSE')
  history(@Query('locationId', ParseIntPipe) locationId: number, @Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) { return this.service.history(locationId, query, user); }

  @Post('submit-count') @RequirePermission('SALES_REGISTER_CLOSE')
  submit(@Body() dto: SubmitMasterRegisterCountDto, @CurrentUser() user: TenantPrincipal) { return this.service.submit(dto, user); }

  @Get('verification-queue') @RequirePermission('SALES_REGISTER_VERIFY')
  queue(@Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) { return this.service.queue(query, user); }

  @Get('verification-queue/:id') @RequirePermission('SALES_REGISTER_VERIFY')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }

  @Post('verification-queue/:id/decision') @RequirePermission('SALES_REGISTER_VERIFY')
  verify(@Param('id', ParseIntPipe) id: number, @Body() dto: VerifyMasterRegisterCountDto, @CurrentUser() user: TenantPrincipal) { return this.service.verify(id, dto, user); }
}
