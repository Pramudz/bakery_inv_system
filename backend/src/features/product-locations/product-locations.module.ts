import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductLocation } from './product-locations.entity';
import { ProductLocationController } from './product-locations.controller';
import { ProductLocationService } from './product-locations.service';
@Module({imports:[TypeOrmModule.forFeature([ProductLocation])],controllers:[ProductLocationController],providers:[ProductLocationService],exports:[ProductLocationService]})
export class ProductLocationModule {}
