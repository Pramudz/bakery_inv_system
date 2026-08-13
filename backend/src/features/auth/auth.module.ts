import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformUser } from '../platform-users/platform-users.entity';
import { PlatformUsersModule } from '../platform-users/platform-users.module';
import { PlatformSessionsModule } from '../platform-sessions/platform-sessions.module';
import { User } from '../users/user.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth-guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformUser, User, UserSession]),
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