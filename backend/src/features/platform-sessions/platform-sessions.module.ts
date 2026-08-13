import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformSession } from './platform-sessions.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformSession]),
  ],
  exports: [
    TypeOrmModule,
  ],
})
export class PlatformSessionsModule {}