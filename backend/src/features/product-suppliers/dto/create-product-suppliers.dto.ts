import { IsBoolean, IsInt, IsOptional } from 'class-validator';
export class CreateProductSupplierDto {
  @IsInt() productId!: number;
  @IsInt() supplierId!: number;
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
