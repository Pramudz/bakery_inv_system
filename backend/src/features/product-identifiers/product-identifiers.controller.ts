import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ProductIdentifierService } from './product-identifiers.service';
import { CreateProductIdentifierDto } from './dto/create-product-identifiers.dto';
import { UpdateProductIdentifierDto } from './dto/update-product-identifiers.dto';
@Controller('product-identifiers')
export class ProductIdentifierController {
  constructor(private readonly service:ProductIdentifierService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateProductIdentifierDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateProductIdentifierDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
