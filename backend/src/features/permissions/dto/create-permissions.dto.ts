import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreatePermissionDto {@IsInt()moduleId!:number;@IsString()@IsNotEmpty()@MaxLength(100)code!:string;@IsString()@IsNotEmpty()@MaxLength(150)name!:string;@IsOptional()@IsString()@MaxLength(255)description?:string;}
