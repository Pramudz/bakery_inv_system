import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
import { CreateInventoryAdjustmentReasonDto, SetInventoryAdjustmentReasonActiveDto, UpdateInventoryAdjustmentReasonDto } from './dto/inventory-adjustment-reason.dto';
import { InventoryAdjustmentReasonsService } from './inventory-adjustment-reasons.service';

@Controller('inventory/adjustment-reasons')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class InventoryAdjustmentReasonsController {
  constructor(private readonly service: InventoryAdjustmentReasonsService) {}
  @Get() @RequirePermission('INVENTORY_ADJUSTMENT_VIEW')
  list(
    @CurrentUser() user: TenantPrincipal,
    @Query('direction') direction = '',
    @Query('active') active = '',
    @Query('page') page = '',
    @Query('limit') limit = '',
    @Query('search') search = '',
    @Query('system') system = '',
  ) {
    return this.service.list(user, direction, active, { page, limit, search, system });
  }
  @Post() @RequirePermission('INVENTORY_ADJUSTMENT_REASON_MANAGE')
  create(@Body() dto: CreateInventoryAdjustmentReasonDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Put(':id') @RequirePermission('INVENTORY_ADJUSTMENT_REASON_MANAGE')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInventoryAdjustmentReasonDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }
  @Patch(':id/active') @RequirePermission('INVENTORY_ADJUSTMENT_REASON_MANAGE')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() dto: SetInventoryAdjustmentReasonActiveDto, @CurrentUser() user: TenantPrincipal) { return this.service.setActive(id, dto, user); }
}
