import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { UserRoleService } from './user-roles.service';
import { CreateUserRoleDto } from './dto/create-user-roles.dto';
import { UpdateUserRoleDto } from './dto/update-user-roles.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('user-roles')
@UseGuards(TenantAuthGuard)
export class UserRoleController {
  constructor(private readonly service:UserRoleService) {}
  @Get() findAll(@CurrentUser() user:AuthPrincipal) { return this.service.findAll(user.tenantId); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthPrincipal) { return this.service.findOne(id,user.tenantId); }
  @Post() create(@Body() dto:CreateUserRoleDto,@CurrentUser() user:AuthPrincipal) { return this.service.create(dto,user.tenantId); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateUserRoleDto,@CurrentUser() user:AuthPrincipal) { return this.service.update(id,dto,user.tenantId); }
}
