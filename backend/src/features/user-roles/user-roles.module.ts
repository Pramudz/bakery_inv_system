import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRole } from './user-roles.entity';
import { UserRoleController } from './user-roles.controller';
import { UserRoleService } from './user-roles.service';
@Module({imports:[TypeOrmModule.forFeature([UserRole])],controllers:[UserRoleController],providers:[UserRoleService],exports:[UserRoleService]})
export class UserRoleModule {}
