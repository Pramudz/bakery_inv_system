import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { SubmitCashCountDto, VerifyCashCountDto } from './dto/cash-reconciliation.dto';
import { PosCashReconciliationService } from './pos-cash-reconciliation.service';

@Controller('pos-register-closing')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PosCashReconciliationController {
  constructor(private readonly service: PosCashReconciliationService) {}

  @Get('current-summary')
  @RequirePermission('SALES_BILLING')
  current(@Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.current(credential, user);
  }

  @Post('submit-count')
  @RequirePermission('SALES_BILLING')
  submit(@Body() dto: SubmitCashCountDto, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) {
    return this.service.submit(dto, credential, user);
  }

  @Get('verification-queue')
  @RequirePermission('SALES_REGISTER_VERIFY')
  queue(@CurrentUser() user: TenantPrincipal) { return this.service.queue(user); }

  @Get('verification-queue/:id')
  @RequirePermission('SALES_REGISTER_VERIFY')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }

  @Post('verification-queue/:id/decision')
  @RequirePermission('SALES_REGISTER_VERIFY')
  verify(@Param('id', ParseIntPipe) id: number, @Body() dto: VerifyCashCountDto, @CurrentUser() user: TenantPrincipal) { return this.service.verify(id, dto, user); }
}
