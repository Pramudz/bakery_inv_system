import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
export class UpdateProductSupplierDto {
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(3650) baselineLeadTimeDays?: number | null;
}
