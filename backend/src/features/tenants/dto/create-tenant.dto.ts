import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
const EmptyToNull = () => Transform(({ value }) => value === '' ? null : value);
export class CreateTenantDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsBoolean() isActive!: boolean;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) registrationNumber?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) taxRegistrationNumber?: string;
  @EmptyToNull() @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @EmptyToNull() @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(255) website?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) city?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) stateProvince?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(30) postalCode?: string;
  @EmptyToNull() @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
}
