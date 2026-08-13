import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attribute } from './attributes.entity';
import { AttributeController } from './attributes.controller';
import { AttributeService } from './attributes.service';
@Module({imports:[TypeOrmModule.forFeature([Attribute])],controllers:[AttributeController],providers:[AttributeService],exports:[AttributeService]})
export class AttributeModule {}
