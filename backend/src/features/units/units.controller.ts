import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { UnitOfMeasureService } from './units.service';
import { CreateUnitOfMeasureDto } from './dto/create-units.dto';
import { UpdateUnitOfMeasureDto } from './dto/update-units.dto';

@Controller('units')
export class UnitOfMeasureController {
  constructor(private readonly service: UnitOfMeasureService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() create(@Body() dto: CreateUnitOfMeasureDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUnitOfMeasureDto) { return this.service.update(id, dto); }
  @Patch(':id/deactivate') deactivate(@Param('id', ParseIntPipe) id: number) { return this.service.deactivate(id); }
}
