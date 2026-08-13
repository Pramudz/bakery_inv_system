import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
export class CreateCategoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentCategoryId?: number;
  @IsString() @IsNotEmpty() @MaxLength(50) categoryCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) categoryName!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
