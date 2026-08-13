import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './permissions.entity';
import { PermissionController } from './permissions.controller';
import { PermissionService } from './permissions.service';
@Module({imports:[TypeOrmModule.forFeature([Permission])],controllers:[PermissionController],providers:[PermissionService],exports:[PermissionService]})
export class PermissionModule {}
