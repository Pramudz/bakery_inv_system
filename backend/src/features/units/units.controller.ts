import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { UnitOfMeasureService } from './units.service';
import { CreateUnitOfMeasureDto } from './dto/create-units.dto';
import { UpdateUnitOfMeasureDto } from './dto/update-units.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('units')
@UseGuards(TenantAuthGuard)
export class UnitOfMeasureController {
  constructor(private readonly service: UnitOfMeasureService) {}

  @Get()
  findAll(@CurrentUser() user: AuthPrincipal) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateUnitOfMeasureDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUnitOfMeasureDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
