import { PartialType } from '@nestjs/mapped-types';
import { CreateRolePermissionDto } from './create-role-permissions.dto';
export class UpdateRolePermissionDto extends PartialType(CreateRolePermissionDto) {}
