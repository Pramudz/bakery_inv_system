import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
@Controller('users')
export class UsersController {
  constructor(private readonly service:UsersService){}
  @Get() findAll(){return this.service.findAll();}
  @Get(':id') findOne(@Param('id',ParseIntPipe) id:number){return this.service.findOne(id);}
  @Post() create(@Body() dto:CreateUserDto){return this.service.create(dto);}
  @Put(':id') update(@Param('id',ParseIntPipe) id:number,@Body() dto:UpdateUserDto){return this.service.update(id,dto);}
  @Patch(':id/deactivate') deactivate(@Param('id',ParseIntPipe) id:number){return this.service.deactivate(id);}
}
