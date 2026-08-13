import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformUser } from '../platform-users/platform-users.entity';
import { PlatformUsersModule } from '../platform-users/platform-users.module';
import { PlatformSessionsModule } from '../platform-sessions/platform-sessions.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth-guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformUser,]),
    PlatformUsersModule,
    PlatformSessionsModule,
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    AuthGuard,
  ],

  exports: [
    AuthService,
    AuthGuard,
  ],
})
export class AuthModule {}