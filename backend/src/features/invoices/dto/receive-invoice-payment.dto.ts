import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReceiveInvoicePaymentDto {
  @Type(() => Number) @IsInt() @IsPositive() paymentMethodId!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @IsUUID('4') collectionKey!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
}
