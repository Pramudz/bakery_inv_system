import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ModuleEntityService } from './modules.service';
import { CreateModuleEntityDto } from './dto/create-modules.dto';
import { UpdateModuleEntityDto } from './dto/update-modules.dto';
@Controller('modules')
export class ModuleEntityController {
  constructor(private readonly service:ModuleEntityService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateModuleEntityDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateModuleEntityDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
