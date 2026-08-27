import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateInvoiceDetailDto {
  @Type(() => Number) @IsInt() @IsPositive() productId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPercentage?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;
}

export class CreateInvoicePaymentDto {
  @Type(() => Number) @IsInt() @IsPositive() paymentMethodId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
}

export class CreateInvoiceDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() customerId?: number;
  @IsIn(['RETAIL', 'WHOLESALE']) saleType!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateInvoiceDetailDto) details!: CreateInvoiceDetailDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoicePaymentDto) payments?: CreateInvoicePaymentDto[];
}
