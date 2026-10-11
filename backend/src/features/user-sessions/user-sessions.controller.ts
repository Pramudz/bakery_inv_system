import { Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth-guard';
import { PlatformGuard } from '../auth/platform.guard';
import { UserSessionService } from './user-sessions.service';

@Controller('user-sessions')
@UseGuards(AuthGuard, PlatformGuard)
export class UserSessionController {
  constructor(private readonly service: UserSessionService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Patch(':id/deactivate') deactivate(@Param('id', ParseIntPipe) id: number) { return this.service.deactivate(id); }
}
