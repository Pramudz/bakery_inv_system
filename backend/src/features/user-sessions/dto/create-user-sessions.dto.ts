import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateUserSessionDto {@IsInt()userId!:number;@IsString()@MaxLength(255)sessionTokenHash!:string;@IsOptional()@IsString()@MaxLength(45)ipAddress?:string;@IsOptional()@IsString()@MaxLength(500)userAgent?:string;@IsDateString()expiresAt!:string;}
