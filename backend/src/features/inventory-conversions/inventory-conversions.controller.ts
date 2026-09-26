import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
import { CreateInventoryConversionDto, PostInventoryConversionDto, UpdateInventoryConversionDto } from './dto/inventory-conversion.dto';
import { InventoryConversionsService } from './inventory-conversions.service';

@Controller('inventory/value-adjustments')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class InventoryConversionsController {
  constructor(private readonly service: InventoryConversionsService) {}

  @Get() @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_VIEW')
  list(@CurrentUser() user: TenantPrincipal, @Query('page') page = '1', @Query('limit') limit = '20', @Query('search') search = '', @Query('status') status = '', @Query('locationId') locationId?: string, @Query('allocationMethod') allocationMethod = '', @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.service.list(user, { page: Number(page), limit: Number(limit), search, status, locationId: locationId ? Number(locationId) : undefined, allocationMethod, dateFrom, dateTo });
  }

  @Get('product-contexts') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_VIEW')
  productContexts(@CurrentUser() user: TenantPrincipal, @Query('locationId') locationId = '', @Query('page') page = '1', @Query('limit') limit = '20', @Query('search') search = '', @Query('productId') productId = '') {
    return this.service.productContexts(user, { locationId: Number(locationId), page: Number(page), limit: Number(limit), search, productId: productId ? Number(productId) : undefined });
  }

  @Get('locations') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_VIEW')
  locations(@CurrentUser() user: TenantPrincipal) { return this.service.locations(user); }

  @Get(':id') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_VIEW')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }

  @Post() @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_CREATE')
  create(@Body() dto: CreateInventoryConversionDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }

  @Put(':id') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_UPDATE')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInventoryConversionDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }

  @Patch(':id') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_UPDATE')
  patch(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInventoryConversionDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }

  @Patch(':id/post') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_POST')
  post(@Param('id', ParseIntPipe) id: number, @Body() dto: PostInventoryConversionDto, @CurrentUser() user: TenantPrincipal) { return this.service.post(id, dto, user); }

  @Patch(':id/cancel') @RequirePermission('INVENTORY_VALUE_ADJUSTMENT_CANCEL')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.cancel(id, user); }
}
