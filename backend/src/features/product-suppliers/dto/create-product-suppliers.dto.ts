import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
export class CreateProductSupplierDto {
  @IsInt() productId!: number;
  @IsInt() supplierId!: number;
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(3650) baselineLeadTimeDays?: number | null;
}
