import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tenant } from './tenant.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { UserRole } from '../user-roles/user-roles.entity';

import { SecurityModule } from '../auth/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      User,
      Role,
      UserRole,
    ]),
    SecurityModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
