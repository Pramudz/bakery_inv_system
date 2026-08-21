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
import { AddProductImageDto } from '../../product-images/dto/product-image.dto';

export class CreateProductImageInputDto extends AddProductImageDto {
  @IsOptional() @IsInt() productImageId?: number;
}

export class CreateProductUnitInputDto {
  @IsOptional() @IsInt() productUnitId?: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0.000001) conversionFactor!: number;
  @IsOptional() @IsBoolean() isBaseUnit?: boolean;
  @IsOptional() @IsBoolean() isPurchaseUnit?: boolean;
  @IsOptional() @IsBoolean() isSalesUnit?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductIdentifierInputDto {
  @IsOptional() @IsInt() productIdentifierId?: number;
  @IsInt() identifierTypeId!: number;
  @IsOptional() @IsInt() productUnitId?: number;
  @IsString() @IsNotEmpty() @MaxLength(100) identifierValue!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductSupplierPriceInputDto {
  @IsNumber() @Min(0) purchasePrice!: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductSupplierUnitInputDto {
  @IsInt() unitId!: number;
  @IsOptional() @IsString() @MaxLength(100) supplierProductCode?: string | null;
  @IsOptional() @IsNumber() @Min(0.000001) minimumOrderQty?: number | null;
  @IsOptional() @IsInt() @Min(0) leadTimeDays?: number | null;
  @IsOptional() @IsBoolean() isDefaultPurchaseUnit?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductSupplierPriceInputDto)
  prices!: CreateProductSupplierPriceInputDto[];
}

export class CreateProductSupplierLinkInputDto {
  @IsInt() supplierId!: number;
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateProductSupplierUnitInputDto)
  units!: CreateProductSupplierUnitInputDto[];
}

export class CreateProductLocationInputDto {
  @IsOptional() @IsInt() productLocationId?: number;
  @IsInt() locationId!: number;
  @IsOptional() @IsBoolean() isSellable?: boolean;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
}

export class CreateProductAttributeInputDto {
  @IsOptional() @IsInt() productAttributeId?: number;
  @IsInt() attributeId!: number;
  @IsString() @IsNotEmpty() @MaxLength(500) value!: string;
}

export class CreatePriceListItemInputDto {
  @IsOptional() @IsInt() priceListItemId?: number;
  @IsInt() priceListId!: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0) sellingPrice!: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductDto {
  @IsString() @IsNotEmpty() @MaxLength(255) productName!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productType?: string;
  @IsInt() categoryId!: number;
  @IsOptional() @IsInt() brandId?: number;
  @IsInt() baseUnitId!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
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
  @Type(() => CreateProductSupplierLinkInputDto)
  supplierLinks?: CreateProductSupplierLinkInputDto[];
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
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageInputDto)
  images?: CreateProductImageInputDto[];
}
