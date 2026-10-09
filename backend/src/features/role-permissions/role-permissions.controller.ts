import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { RolePermissionService } from './role-permissions.service';
import { CreateRolePermissionDto } from './dto/create-role-permissions.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permissions.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('role-permissions')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class RolePermissionController {
  constructor(private readonly service:RolePermissionService) {}
  @Get() @RequirePermission('ROLE_PERMISSION_VIEW') findAll(@CurrentUser() user:AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') @RequirePermission('ROLE_PERMISSION_VIEW') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() @RequirePermission('ROLE_PERMISSION_UPDATE') create(@Body() dto:CreateRolePermissionDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') @RequirePermission('ROLE_PERMISSION_UPDATE') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateRolePermissionDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
}
