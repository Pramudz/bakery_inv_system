import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateUserDto {
  @IsInt() tenantId!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) username!: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) mobile?: string;
}
