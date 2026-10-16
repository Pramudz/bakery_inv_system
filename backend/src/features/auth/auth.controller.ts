import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';
import { TenantLoginDto } from './dto/tenant-login.dto';
import { assertDevelopmentBootstrapEnabled } from './development-bootstrap';
import { AuthGuard } from './auth-guard';
import { TenantAuthGuard } from './tenant-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { PlatformPrincipal, TenantPrincipal } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap')
  async bootstrap(@Body() dto: BootstrapDto) {
    assertDevelopmentBootstrapEnabled();
    return this.authService.bootstrap(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('tenant-login')
  async tenantLogin(@Body() dto: TenantLoginDto) {
    return this.authService.tenantLogin(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logoutPlatform(@Headers('authorization') authorization: string | undefined) {
    return this.authService.logout(authorization, 'PLATFORM');
  }

  @Post('change-password')
  // Self-service password changes derive identity from the authenticated session.
  @UseGuards(AuthGuard)
  changePlatformPassword(@CurrentUser() user: PlatformPrincipal, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  @Post('tenant-change-password')
  @UseGuards(TenantAuthGuard)
  changeTenantPassword(@CurrentUser() user: TenantPrincipal, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  @Post('tenant-logout')
  @UseGuards(TenantAuthGuard)
  logoutTenant(@Headers('authorization') authorization: string | undefined) {
    return this.authService.logout(authorization, 'TENANT');
  }
}
