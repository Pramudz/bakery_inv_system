import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateProductUnitInputDto {
  @IsInt() unitId!: number;
  @IsNumber() @Min(0.000001) conversionFactor!: number;
  @IsOptional() @IsBoolean() isBaseUnit?: boolean;
  @IsOptional() @IsBoolean() isPurchaseUnit?: boolean;
  @IsOptional() @IsBoolean() isSalesUnit?: boolean;
}

export class CreateProductIdentifierInputDto {
  @IsInt() identifierTypeId!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) identifierValue!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CreateProductSupplierPriceInputDto {
  @IsInt() supplierId!: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0) purchasePrice!: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsNumber() @Min(0.000001) minimumQuantity!: number;
  @IsDateString() effectiveFrom!: string;
}

export class CreateProductLocationInputDto {
  @IsInt() locationId!: number;
  @IsOptional() @IsBoolean() isSellable?: boolean;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
}

export class CreateProductAttributeInputDto {
  @IsInt() attributeId!: number;
  @IsString() @IsNotEmpty() @MaxLength(500) value!: string;
}

export class CreatePriceListItemInputDto {
  @IsInt() priceListId!: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0) sellingPrice!: number;
  @IsNumber() @Min(0.000001) minimumQuantity!: number;
  @IsDateString() effectiveFrom!: string;
}

export class CreateProductDto {
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
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductUnitInputDto)
  productUnits?: CreateProductUnitInputDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductIdentifierInputDto)
  identifiers?: CreateProductIdentifierInputDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductSupplierPriceInputDto)
  supplierPrices?: CreateProductSupplierPriceInputDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductLocationInputDto)
  locations?: CreateProductLocationInputDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductAttributeInputDto)
  productAttributes?: CreateProductAttributeInputDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceListItemInputDto)
  prices?: CreatePriceListItemInputDto[];
}
