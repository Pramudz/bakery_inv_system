import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateProductIdentifierDto {
  @IsInt() productId!: number;
  @IsInt() identifierTypeId!: number;
  @IsOptional() @IsInt() productUnitId?: number;
  @IsString() @IsNotEmpty() @MaxLength(100) identifierValue!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
