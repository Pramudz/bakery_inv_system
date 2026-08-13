import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CategoryService } from './categories.service';
import { CreateCategoryDto } from './dto/create-categories.dto';
import { UpdateCategoryDto } from './dto/update-categories.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('categories')
@UseGuards(TenantAuthGuard)
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  @Get()
  findAll(@CurrentUser() user: AuthPrincipal) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.deactivate(id, user.tenantId);
  }
}
