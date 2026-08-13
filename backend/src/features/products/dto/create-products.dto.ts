import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateProductDto {
  @IsInt() tenantId!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) sku!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) productName!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productType?: string;
  @IsInt() categoryId!: number;
  @IsOptional() @IsInt() brandId?: number;
  @IsInt() baseUnitId!: number;
  @IsOptional() @IsBoolean() isSellable?: boolean;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
  @IsOptional() @IsBoolean() isStockItem?: boolean;
  @IsOptional() @IsBoolean() trackBatch?: boolean;
  @IsOptional() @IsBoolean() trackExpiry?: boolean;
  @IsOptional() @IsBoolean() trackSerial?: boolean;
}

