import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreateInvoiceRefundDto } from './dto/create-invoice-refund.dto';
import { ReverseInvoicePaymentDto } from './dto/reverse-invoice-payment.dto';
import { InvoiceRefundsService } from './invoice-refunds.service';
import { CreateInvoiceAdjustmentDto } from './dto/create-invoice-adjustment.dto';

@Controller()
@UseGuards(TenantAuthGuard)
export class InvoiceRefundsController {
  constructor(private readonly service: InvoiceRefundsService) {}
  @Get('invoice-refunds') list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get('invoice-refunds/:id') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post('invoice-refunds') create(@Body() dto: CreateInvoiceRefundDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
  @Get('invoice-adjustments') listAdjustments(@CurrentUser() user: TenantPrincipal) { return this.service.listAdjustments(user); }
  @Post('invoice-adjustments') createAdjustment(@Body() dto: CreateInvoiceAdjustmentDto, @CurrentUser() user: TenantPrincipal) { return this.service.createAdjustment(dto, user); }
  @Get('invoices/:id/refundable') refundable(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.refundableInvoice(id, user); }
  @Post('invoices/:invoiceId/payments/:paymentId/reverse') reversePayment(@Param('invoiceId', ParseIntPipe) invoiceId: number, @Param('paymentId', ParseIntPipe) paymentId: number, @Body() dto: ReverseInvoicePaymentDto, @CurrentUser() user: TenantPrincipal) { return this.service.reversePayment(invoiceId, paymentId, dto, user); }
}
