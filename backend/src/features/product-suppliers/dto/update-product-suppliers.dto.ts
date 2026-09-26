import { IsBoolean, IsOptional } from 'class-validator';
export class UpdateProductSupplierDto {
  @IsOptional() @IsBoolean() isPrimarySupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
