import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { RolePermissionService } from './role-permissions.service';
import { CreateRolePermissionDto } from './dto/create-role-permissions.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permissions.dto';
@Controller('role-permissions')
export class RolePermissionController {
  constructor(private readonly service:RolePermissionService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateRolePermissionDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateRolePermissionDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
