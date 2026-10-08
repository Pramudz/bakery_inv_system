import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreateStockTransferDto, DispatchStockTransferDto, ReceiveStockTransferDto } from './dto/stock-transfer.dto';
import { StockTransfersService } from './stock-transfers.service';

@Controller('inventory/transfers')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}
  @Get() @RequirePermission('INVENTORY_TRANSFER_VIEW') list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get(':id') @RequirePermission('INVENTORY_TRANSFER_VIEW') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post() @RequirePermission('INVENTORY_TRANSFER_CREATE') create(@Body() dto: CreateStockTransferDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Patch(':id/dispatch') @RequirePermission('INVENTORY_TRANSFER_DISPATCH') dispatch(@Param('id', ParseIntPipe) id: number, @Body() dto: DispatchStockTransferDto, @CurrentUser() user: TenantPrincipal) { return this.service.dispatch(id, dto, user); }
  @Post(':id/receipts') @RequirePermission('INVENTORY_TRANSFER_RECEIVE') receive(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveStockTransferDto, @CurrentUser() user: TenantPrincipal) { return this.service.receive(id, dto, user); }
  @Patch(':id/cancel') @RequirePermission('INVENTORY_TRANSFER_CANCEL') cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.cancel(id, user); }
}
