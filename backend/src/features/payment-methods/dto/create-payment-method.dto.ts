import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString() @IsNotEmpty() @MaxLength(150)
  paymentMethodName!: string;
}
