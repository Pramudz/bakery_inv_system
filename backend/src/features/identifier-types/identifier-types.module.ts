import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentifierType } from './identifier-types.entity';
import { IdentifierTypeController, PlatformIdentifierTypesController } from './identifier-types.controller';
import { IdentifierTypeService } from './identifier-types.service';
@Module({imports:[TypeOrmModule.forFeature([IdentifierType])],controllers:[IdentifierTypeController, PlatformIdentifierTypesController],providers:[IdentifierTypeService],exports:[IdentifierTypeService]})
export class IdentifierTypeModule {}
