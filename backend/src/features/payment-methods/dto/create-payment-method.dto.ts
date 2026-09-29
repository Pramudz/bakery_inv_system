import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PaymentMethodType } from '../payment-methods.entity';

export class CreatePaymentMethodDto {
  @IsString() @IsNotEmpty() @MaxLength(150)
  paymentMethodName!: string;

  @IsEnum(PaymentMethodType)
  paymentMethodType!: PaymentMethodType;
}
