import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { UserSessionService } from './user-sessions.service';
import { CreateUserSessionDto } from './dto/create-user-sessions.dto';
import { UpdateUserSessionDto } from './dto/update-user-sessions.dto';
@Controller('user-sessions')
export class UserSessionController {
  constructor(private readonly service:UserSessionService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number) { return this.service.findOne(id); }
  @Post() create(@Body() dto:CreateUserSessionDto) { return this.service.create(dto); }
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateUserSessionDto) { return this.service.update(id,dto); }
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number) { return this.service.deactivate(id); }
}
