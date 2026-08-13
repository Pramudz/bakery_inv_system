import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateProductSupplierDto {
  @IsInt() productId!: number;
  @IsInt() supplierId!: number;
  @IsOptional() @IsString() @MaxLength(100) supplierProductCode?: string;
  @IsOptional() @IsInt() purchaseUnitId?: number;
  @IsOptional() @IsNumber() minimumOrderQty?: number;
  @IsOptional() @IsInt() leadTimeDays?: number;
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
}

