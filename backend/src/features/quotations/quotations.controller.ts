import { Body, Controller, Get, Param, ParseEnumPipe, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequireAnyPermission, RequirePermission } from '../auth/require-permission.decorator';
import { SaveQuotationDto } from './dto/save-quotation.dto';
import { QuotationsService } from './quotations.service';
import { QuoteInvoiceDto } from '../invoices/dto/quote-invoice.dto';

@Controller('quotations')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}
  @Get('locations') @RequireAnyPermission('SALES_QUOTATION_VIEW', 'SALES_QUOTATION_CREATE', 'SALES_QUOTATION_EDIT') locations(@CurrentUser() user: TenantPrincipal) { return this.service.locations(user); }
  @Get('customers') @RequireAnyPermission('SALES_QUOTATION_CREATE', 'SALES_QUOTATION_EDIT') customers(@CurrentUser() user: TenantPrincipal) { return this.service.customers(user); }
  @Get('catalog') @RequireAnyPermission('SALES_QUOTATION_CREATE', 'SALES_QUOTATION_EDIT') catalog(@Query('locationId', ParseIntPipe) locationId: number, @Query('saleType', new ParseEnumPipe({ RETAIL: 'RETAIL', WHOLESALE: 'WHOLESALE' })) saleType: 'RETAIL' | 'WHOLESALE', @CurrentUser() user: TenantPrincipal) { return this.service.catalog(locationId, saleType, user); }
  @Post('price') @RequireAnyPermission('SALES_QUOTATION_CREATE', 'SALES_QUOTATION_EDIT') price(@Body() dto: QuoteInvoiceDto, @CurrentUser() user: TenantPrincipal) { return this.service.price(dto, user); }
  @Get() @RequirePermission('SALES_QUOTATION_VIEW') list(@CurrentUser() user: TenantPrincipal, @Query() query: Record<string, string>) { return this.service.list(user, query); }
  @Get(':id') @RequirePermission('SALES_QUOTATION_VIEW') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Get(':id/pos-preview') @RequirePermission('SALES_QUOTATION_CONVERT') preview(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.posPreview(id, user); }
  @Post() @RequirePermission('SALES_QUOTATION_CREATE') create(@Body() dto: SaveQuotationDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Put(':id') @RequirePermission('SALES_QUOTATION_EDIT') update(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveQuotationDto, @CurrentUser() user: TenantPrincipal) { return this.service.update(id, dto, user); }
  @Patch(':id/send') @RequirePermission('SALES_QUOTATION_SEND') send(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.transition(id, 'send', user); }
  @Patch(':id/accept') @RequirePermission('SALES_QUOTATION_ACCEPT') accept(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.transition(id, 'accept', user); }
  @Patch(':id/reject') @RequirePermission('SALES_QUOTATION_CANCEL') reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.transition(id, 'reject', user); }
  @Patch(':id/cancel') @RequirePermission('SALES_QUOTATION_CANCEL') cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.transition(id, 'cancel', user); }
}
