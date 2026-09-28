import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CustomerService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customers.dto';
import { UpdateCustomerDto } from './dto/update-customers.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('customers')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get()
  @RequirePermission('CUSTOMER_VIEW')
  findAll(@CurrentUser() user: AuthPrincipal, @Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string, @Query('status') status?: string) {
    if (!page && !limit && search === undefined && status === undefined) return this.service.findAll(user.tenantId);
    return this.service.findPage(user.tenantId, Number(page || 1), Number(limit || 20), search || '', status || '');
  }

  @Get(':id')
  @RequirePermission('CUSTOMER_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @RequirePermission('CUSTOMER_CREATE')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  @RequirePermission('CUSTOMER_UPDATE')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  @RequirePermission('CUSTOMER_DEACTIVATE')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
