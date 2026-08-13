import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { IdentifierTypeService } from './identifier-types.service';
import { CreateIdentifierTypeDto } from './dto/create-identifier-types.dto';
import { UpdateIdentifierTypeDto } from './dto/update-identifier-types.dto';
@Controller('identifier-types')
export class IdentifierTypeController {
  constructor(private readonly service:IdentifierTypeService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateIdentifierTypeDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateIdentifierTypeDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
