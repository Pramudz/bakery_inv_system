import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchasing/purchase-orders')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}
  @Get() @RequirePermission('PURCHASE_ORDER_VIEW') list(
    @CurrentUser() user: TenantPrincipal,
    @Query('page') page?: string, @Query('limit') limit?: string,
    @Query('search') search?: string, @Query('status') status?: string,
  ) {
    if (page === undefined && limit === undefined && search === undefined && status === undefined) return this.service.list(user);
    return this.service.findPage(user, Number(page || 1), Number(limit || 20), search || '', status || '');
  }
  @Get(':id') @RequirePermission('PURCHASE_ORDER_VIEW') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post() @RequirePermission('PURCHASE_ORDER_CREATE') create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Put(':id') @RequirePermission('PURCHASE_ORDER_UPDATE') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePurchaseOrderDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }
  @Patch(':id/approve') @RequirePermission('PURCHASE_ORDER_APPROVE') approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.approve(id, user); }
  @Patch(':id/cancel') @RequirePermission('PURCHASE_ORDER_CANCEL') cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.cancel(id, user); }
}
