import { PartialType } from "@nestjs/mapped-types";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { CreateProductDto } from "./create-products.dto";
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) sku?: string;
}
