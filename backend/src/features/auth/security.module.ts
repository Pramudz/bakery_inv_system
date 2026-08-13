import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { UserLocation } from '../user-locations/user-locations.entity';

import { AuthGuard } from './auth-guard';
import { PlatformGuard } from './platform.guard';
import { TenantAuthGuard } from './tenant-auth.guard';
import { PermissionGuard } from './permission.guard';
import { AuthorizationCatalogService } from './authorization-catalog.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSession, UserSession, UserLocation])],
  providers: [AuthGuard, PlatformGuard, TenantAuthGuard, PermissionGuard, AuthorizationCatalogService],
  exports: [AuthGuard, PlatformGuard, TenantAuthGuard, PermissionGuard, TypeOrmModule],
})
export class SecurityModule {}
