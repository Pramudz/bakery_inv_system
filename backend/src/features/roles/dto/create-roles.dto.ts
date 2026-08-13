import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateRoleDto {@IsInt()tenantId!:number;@IsString()@IsNotEmpty()@MaxLength(50)code!:string;@IsString()@IsNotEmpty()@MaxLength(100)name!:string;@IsOptional()@IsString()@MaxLength(255)description?:string;@IsOptional()@IsBoolean()isSystemRole?:boolean;}
