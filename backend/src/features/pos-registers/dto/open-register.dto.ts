import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsPositive, Min } from 'class-validator';

export class OpenTerminalRegisterDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) openingBalance!: number;
}

export class OpenMasterRegisterDto extends OpenTerminalRegisterDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
}
