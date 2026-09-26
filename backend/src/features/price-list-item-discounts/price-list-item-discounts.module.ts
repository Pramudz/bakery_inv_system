import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceListItemDiscount } from './price-list-item-discounts.entity';
import { DiscountEndController, PriceListItemDiscountController, SellingPriceResolutionController } from './price-list-item-discounts.controller';
import { PriceListItemDiscountService } from './price-list-item-discounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([PriceListItemDiscount, PriceListItem])],
  controllers: [PriceListItemDiscountController, DiscountEndController, SellingPriceResolutionController],
  providers: [PriceListItemDiscountService],
  exports: [PriceListItemDiscountService],
})
export class PriceListItemDiscountModule {}
