import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateAttributeDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) dataType!: string;
}
