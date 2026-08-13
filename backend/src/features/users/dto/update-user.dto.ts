import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) password?: string;
}
