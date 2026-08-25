import { IsDateString, IsEnum, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { PriceListItemDiscountType } from '../price-list-item-discounts.entity';

const POSITIVE_DECIMAL = /^(?=.*[1-9])\d+(?:\.\d{1,4})?$/;

export class PublishPriceListItemDiscountDto {
  @IsEnum(PriceListItemDiscountType) discountType!: PriceListItemDiscountType;
  @Matches(POSITIVE_DECIMAL, { message: 'discountValue must be a positive decimal with at most 4 decimal places' }) discountValue!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class ChangePriceListItemDiscountDto extends PublishPriceListItemDiscountDto {}

export class EndPriceListItemDiscountDto {
  @IsDateString() effectiveTo!: string;
}

export class ResolveSellingPriceDto {
  @IsInt() @Min(1) productId!: number;
  @IsInt() @Min(1) productUnitId!: number;
  @IsInt() @Min(1) priceListId!: number;
  @Matches(POSITIVE_DECIMAL, { message: 'quantity must be a positive decimal' }) quantity!: string;
  @IsDateString() transactionDate!: string;
}
