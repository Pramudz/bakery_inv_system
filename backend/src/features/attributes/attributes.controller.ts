import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AttributeService } from './attributes.service';
import { CreateAttributeDto } from './dto/create-attributes.dto';
import { UpdateAttributeDto } from './dto/update-attributes.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';

@Controller('attributes')
@UseGuards(TenantAuthGuard)
export class AttributeController {
  constructor(private readonly service: AttributeService) {}

  @Get()
  findAll(@CurrentUser() user: TenantPrincipal) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateAttributeDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAttributeDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
