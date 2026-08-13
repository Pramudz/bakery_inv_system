import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ProductUnitService } from './product-units.service';
import { CreateProductUnitDto } from './dto/create-product-units.dto';
import { UpdateProductUnitDto } from './dto/update-product-units.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('product-units')
@UseGuards(TenantAuthGuard)
export class ProductUnitController {
  constructor(private readonly service: ProductUnitService) {}
  @Get() findAll(@CurrentUser() user: AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreateProductUnitDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductUnitDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.deactivate(id,user.tenantId); }
}
