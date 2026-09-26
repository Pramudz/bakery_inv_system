import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import {
  CreateProductAttributeInputDto,
  CreateProductIdentifierInputDto,
  CreateProductLocationInputDto,
  CreateProductUnitInputDto,
} from './create-products.dto';

export class UpdateProductGeneralDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) productName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsInt() brandId?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isSellable?: boolean;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
  @IsOptional() @IsBoolean() isStockItem?: boolean;
  @IsOptional() @IsBoolean() trackBatch?: boolean;
  @IsOptional() @IsBoolean() trackExpiry?: boolean;
  @IsOptional() @IsBoolean() trackSerial?: boolean;
}

export class UpdateProductUnitsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductUnitInputDto)
  units!: CreateProductUnitInputDto[];
}
export class UpdateProductIdentifiersDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductIdentifierInputDto)
  identifiers!: CreateProductIdentifierInputDto[];
}
export class UpdateProductLocationsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductLocationInputDto)
  locations!: CreateProductLocationInputDto[];
}
export class UpdateProductAttributesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductAttributeInputDto)
  attributes!: CreateProductAttributeInputDto[];
}
export class UpdateProductSupplierLinksDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProductSupplierLinkInputDto)
  suppliers!: ProductSupplierLinkInputDto[];
}
export class ProductSupplierLinkInputDto {
  @IsOptional() @IsInt() productSupplierId?: number;
  @IsInt() supplierId!: number;
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
