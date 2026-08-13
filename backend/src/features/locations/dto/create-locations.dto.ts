import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateLocationDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) locationType!: string;
}
