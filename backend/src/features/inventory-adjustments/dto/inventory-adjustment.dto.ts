import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class InventoryAdjustmentLineDto {
  @IsInt() @Min(1) productId!: number;
  @IsInt() @Min(1) productUnitId!: number;
  @Transform(({ value }) => String(value))
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,4})?$/) quantity!: string;
  @IsOptional() @Transform(({ value }) => value == null ? undefined : String(value))
  @Matches(/^\d+(?:\.\d{1,4})?$/) unitCost?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

export class CreateInventoryAdjustmentDto {
  @IsInt() @Min(1) locationId!: number;
  @IsIn(['ADJI', 'ADJO']) movementType!: 'ADJI' | 'ADJO';
  @IsInt() @Min(1) reasonId!: number;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(4000) remarks?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InventoryAdjustmentLineDto)
  lines!: InventoryAdjustmentLineDto[];
}

export class UpdateInventoryAdjustmentDto extends PartialType(CreateInventoryAdjustmentDto) {}

export class PostInventoryAdjustmentDto {
  @IsOptional() @IsBoolean() confirmNegativeStock?: boolean;
}
