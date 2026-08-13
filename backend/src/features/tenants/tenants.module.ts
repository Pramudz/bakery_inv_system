import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tenant } from './tenant.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantSelfController } from './tenant-self.controller';
import { SecurityModule } from '../auth/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    SecurityModule,
  ],
  controllers: [
    TenantsController,
  ],
  providers: [
    TenantsService,
  ],
  exports: [
    TenantsService,
  ],
})
export class TenantsModule {}