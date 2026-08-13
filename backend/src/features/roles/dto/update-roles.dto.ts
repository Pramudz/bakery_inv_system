import { PartialType } from '@nestjs/mapped-types';
import { CreateRoleDto } from './create-roles.dto';
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
