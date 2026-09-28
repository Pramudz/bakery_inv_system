import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Invoice } from './invoice.entity';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PriceListItemDiscountModule } from '../price-list-item-discounts/price-list-item-discounts.module';
import { PosPricingService } from './pos-pricing.service';

@Module({ imports: [TypeOrmModule.forFeature([Invoice, InvoiceDetail, InvoicePayment]), PriceListItemDiscountModule], controllers: [InvoicesController], providers: [InvoicesService, PosPricingService], exports: [InvoicesService] })
export class InvoicesModule {}
