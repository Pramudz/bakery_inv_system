import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseOrderLineDto {
  @IsInt() productId!: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0.0001) orderedQty!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePurchaseOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(50) poNumber!: string;
  @IsInt() supplierId!: number;
  @IsInt() locationId!: number;
  @IsDateString() orderDate!: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsString() @IsNotEmpty() @MaxLength(3) currencyCode!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}
