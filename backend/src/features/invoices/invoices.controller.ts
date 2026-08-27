import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(TenantAuthGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}
  @Get() list(@CurrentUser() user: TenantPrincipal) { return this.service.list(user); }
  @Get('catalog') catalog(@Query('locationId', ParseIntPipe) locationId: number, @CurrentUser() user: TenantPrincipal) { return this.service.catalog(locationId, user); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.get(id, user); }
  @Post() create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: TenantPrincipal) { return this.service.create(dto, user); }
}
