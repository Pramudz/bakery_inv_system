import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceListItem } from './price-list-items.entity';
import { PriceListItemController } from './price-list-items.controller';
import { PriceListItemService } from './price-list-items.service';
@Module({imports:[TypeOrmModule.forFeature([PriceListItem])],controllers:[PriceListItemController],providers:[PriceListItemService],exports:[PriceListItemService]})
export class PriceListItemModule {}
