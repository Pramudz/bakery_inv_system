import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

export class InventoryConversionLineDto {
  @IsIn(['AVAL', 'AVIN']) movementType!: 'AVAL' | 'AVIN';
  @IsInt() @Min(1) productId!: number;
  @IsInt() @Min(1) productUnitId!: number;
  @Transform(({ value }) => String(value)) @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,4})?$/) quantity!: string;
  @IsOptional() @Transform(({ value }) => value == null ? undefined : String(value)) @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,4})?$/) allocationPercent?: string;
  @IsOptional() @Transform(({ value }) => value == null ? undefined : String(value)) @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,4})?$/) allocationWeight?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

export class CreateInventoryConversionDto {
  @IsInt() @Min(1) locationId!: number;
  @IsIn(['MANUAL_PERCENT', 'BY_EXISTING_WAVG', 'BY_WEIGHT']) allocationMethod!: 'MANUAL_PERCENT' | 'BY_EXISTING_WAVG' | 'BY_WEIGHT';
  @IsOptional() @IsString() @MaxLength(4000) remarks?: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => InventoryConversionLineDto) lines!: InventoryConversionLineDto[];
}

export class UpdateInventoryConversionDto extends PartialType(CreateInventoryConversionDto) {}

export class PostInventoryConversionDto {
  @IsOptional() @IsBoolean() confirmNegativeStock?: boolean;
}
