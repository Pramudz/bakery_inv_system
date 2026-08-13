import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformSession } from '../platform-sessions/platform-sessions.entity';

import { AuthGuard } from './auth-guard';
import { PlatformGuard } from './platform.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformSession]),
  ],

  providers: [
    AuthGuard,
    PlatformGuard,
  ],

  exports: [
    AuthGuard,
    PlatformGuard,
    TypeOrmModule,
  ],
})
export class SecurityModule {}