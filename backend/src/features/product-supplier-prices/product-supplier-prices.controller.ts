import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ProductSupplierPricesService } from './product-supplier-prices.service';
import { CreateProductSupplierPriceDto } from './dto/create-product-supplier-price.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('product-supplier-prices')
@UseGuards(TenantAuthGuard)
export class ProductSupplierPricesController {
  constructor(private readonly service: ProductSupplierPricesService) {}
  @Get() findAll(@CurrentUser() user: AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreateProductSupplierPriceDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
}
