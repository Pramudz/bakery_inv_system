import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { PriceListItemService } from './price-list-items.service';
import { CreatePriceListItemDto } from './dto/create-price-list-items.dto';
import { UpdatePriceListItemDto } from './dto/update-price-list-items.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('price-list-items')
@UseGuards(TenantAuthGuard)
export class PriceListItemController {
  constructor(private readonly service: PriceListItemService) {}
  @Get() findAll(@CurrentUser() user: AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreatePriceListItemDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdatePriceListItemDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.deactivate(id,user.tenantId); }
}
