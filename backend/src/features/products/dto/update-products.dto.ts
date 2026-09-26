import { OmitType, PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { CreateProductDto, ProductPriceListItemInputDto } from "./create-products.dto";
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['supplierLinks', 'prices'] as const)) {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) sku?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  removedSellingPriceIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceListItemInputDto)
  prices?: ProductPriceListItemInputDto[];
}
