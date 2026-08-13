import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ProductSupplierService } from './product-suppliers.service';
import { CreateProductSupplierDto } from './dto/create-product-suppliers.dto';
import { UpdateProductSupplierDto } from './dto/update-product-suppliers.dto';

@Controller('product-suppliers')
export class ProductSupplierController {
  constructor(private readonly service: ProductSupplierService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() create(@Body() dto: CreateProductSupplierDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductSupplierDto) { return this.service.update(id, dto); }
  @Patch(':id/deactivate') deactivate(@Param('id', ParseIntPipe) id: number) { return this.service.deactivate(id); }
}
