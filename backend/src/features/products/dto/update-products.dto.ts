import { OmitType, PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { CreateProductDto } from "./create-products.dto";
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['supplierLinks'] as const)) {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) sku?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  removedSellingPriceIds?: number[];
}
