import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { PriceListItemService } from './price-list-items.service';
import { CreatePriceListItemDto } from './dto/create-price-list-items.dto';
import { UpdatePriceListItemDto } from './dto/update-price-list-items.dto';
@Controller('price-list-items')
export class PriceListItemController {
  constructor(private readonly service:PriceListItemService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreatePriceListItemDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdatePriceListItemDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
