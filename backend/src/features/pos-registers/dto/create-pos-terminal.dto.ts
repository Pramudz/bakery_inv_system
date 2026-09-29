import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePosTerminalDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @IsString() @IsNotEmpty() @MaxLength(50) @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, { message: 'Terminal code may contain letters, numbers, underscores and hyphens.' }) terminalCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) displayName!: string;
}
