import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class ReverseInvoicePaymentDto {
  @IsUUID('4') reversalKey?: string;
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() replacementPaymentMethodId?: number;
  @ValidateIf((dto) => dto.replacementPaymentMethodId !== undefined) @Type(() => Number) @IsNumber() @IsPositive() replacementAmount?: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() replacementPaymentChannelId?: number;
  @IsOptional() @IsBoolean() cashPayout?: boolean;
}
