import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SaveQuotationLineDto {
  @Type(() => Number) @IsInt() @IsPositive() productId!: number;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
}

export class SaveQuotationDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @Type(() => Number) @IsInt() @IsPositive() customerId!: number;
  @IsISO8601({ strict: true }) quotationDate!: string;
  @IsISO8601({ strict: true }) validUntil!: string;
  @IsIn(['RETAIL', 'WHOLESALE']) quotationType!: 'RETAIL' | 'WHOLESALE';
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaveQuotationLineDto) lines!: SaveQuotationLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) termsAndConditions?: string;
}
