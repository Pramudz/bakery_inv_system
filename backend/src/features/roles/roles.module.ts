import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './roles.entity';
import { RoleController } from './roles.controller';
import { RoleService } from './roles.service';
@Module({imports:[TypeOrmModule.forFeature([Role])],controllers:[RoleController],providers:[RoleService],exports:[RoleService]})
export class RoleModule {}
