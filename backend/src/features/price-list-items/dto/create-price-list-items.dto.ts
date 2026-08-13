import { IsDateString, IsInt, IsNumber, IsOptional } from 'class-validator';
export class CreatePriceListItemDto {
  @IsInt() priceListId!: number;
  @IsInt() productId!: number;
  @IsInt() unitId!: number;
  @IsNumber() sellingPrice!: number;
  @IsNumber() minimumQuantity!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
