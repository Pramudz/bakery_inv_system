import { IsBoolean, IsInt, IsNumber, IsOptional } from 'class-validator';
export class CreateProductUnitDto {
  @IsInt() productId!: number;
  @IsInt() unitId!: number;
  @IsNumber() conversionFactor!: number;
  @IsOptional() @IsBoolean() isBaseUnit?: boolean;
  @IsOptional() @IsBoolean() isPurchaseUnit?: boolean;
  @IsOptional() @IsBoolean() isSalesUnit?: boolean;
}

