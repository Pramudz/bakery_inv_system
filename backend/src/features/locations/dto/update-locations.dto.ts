import { PartialType } from '@nestjs/mapped-types';
import { CreateLocationDto } from './create-locations.dto';
export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
