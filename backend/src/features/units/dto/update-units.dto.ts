import { PartialType } from '@nestjs/mapped-types';
import { CreateUnitOfMeasureDto } from './create-units.dto';
export class UpdateUnitOfMeasureDto extends PartialType(CreateUnitOfMeasureDto) {}
