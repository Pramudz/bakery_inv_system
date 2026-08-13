import { IsDateString, IsInt } from 'class-validator';
export class CreateUserRoleDto {@IsInt()userId!:number;@IsInt()roleId!:number;@IsDateString()assignedAt!:string;}
