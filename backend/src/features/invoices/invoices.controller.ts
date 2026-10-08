import { Body, Controller, Get, Headers, Param, ParseEnumPipe, ParseIntPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';
import { ReceiveInvoicePaymentDto } from './dto/receive-invoice-payment.dto';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { QuoteInvoiceDto } from './dto/quote-invoice.dto';
import { PosCostVisibilityInterceptor } from './pos-cost-visibility.interceptor';

enum PosSaleTypeParam { RETAIL = 'RETAIL', WHOLESALE = 'WHOLESALE' }

@Controller('invoices')
@UseGuards(TenantAuthGuard, PermissionGuard)
@UseInterceptors(PosCostVisibilityInterceptor)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}
  @Get() @RequirePermission('SALES_INVOICE_VIEW') list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get('locations') @RequirePermission('SALES_BILLING') billingLocations(@CurrentUser() user: TenantPrincipal) { return this.service.billingLocations(user); }
  @Get('catalog') @RequirePermission('SALES_BILLING') catalog(@Query('locationId', ParseIntPipe) locationId: number, @Query('saleType', new ParseEnumPipe(PosSaleTypeParam)) saleType: PosSaleTypeParam, @CurrentUser() user: TenantPrincipal) { return this.service.catalog(locationId, saleType, user); }
  @Post('quote') @RequirePermission('SALES_BILLING') quote(@Body() dto: QuoteInvoiceDto, @CurrentUser() user: TenantPrincipal) { return this.service.quote(dto, user); }
  @Get('pending-payments') @RequirePermission('SALES_PAYMENT_COLLECT') pendingPayments(@CurrentUser() user: TenantPrincipal) { return this.service.pendingPayments(user); }
  @Get('pending-payments/page') @RequirePermission('SALES_PAYMENT_COLLECT') pendingPaymentsPage(@Query('page') page: string, @Query('limit') limit: string, @Query('search') search: string, @Query('status') status: string, @CurrentUser() user: TenantPrincipal) { return this.service.pendingPaymentsPage(user, Number(page), Number(limit), search ?? '', status ?? 'ALL'); }
  @Get('payment-receipts') @RequirePermission('SALES_PAYMENT_COLLECT') collectionHistory(@CurrentUser() user: TenantPrincipal) { return this.service.collectionHistory(user); }
  @Get('payment-receipts/page') @RequirePermission('SALES_PAYMENT_COLLECT') collectionHistoryPage(@Query('page') page: string, @Query('limit') limit: string, @Query('search') search: string, @CurrentUser() user: TenantPrincipal) { return this.service.collectionHistoryPage(user, Number(page), Number(limit), search ?? ''); }
  @Get('payment-breakdown') @RequirePermission('SALES_INVOICE_VIEW') paymentBreakdown(@CurrentUser() user: TenantPrincipal) { return this.service.paymentBreakdown(user); }
  @Get('history') @RequirePermission('SALES_INVOICE_VIEW') history(@Query('page') page: string, @Query('limit') limit: string, @Query('search') search: string, @Query('recordType') recordType: string, @Query('status') status: string, @CurrentUser() user: TenantPrincipal) { return this.service.history(user, Number(page), Number(limit), search ?? '', recordType ?? 'ALL', status ?? 'ALL'); }
  @Post(':id/payments') @RequirePermission('SALES_PAYMENT_COLLECT') receivePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveInvoicePaymentDto, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) { return this.service.receivePayment(id, dto, user, credential); }
  @Get(':id') @RequirePermission('SALES_INVOICE_VIEW') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post(':id/reprint') @RequirePermission('SALES_INVOICE_VIEW') reprint(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.reprint(id, user); }
  @Post() @RequirePermission('SALES_BILLING') create(@Body() dto: CreateInvoiceDto, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user, credential); }
}
