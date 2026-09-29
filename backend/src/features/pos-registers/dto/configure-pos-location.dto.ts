import { IsEnum } from 'class-validator';
import { PosRegisterMode } from '../pos-location-config.entity';

export class ConfigurePosLocationDto {
  @IsEnum(PosRegisterMode) registerMode!: PosRegisterMode;
}
