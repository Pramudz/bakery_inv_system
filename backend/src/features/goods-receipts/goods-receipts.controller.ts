import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { GoodsReceiptsService } from './goods-receipts.service';

@Controller('purchasing/goods-receipts')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class GoodsReceiptsController {
  constructor(private readonly service: GoodsReceiptsService) {}
  @Get() @RequirePermission('GRN_VIEW') list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get(':id') @RequirePermission('GRN_VIEW') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post() @RequirePermission('GRN_CREATE') create(@Body() dto: CreateGoodsReceiptDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Put(':id') @RequirePermission('GRN_UPDATE') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGoodsReceiptDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }
  @Patch(':id/post') @RequirePermission('GRN_POST') post(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.post(id, user); }
  @Patch(':id/cancel') @RequirePermission('GRN_CANCEL') cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.cancel(id, user); }
}
