import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentChannel } from './payment-channel.entity';
import { PaymentChannelsController } from './payment-channels.controller';
import { PaymentChannelsService } from './payment-channels.service';

@Module({ imports: [TypeOrmModule.forFeature([PaymentChannel])], controllers: [PaymentChannelsController], providers: [PaymentChannelsService], exports: [PaymentChannelsService] })
export class PaymentChannelsModule {}
