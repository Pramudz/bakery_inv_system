import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentifierType } from './identifier-types.entity';
import { IdentifierTypeController } from './identifier-types.controller';
import { IdentifierTypeService } from './identifier-types.service';
@Module({imports:[TypeOrmModule.forFeature([IdentifierType])],controllers:[IdentifierTypeController],providers:[IdentifierTypeService],exports:[IdentifierTypeService]})
export class IdentifierTypeModule {}
