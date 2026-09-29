import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreatePaymentChannelDto } from './dto/create-payment-channel.dto';
import { UpdatePaymentChannelDto } from './dto/update-payment-channel.dto';
import { PaymentChannelsService } from './payment-channels.service';

@Controller('payment-channels')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PaymentChannelsController {
  constructor(private readonly service: PaymentChannelsService) {}
  @Get() @RequirePermission('SALES_PAYMENT_METHOD_VIEW')
  list(@CurrentUser() user: TenantPrincipal, @Query('activeOnly') activeOnly?: string) { return this.service.findAll(user, activeOnly === 'true'); }
  @Post() @RequirePermission('SALES_PAYMENT_METHOD_MANAGE') create(@Body() dto: CreatePaymentChannelDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Put(':id') @RequirePermission('SALES_PAYMENT_METHOD_MANAGE') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentChannelDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }
  @Patch(':id/activate') @RequirePermission('SALES_PAYMENT_METHOD_MANAGE') activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.setActive(id, true, user); }
  @Patch(':id/deactivate') @RequirePermission('SALES_PAYMENT_METHOD_MANAGE') deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.setActive(id, false, user); }
}
