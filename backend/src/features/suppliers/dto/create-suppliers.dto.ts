import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEmpty, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const EmptyToNull = () => Transform(({ value }) => typeof value === 'string' && value.trim() === '' ? null : value);
const EmptyCodeToUndefined = () => Transform(({ value }) => typeof value === 'string' && value.trim() === '' ? undefined : value);

export class CreateSupplierDto {
  @IsEmpty({ message: 'tenantId cannot be supplied.' }) tenantId?: never;
  @EmptyCodeToUndefined() @IsOptional() @IsString() @MaxLength(50) supplierCode?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) supplierName!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(150) contactName?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) mobile?: string | null;
  @EmptyToNull() @IsOptional() @IsEmail() @MaxLength(150) email?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(255) addressLine1?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(255) addressLine2?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) districtOrState?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(30) postalCode?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @Length(2, 2) countryCode?: string | null;
}
