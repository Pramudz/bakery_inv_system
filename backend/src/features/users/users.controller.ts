import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('users')
@UseGuards(TenantAuthGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthPrincipal) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
