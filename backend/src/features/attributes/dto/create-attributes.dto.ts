import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateAttributeDto {
  @IsInt() tenantId!: number;
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) dataType!: string;
}
