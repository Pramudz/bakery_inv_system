import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateCategoryDto {
  @IsInt() tenantId!: number;
  @IsOptional() @IsInt() parentCategoryId?: number;
  @IsString() @IsNotEmpty() @MaxLength(50) categoryCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) categoryName!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

