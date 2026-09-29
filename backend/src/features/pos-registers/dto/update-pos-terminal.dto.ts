import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdatePosTerminalDto {
  @IsString() @IsNotEmpty() @MaxLength(150) displayName!: string;
}
