import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class ActivatePosTerminalDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-Z2-9]{4}-?[A-Z2-9]{4}-?[A-Z2-9]{4}$/, { message: 'Enter a valid 12-character activation code.' })
  activationCode!: string;
}
