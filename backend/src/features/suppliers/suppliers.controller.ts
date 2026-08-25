import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SupplierService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-suppliers.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('suppliers')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Get()
  @RequirePermission('SUPPLIER_VIEW')
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    if (!page && !limit && search === undefined && status === undefined) {
      return this.service.findAll(user.tenantId);
    }
    return this.service.findPage(
      user.tenantId,
      Number(page || 1),
      Number(limit || 20),
      search || '',
      status || '',
    );
  }

  @Get(':id')
  @RequirePermission('SUPPLIER_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @RequirePermission('SUPPLIER_CREATE')
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  @RequirePermission('SUPPLIER_UPDATE')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  @RequirePermission('SUPPLIER_DEACTIVATE')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
