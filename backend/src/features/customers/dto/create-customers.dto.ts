import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(50) customerCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) customerName!: string;
  @IsOptional() @IsString() @MaxLength(150) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @Transform(({ value }) => value === '' ? null : value) @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(255) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(255) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(50) mobile?: string;
  @IsOptional() @IsString() @MaxLength(100) districtOrState?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
