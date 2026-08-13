import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateBrandDto {
  @IsInt() tenantId!: number;
  @IsString() @IsNotEmpty() @MaxLength(50) brandCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) brandName!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
