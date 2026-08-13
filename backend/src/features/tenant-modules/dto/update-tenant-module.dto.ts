import { IsBoolean } from 'class-validator';

export class UpdateTenantModuleDto {
  @IsBoolean()
  isEnabled!: boolean;
}
