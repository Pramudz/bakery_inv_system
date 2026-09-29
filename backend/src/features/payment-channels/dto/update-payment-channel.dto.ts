import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentChannelDto } from './create-payment-channel.dto';

export class UpdatePaymentChannelDto extends PartialType(CreatePaymentChannelDto) {}
