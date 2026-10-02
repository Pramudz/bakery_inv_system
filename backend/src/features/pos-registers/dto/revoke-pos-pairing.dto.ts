import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokePosPairingDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) reason?: string;
}
