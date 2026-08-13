import { PartialType } from '@nestjs/mapped-types';
import { CreateIdentifierTypeDto } from './create-identifier-types.dto';
export class UpdateIdentifierTypeDto extends PartialType(CreateIdentifierTypeDto) {}
