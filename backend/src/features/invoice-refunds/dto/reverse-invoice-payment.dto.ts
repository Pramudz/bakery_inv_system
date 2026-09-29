import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ReverseInvoicePaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() replacementPaymentMethodId?: number;
  @ValidateIf((dto) => dto.replacementPaymentMethodId !== undefined) @Type(() => Number) @IsNumber() @IsPositive() replacementAmount?: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() replacementPaymentChannelId?: number;
}
