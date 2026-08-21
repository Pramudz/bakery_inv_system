import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
export class CreateUnitOfMeasureDto {
  @IsString() @IsNotEmpty() @MaxLength(30) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsString() @IsNotEmpty() @MaxLength(50) unitType!: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() allowsDecimalQuantity?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) quantityPrecision?: number;
}
