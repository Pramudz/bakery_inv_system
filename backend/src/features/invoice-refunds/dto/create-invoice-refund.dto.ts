import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CreateRefundDetailDto {
  @Type(() => Number) @IsInt() @IsPositive() invoiceDetailId!: number;
  @Type(() => Number) @IsInt() @IsPositive() quantity!: number;
  @IsOptional() @IsBoolean() returnToStock?: boolean;
}
export class CreateRefundPaymentDto {
  @Type(() => Number) @IsInt() @IsPositive() paymentMethodId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() paymentChannelId?: number;
}
export class CreateInvoiceRefundDto {
  @Type(() => Number) @IsInt() @IsPositive() invoiceId!: number;
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateRefundDetailDto) details!: CreateRefundDetailDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateRefundPaymentDto) payments?: CreateRefundPaymentDto[];
}
