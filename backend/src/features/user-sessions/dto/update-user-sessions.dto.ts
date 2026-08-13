import { PartialType } from '@nestjs/mapped-types';
import { CreateUserSessionDto } from './create-user-sessions.dto';
export class UpdateUserSessionDto extends PartialType(CreateUserSessionDto) {}
