import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ProductAttributesService } from './product-attributes.service';
import { CreateProductAttributesDto } from './dto/create-product-attributes.dto';
import { UpdateProductAttributesDto } from './dto/update-product-attributes.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('product-attributes')
@UseGuards(TenantAuthGuard)
export class ProductAttributesController {
  constructor(private readonly service: ProductAttributesService) {}
  @Get() findAll(@CurrentUser() user: AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreateProductAttributesDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductAttributesDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.deactivate(id,user.tenantId); }
}
