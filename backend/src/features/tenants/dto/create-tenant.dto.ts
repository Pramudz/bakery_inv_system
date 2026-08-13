import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateTenantDto {
  @IsString() @IsNotEmpty() @MaxLength(50) tenantCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) tenantName!: string;
}
