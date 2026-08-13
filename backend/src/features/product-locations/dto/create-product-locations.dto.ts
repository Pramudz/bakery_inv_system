import { IsBoolean, IsInt, IsOptional } from 'class-validator';
export class CreateProductLocationDto {
  @IsInt() productId!: number;
  @IsInt() locationId!: number;
  @IsOptional() @IsBoolean() isSellable?: boolean;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
}
