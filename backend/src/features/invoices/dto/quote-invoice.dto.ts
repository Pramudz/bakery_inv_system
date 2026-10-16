import { RetailDiscountDto } from './retail-discount.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsPositive, ValidateNested } from 'class-validator';

export class QuoteInvoiceDetailDto {
  @IsOptional() @ValidateNested() @Type(() => RetailDiscountDto) retailDiscount?: RetailDiscountDto;
  @Type(() => Number) @IsInt() @IsPositive() productId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
}

export class QuoteInvoiceDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @IsIn(['RETAIL', 'WHOLESALE']) saleType!: 'RETAIL' | 'WHOLESALE';
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuoteInvoiceDetailDto)
  details!: QuoteInvoiceDetailDto[];
}
