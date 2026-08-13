import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';

import { AuthGuard } from './auth-guard';
import { PlatformGuard } from './platform.guard';
import { TenantAuthGuard } from './tenant-auth.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSession, UserSession])],
  providers: [AuthGuard, PlatformGuard, TenantAuthGuard],
  exports: [AuthGuard, PlatformGuard, TenantAuthGuard, TypeOrmModule],
})
export class SecurityModule {}
