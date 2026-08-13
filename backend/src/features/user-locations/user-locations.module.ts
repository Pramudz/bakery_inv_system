import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserLocation } from './user-locations.entity';

@Module({ imports: [TypeOrmModule.forFeature([UserLocation])], exports: [TypeOrmModule] })
export class UserLocationModule {}
