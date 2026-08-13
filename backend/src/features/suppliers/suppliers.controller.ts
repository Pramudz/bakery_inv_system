import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { SupplierService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-suppliers.dto';

@Controller('suppliers')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() create(@Body() dto: CreateSupplierDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) { return this.service.update(id, dto); }
  @Patch(':id/deactivate') deactivate(@Param('id', ParseIntPipe) id: number) { return this.service.deactivate(id); }
}
