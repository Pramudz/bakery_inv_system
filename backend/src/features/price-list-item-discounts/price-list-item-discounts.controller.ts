import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { ChangePriceListItemDiscountDto, EndPriceListItemDiscountDto, PublishPriceListItemDiscountDto, ResolveSellingPriceDto } from './dto/price-list-item-discount.dto';
import { PriceListItemDiscountService } from './price-list-item-discounts.service';

@Controller('price-list-items/:priceListItemId/discounts')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PriceListItemDiscountController {
  constructor(private readonly service: PriceListItemDiscountService) {}

  @Post() @RequirePermission('PRODUCT_UPDATE')
  publish(@Param('priceListItemId', ParseIntPipe) id: number, @Body() dto: PublishPriceListItemDiscountDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.publishDiscount(id, dto, user.tenantId, user.userId);
  }

  @Post('change') @RequirePermission('PRODUCT_UPDATE')
  change(@Param('priceListItemId', ParseIntPipe) id: number, @Body() dto: ChangePriceListItemDiscountDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.changeDiscount(id, dto, user.tenantId, user.userId);
  }

  @Get('active') @RequirePermission('PRODUCT_VIEW')
  active(@Param('priceListItemId', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.findActiveDiscount(id, user.tenantId);
  }

  @Get() @RequirePermission('PRODUCT_VIEW')
  history(@Param('priceListItemId', ParseIntPipe) id: number, @Query('page') page: string, @Query('limit') limit: string, @CurrentUser() user: TenantPrincipal) {
    return this.service.getDiscountHistory(id, user.tenantId, Number(page) || 1, Number(limit) || 20);
  }
}

@Controller('price-list-item-discounts')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class DiscountEndController {
  constructor(private readonly service: PriceListItemDiscountService) {}
  @Post(':discountId/end') @RequirePermission('PRODUCT_UPDATE')
  end(@Param('discountId', ParseIntPipe) id: number, @Body() dto: EndPriceListItemDiscountDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.endDiscount(id, dto, user.tenantId, user.userId);
  }
}

@Controller('selling-prices')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class SellingPriceResolutionController {
  constructor(private readonly service: PriceListItemDiscountService) {}
  @Post('resolve') @RequirePermission('PRODUCT_VIEW')
  resolve(@Body() dto: ResolveSellingPriceDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.resolveSellingPrice(dto, user.tenantId);
  }
}
