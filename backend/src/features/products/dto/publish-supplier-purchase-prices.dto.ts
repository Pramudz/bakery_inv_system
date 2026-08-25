import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export const SUPPLIER_PURCHASE_PRICE_ACTIONS = ['ADD_INITIAL_PRICE', 'CHANGE_PRICE', 'END_PRICE', 'CANCEL_FUTURE_PRICE'] as const;

export class SupplierPurchasePriceDraftActionDto {
  @IsIn(SUPPLIER_PURCHASE_PRICE_ACTIONS) action!: typeof SUPPLIER_PURCHASE_PRICE_ACTIONS[number];
  @IsOptional() @IsInt() productSupplierPriceId?: number;
  @IsOptional() @IsInt() productSupplierUnitId?: number;
  @IsOptional() @IsNumber() @Min(0.000001) price?: number;
  @IsOptional() @IsIn(['NOW', 'SCHEDULED']) effectiveMode?: 'NOW' | 'SCHEDULED';
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
}

export class PublishSupplierPurchasePricesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierPurchasePriceDraftActionDto)
  actions!: SupplierPurchasePriceDraftActionDto[];
}
