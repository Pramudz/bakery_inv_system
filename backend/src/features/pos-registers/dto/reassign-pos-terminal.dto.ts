import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class ReassignPosTerminalDto {
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
}
