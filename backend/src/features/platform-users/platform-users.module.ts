import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformUser } from './platform-users.entity';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';
import { PlatformSessionsModule } from '../platform-sessions/platform-sessions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformUser]),
    PlatformSessionsModule,
  ],
  controllers: [
    PlatformUsersController,
  ],
  providers: [
    PlatformUsersService,
  ],
  exports: [
    PlatformUsersService,
  ],
})
export class PlatformUsersModule {}