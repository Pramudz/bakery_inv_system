import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { PriceListService } from './price-lists.service';
import { CreatePriceListDto } from './dto/create-price-lists.dto';
import { UpdatePriceListDto } from './dto/update-price-lists.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('price-lists')
@UseGuards(TenantAuthGuard)
export class PriceListController {
  constructor(private readonly service: PriceListService) {}

  @Get()
  findAll(@CurrentUser() user: AuthPrincipal) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(@Body() dto: CreatePriceListDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePriceListDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
