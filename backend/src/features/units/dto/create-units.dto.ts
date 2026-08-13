import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateUnitOfMeasureDto {
  @IsInt() tenantId!: number;
  @IsString() @IsNotEmpty() @MaxLength(30) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsString() @IsNotEmpty() @MaxLength(50) unitType!: string;
}

