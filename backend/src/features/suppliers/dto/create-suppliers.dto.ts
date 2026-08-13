import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateSupplierDto {
  @IsInt() tenantId!: number;
  @IsString() @IsNotEmpty() @MaxLength(50) supplierCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) supplierName!: string;
  @IsOptional() @IsString() @MaxLength(150) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(255) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(255) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
}

