import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { PriceListService } from './price-lists.service';
import { CreatePriceListDto } from './dto/create-price-lists.dto';
import { UpdatePriceListDto } from './dto/update-price-lists.dto';
@Controller('price-lists')
export class PriceListController {
  constructor(private readonly service:PriceListService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreatePriceListDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdatePriceListDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
