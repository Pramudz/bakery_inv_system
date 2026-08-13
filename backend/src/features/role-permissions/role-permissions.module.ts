import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolePermission } from './role-permissions.entity';
import { RolePermissionController } from './role-permissions.controller';
import { RolePermissionService } from './role-permissions.service';
@Module({imports:[TypeOrmModule.forFeature([RolePermission])],controllers:[RolePermissionController],providers:[RolePermissionService],exports:[RolePermissionService]})
export class RolePermissionModule {}
