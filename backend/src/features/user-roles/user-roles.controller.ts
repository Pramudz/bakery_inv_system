import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { UserRoleService } from './user-roles.service';
import { CreateUserRoleDto } from './dto/create-user-roles.dto';
import { UpdateUserRoleDto } from './dto/update-user-roles.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('user-roles')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class UserRoleController {
  constructor(private readonly service:UserRoleService) {}
  @Get() @RequirePermission('USER_VIEW') findAll(@CurrentUser() user:AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') @RequirePermission('USER_VIEW') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() @RequirePermission('USER_UPDATE') create(@Body() dto:CreateUserRoleDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') @RequirePermission('USER_UPDATE') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateUserRoleDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
}
