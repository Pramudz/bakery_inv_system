import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateIdentifierTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
