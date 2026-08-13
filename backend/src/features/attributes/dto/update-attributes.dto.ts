import { PartialType } from '@nestjs/mapped-types';
import { CreateAttributeDto } from './create-attributes.dto';
export class UpdateAttributeDto extends PartialType(CreateAttributeDto) {}
