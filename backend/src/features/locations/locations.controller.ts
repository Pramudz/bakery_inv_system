import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { LocationService } from './locations.service';
import { CreateLocationDto } from './dto/create-locations.dto';
import { UpdateLocationDto } from './dto/update-locations.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('locations')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class LocationController {
  constructor(private readonly service: LocationService) {}

  @Get()
  @RequirePermission('LOCATION_VIEW')
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
  @RequirePermission('LOCATION_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @RequirePermission('LOCATION_CREATE')
  create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  @RequirePermission('LOCATION_UPDATE')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  @RequirePermission('LOCATION_DEACTIVATE')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }

  @Patch(':id/activate')
  @RequirePermission('LOCATION_UPDATE')
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.activate(id, user.tenantId);
  }
}
