import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleEntity } from './modules.entity';
import { ModuleEntityController } from './modules.controller';
import { ModuleEntityService } from './modules.service';
@Module({imports:[TypeOrmModule.forFeature([ModuleEntity])],controllers:[ModuleEntityController],providers:[ModuleEntityService],exports:[ModuleEntityService]})
export class ModuleEntityModule {}
