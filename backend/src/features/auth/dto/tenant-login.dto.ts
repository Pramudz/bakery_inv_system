import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TenantLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tenantCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password!: string;
}
