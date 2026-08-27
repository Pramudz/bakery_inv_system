import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateInvoiceAdjustmentDto {
  @Type(() => Number) @IsInt() @IsPositive() invoiceId!: number;
  @Type(() => Number) @IsInt() @IsPositive() invoiceDetailId!: number;
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) correctedDiscountPercentage?: number;
  @ValidateIf((dto) => dto.correctedDiscountPercentage === undefined) @Type(() => Number) @IsNumber() @Min(0) correctedDiscountAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() paymentMethodId?: number;
}
