import { IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateProductSupplierPriceDto {
  @IsInt() productSupplierId!: number;
  @IsInt() productUnitId!: number;
  @IsNumber() purchasePrice!: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsNumber() minimumQuantity!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
