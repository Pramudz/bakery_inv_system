import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('payment-methods')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  @RequirePermission('SALES_PAYMENT_METHOD_VIEW')
  findAll(@CurrentUser() user: TenantPrincipal) { return this.service.findAll(user.tenantId); }

  @Get(':id')
  @RequirePermission('SALES_PAYMENT_METHOD_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @RequirePermission('SALES_PAYMENT_METHOD_MANAGE')
  create(@Body() dto: CreatePaymentMethodDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  @RequirePermission('SALES_PAYMENT_METHOD_MANAGE')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentMethodDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  @RequirePermission('SALES_PAYMENT_METHOD_MANAGE')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.setActive(id, user.tenantId, false);
  }

  @Patch(':id/activate')
  @RequirePermission('SALES_PAYMENT_METHOD_MANAGE')
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.setActive(id, user.tenantId, true);
  }
}
