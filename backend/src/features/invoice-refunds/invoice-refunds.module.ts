import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicePaymentReversal } from './invoice-payment-reversal.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceRefundsController } from './invoice-refunds.controller';
import { InvoiceRefundsService } from './invoice-refunds.service';
import { InvoiceAdjustment } from './invoice-adjustment.entity';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PosRegistersModule } from '../pos-registers/pos-registers.module';

@Module({ imports: [TypeOrmModule.forFeature([InvoiceRefund, InvoiceRefundDetail, InvoiceRefundPayment, InvoicePaymentReversal, InvoiceAdjustment]), PaymentMethodsModule, PosRegistersModule], controllers: [InvoiceRefundsController], providers: [InvoiceRefundsService] })
export class InvoiceRefundsModule {}
