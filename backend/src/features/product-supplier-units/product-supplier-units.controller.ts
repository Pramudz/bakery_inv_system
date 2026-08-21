import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ProductSupplierUnitsService } from './product-supplier-units.service';
import { CreateProductSupplierUnitDto } from './dto/create-product-supplier-unit.dto';
import { UpdateProductSupplierUnitDto } from './dto/update-product-supplier-unit.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('product-supplier-units')
@UseGuards(TenantAuthGuard)
export class ProductSupplierUnitsController {
  constructor(private readonly service: ProductSupplierUnitsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthPrincipal) {
    return this.service.findAll(user.tenantId);
  }

  // Put this before @Get(':id'), otherwise ":id" captures "product-supplier".
  @Get('product-supplier/:productSupplierId')
  findByProductSupplier(
    @Param('productSupplierId', ParseIntPipe) productSupplierId: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.findAll(user.tenantId, productSupplierId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(
    @Body() dto: CreateProductSupplierUnitDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.create(dto, user.tenantId);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductSupplierUnitDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.deactivate(id, user.tenantId);
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.activate(id, user.tenantId);
  }
}