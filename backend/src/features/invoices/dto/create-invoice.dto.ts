import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateInvoiceDetailDto {
  @Type(() => Number) @IsInt() @IsPositive() productId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
  // Legacy browser amounts are accepted for compatibility but never used as authority.
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPercentage?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() quotedPriceListItemId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() quotedPriceListItemDiscountId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedUnitPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedDiscountAmount?: number;
}

export class CreateInvoicePaymentDto {
  @Type(() => Number) @IsInt() @IsPositive() paymentMethodId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() paymentChannelId?: number;
}

export class CreateInvoiceDto {
  @IsUUID('4') checkoutKey!: string;
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() customerId?: number;
  @IsIn(['RETAIL', 'WHOLESALE']) saleType!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateInvoiceDetailDto) details!: CreateInvoiceDetailDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoicePaymentDto) payments?: CreateInvoicePaymentDto[];
  @IsOptional() @IsBoolean() sellOnCredit?: boolean;
  @IsOptional() @IsBoolean() acceptPriceChanges?: boolean;
}
