import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceList } from './price-lists.entity';
import { PriceListController } from './price-lists.controller';
import { PriceListService } from './price-lists.service';
@Module({imports:[TypeOrmModule.forFeature([PriceList])],controllers:[PriceListController],providers:[PriceListService],exports:[PriceListService]})
export class PriceListModule {}
