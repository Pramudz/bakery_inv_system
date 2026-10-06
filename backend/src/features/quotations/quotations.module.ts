import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceListItemDiscountModule } from '../price-list-item-discounts/price-list-item-discounts.module';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';
import { PosPricingService } from '../invoices/pos-pricing.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { InvoicesService } from '../invoices/invoices.service';
import { Quotation } from './quotation.entity';
import { QuotationLine } from './quotation-line.entity';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({ imports: [TypeOrmModule.forFeature([Quotation, QuotationLine]), NumberSequencesModule, PriceListItemDiscountModule, InvoicesModule], controllers: [QuotationsController], providers: [QuotationsService, PosPricingService] })
export class QuotationsModule {}
