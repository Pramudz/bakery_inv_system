import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('bootstrap')
  async bootstrap(
    @Body() dto: BootstrapDto,
  ) {
    return this.authService.bootstrap(dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }
}