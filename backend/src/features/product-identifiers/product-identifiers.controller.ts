import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ProductIdentifierService } from './product-identifiers.service';
import { CreateProductIdentifierDto } from './dto/create-product-identifiers.dto';
import { UpdateProductIdentifierDto } from './dto/update-product-identifiers.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('product-identifiers')
@UseGuards(TenantAuthGuard)
export class ProductIdentifierController {
  constructor(private readonly service: ProductIdentifierService) {}
  @Get() findAll(@CurrentUser() user: AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreateProductIdentifierDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductIdentifierDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.deactivate(id,user.tenantId); }
}
