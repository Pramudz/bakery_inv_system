import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsEmpty } from 'class-validator';
import { CreateTenantDto } from './create-tenant.dto';
export class UpdateTenantDto extends PartialType(OmitType(CreateTenantDto, ['timeZone'] as const)) {
  @IsEmpty({ message: 'Tenant timezone cannot be changed through normal tenant administration.' }) timeZone?: never;
}
