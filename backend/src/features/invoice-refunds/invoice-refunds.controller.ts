import { Body, Controller, Get, Headers, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreateInvoiceRefundDto } from './dto/create-invoice-refund.dto';
import { ReverseInvoicePaymentDto } from './dto/reverse-invoice-payment.dto';
import { InvoiceRefundsService } from './invoice-refunds.service';
import { CreateInvoiceAdjustmentDto } from './dto/create-invoice-adjustment.dto';
import { MasterRefundPayoutDto, MasterReversalPayoutDto } from './dto/master-payout.dto';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { PosCostVisibilityInterceptor } from '../invoices/pos-cost-visibility.interceptor';

@Controller()
@UseGuards(TenantAuthGuard, PermissionGuard)
@UseInterceptors(PosCostVisibilityInterceptor)
export class InvoiceRefundsController {
  constructor(private readonly service: InvoiceRefundsService) {}
  @Get('invoice-refunds') @RequirePermission('SALES_REFUND_VIEW') list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get('invoice-refunds/page') @RequirePermission('SALES_REFUND_VIEW') page(@Query('page') page: string, @Query('limit') limit: string, @Query('search') search: string, @CurrentUser() user: TenantPrincipal) { return this.service.page(user, Number(page), Number(limit), search ?? ''); }
  @Get('invoice-refunds/sale-lookup') @RequirePermission('SALES_REFUND_VIEW') lookupSale(@Query('businessDate') businessDate: string, @Query('locationCode') locationCode: string, @Query('registerCode') registerCode: string, @Query('billNo') billNo: string, @CurrentUser() user: TenantPrincipal) { return this.service.lookupSale(businessDate, locationCode, registerCode, Number(billNo), user); }
  @Get('invoice-refunds/by-key/:key') @RequirePermission('SALES_REFUND_CREATE') outcomeByKey(@Param('key', new ParseUUIDPipe({ version: '4' })) key: string, @Query('invoiceId', ParseIntPipe) invoiceId: number, @CurrentUser() user: TenantPrincipal) { return this.service.outcomeByKey(invoiceId, key, user); }
  @Get('invoice-refunds/:id') @RequirePermission('SALES_REFUND_VIEW') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post('invoice-refunds/:id/reprint') @RequirePermission('SALES_REFUND_VIEW') reprint(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.reprint(id, user); }
  @Post('invoice-refunds') @RequirePermission('SALES_REFUND_CREATE') create(@Body() dto: CreateInvoiceRefundDto, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user, credential); }
  @Get('invoice-adjustments') @RequirePermission('SALES_ADJUSTMENT_VIEW') listAdjustments(@CurrentUser() user: TenantPrincipal) { return this.service.listAdjustments(user); }
  @Post('invoice-adjustments') @RequirePermission('SALES_ADJUSTMENT_CREATE') createAdjustment(@Body() dto: CreateInvoiceAdjustmentDto, @CurrentUser() user: TenantPrincipal) { return this.service.createAdjustment(dto, user); }
  @Get('invoices/:id/refundable') @RequirePermission('SALES_REFUND_VIEW') refundable(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.refundableInvoice(id, user); }
  @Post('invoices/:invoiceId/payments/:paymentId/reverse') @RequirePermission('SALES_PAYMENT_REVERSE') reversePayment(@Param('invoiceId', ParseIntPipe) invoiceId: number, @Param('paymentId', ParseIntPipe) paymentId: number, @Body() dto: ReverseInvoicePaymentDto, @Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) { return this.service.reversePayment(invoiceId, paymentId, dto, user, credential); }
  @Post('invoice-refunds/:id/master-payout') @RequirePermission('SALES_REFUND_CREATE', 'SALES_REGISTER_PAYOUT') masterRefundPayout(@Param('id', ParseIntPipe) id: number, @Body() dto: MasterRefundPayoutDto, @CurrentUser() user: TenantPrincipal) { return this.service.recordMasterRefundPayout(id, dto, user); }
  @Post('invoice-payment-reversals/:id/master-payout') @RequirePermission('SALES_PAYMENT_REVERSE', 'SALES_REGISTER_PAYOUT') masterReversalPayout(@Param('id', ParseIntPipe) id: number, @Body() dto: MasterReversalPayoutDto, @CurrentUser() user: TenantPrincipal) { return this.service.recordMasterReversalPayout(id, dto, user); }
}
