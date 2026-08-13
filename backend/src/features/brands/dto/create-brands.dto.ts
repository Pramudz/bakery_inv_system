import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateBrandDto {
  @IsString() @IsNotEmpty() @MaxLength(50) brandCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) brandName!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
