import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TenantPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { InventoryAgingService } from './inventory-aging.service';

@Controller('inventory-aging')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class InventoryAgingController {
  constructor(private readonly service: InventoryAgingService) {}
  @Get('current') @RequirePermission('INVENTORY_AGING_VIEW')
  current(@CurrentUser() user: TenantPrincipal, @Query('locationId') locationId?: string, @Query('productId') productId?: string) {
    return this.service.calculateCurrentAging(user, { locationId: locationId ? Number(locationId) : undefined, productId: productId ? Number(productId) : undefined });
  }
  @Post('snapshots/current') @RequirePermission('INVENTORY_AGING_SNAPSHOT')
  snapshot(@CurrentUser() user: TenantPrincipal, @Query('locationId') locationId?: string, @Query('productId') productId?: string) {
    return this.service.generateCurrentSnapshot(user, { locationId: locationId ? Number(locationId) : undefined, productId: productId ? Number(productId) : undefined });
  }
}
