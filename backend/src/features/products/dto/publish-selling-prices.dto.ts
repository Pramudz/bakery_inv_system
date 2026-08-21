import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export const SELLING_PRICE_ACTIONS = ['ADD_INITIAL_PRICE', 'CHANGE_PRICE', 'END_PRICE', 'CANCEL_FUTURE_PRICE'] as const;

export class SellingPriceDraftActionDto {
  @IsIn(SELLING_PRICE_ACTIONS) action!: typeof SELLING_PRICE_ACTIONS[number];
  @IsOptional() @IsInt() priceListItemId?: number;
  @IsOptional() @IsInt() priceListId?: number;
  @IsOptional() @IsInt() productUnitId?: number;
  @IsOptional() @IsNumber() @Min(0.000001) price?: number;
  @IsOptional() @IsIn(['NOW', 'SCHEDULED']) effectiveMode?: 'NOW' | 'SCHEDULED';
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class PublishSellingPricesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SellingPriceDraftActionDto)
  actions!: SellingPriceDraftActionDto[];
}
