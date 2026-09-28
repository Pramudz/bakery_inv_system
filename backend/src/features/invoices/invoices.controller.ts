import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';
import { ReceiveInvoicePaymentDto } from './dto/receive-invoice-payment.dto';

@Controller('invoices')
@UseGuards(TenantAuthGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}
  @Get() list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get('catalog') catalog(@Query('locationId', ParseIntPipe) locationId: number, @CurrentUser() user: TenantPrincipal) { return this.service.catalog(locationId, user); }
  @Get('pending-payments') pendingPayments(@CurrentUser() user: TenantPrincipal) { return this.service.pendingPayments(user); }
  @Get('payment-receipts') collectionHistory(@CurrentUser() user: TenantPrincipal) { return this.service.collectionHistory(user); }
  @Post(':id/payments') receivePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveInvoicePaymentDto, @CurrentUser() user: TenantPrincipal) { return this.service.receivePayment(id, dto, user); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post() create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
}
