import { IsDateString, IsInt } from 'class-validator';
export class CreateRolePermissionDto {@IsInt()roleId!:number;@IsInt()permissionId!:number;@IsDateString()assignedAt!:string;}
