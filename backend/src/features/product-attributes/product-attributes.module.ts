import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductAttributes } from './product-attributes.entity';
import { ProductAttributesController } from './product-attributes.controller';
import { ProductAttributesService } from './product-attributes.service';
@Module({imports:[TypeOrmModule.forFeature([ProductAttributes])],controllers:[ProductAttributesController],providers:[ProductAttributesService],exports:[ProductAttributesService]})
export class ProductAttributesModule {}
