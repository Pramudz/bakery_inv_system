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
  @IsOptional() @IsInt() sourceSupplierPriceId?: number;
  @IsInt() productId!: number;
  @IsInt() productUnitId!: number;
  @IsInt() unitId!: number;
  @IsNumber() @Min(0.0001) orderedQty!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePurchaseOrderDto {
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
