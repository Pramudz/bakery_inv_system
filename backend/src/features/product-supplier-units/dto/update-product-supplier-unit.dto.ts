import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProductSupplierUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierProductCode?: string | null;

  @IsOptional()
  @IsNumber()
  minimumOrderQty?: number | null;

  @IsOptional()
  @IsInt()
  leadTimeDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isDefaultPurchaseUnit?: boolean;
}