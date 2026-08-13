import { PartialType } from '@nestjs/mapped-types';
import { CreateModuleEntityDto } from './create-modules.dto';
export class UpdateModuleEntityDto extends PartialType(CreateModuleEntityDto) {}
