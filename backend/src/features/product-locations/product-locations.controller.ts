import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ProductLocationService } from './product-locations.service';
import { CreateProductLocationDto } from './dto/create-product-locations.dto';
import { UpdateProductLocationDto } from './dto/update-product-locations.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('product-locations')
@UseGuards(TenantAuthGuard)
export class ProductLocationController {
  constructor(private readonly service: ProductLocationService) {}
  @Get() findAll(@CurrentUser() user: AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreateProductLocationDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductLocationDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.deactivate(id,user.tenantId); }
}
