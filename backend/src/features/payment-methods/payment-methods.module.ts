import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethod } from './payment-methods.entity';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentProcessingService } from './payment-processing.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentMethod])],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService, PaymentProcessingService],
  exports: [PaymentMethodsService, PaymentProcessingService],
})
export class PaymentMethodsModule {}
