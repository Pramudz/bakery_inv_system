import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ProductLocationService } from './product-locations.service';
import { CreateProductLocationDto } from './dto/create-product-locations.dto';
import { UpdateProductLocationDto } from './dto/update-product-locations.dto';
@Controller('product-locations')
export class ProductLocationController {
  constructor(private readonly service:ProductLocationService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateProductLocationDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductLocationDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
