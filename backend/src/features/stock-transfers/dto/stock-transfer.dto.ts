import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsPositive, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

const DECIMAL4_POSITIVE = /^(?!0+(?:\.0{1,4})?$)\d+(?:\.\d{1,4})?$/;

export class CreateStockTransferLineDto {
  @Type(() => Number) @IsInt() @IsPositive() productId!: number;
  @IsString() @Matches(DECIMAL4_POSITIVE) quantity!: string;
}

export class CreateStockTransferDto {
  @Type(() => Number) @IsInt() @IsPositive() sourceLocationId!: number;
  @Type(() => Number) @IsInt() @IsPositive() destinationLocationId!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateStockTransferLineDto) lines!: CreateStockTransferLineDto[];
  @IsOptional() @IsString() @MaxLength(100) dispatchReference?: string;
  @IsOptional() @IsString() @MaxLength(100) carrierReference?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingReference?: string;
  @IsOptional() @IsString() @MaxLength(100) vehicleReference?: string;
  @IsOptional() @IsDateString() expectedArrivalDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

export class DispatchStockTransferDto {
  @IsUUID('4') dispatchKey!: string;
}

export class ReceiveStockTransferLineDto {
  @Type(() => Number) @IsInt() @IsPositive() stockTransferLineId!: number;
  @IsString() @Matches(DECIMAL4_POSITIVE) quantity!: string;
}

export class ReceiveStockTransferDto {
  @IsUUID('4') receiptKey!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveStockTransferLineDto) lines!: ReceiveStockTransferLineDto[];
}
