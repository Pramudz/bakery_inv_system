import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ProductAttributesService } from './product-attributes.service';
import { CreateProductAttributesDto } from './dto/create-product-attributes.dto';
import { UpdateProductAttributesDto } from './dto/update-product-attributes.dto';
@Controller('product-attributes')
export class ProductAttributesController {
  constructor(private readonly service:ProductAttributesService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateProductAttributesDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductAttributesDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
