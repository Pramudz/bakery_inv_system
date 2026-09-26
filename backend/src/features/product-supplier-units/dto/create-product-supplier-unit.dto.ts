import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProductSupplierUnitDto {
  @IsInt()
  productSupplierId!: number;

  @IsInt()
  productUnitId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierProductCode?: string;

  @IsOptional()
  @IsNumber()
  minimumOrderQty?: number;

  @IsOptional()
  @IsInt()
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isDefaultPurchaseUnit?: boolean;
}