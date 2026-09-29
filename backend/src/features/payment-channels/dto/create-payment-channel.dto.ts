import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePaymentChannelDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
}
