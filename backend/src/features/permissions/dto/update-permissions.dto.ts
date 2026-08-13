import { PartialType } from '@nestjs/mapped-types';
import { CreatePermissionDto } from './create-permissions.dto';
export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}
