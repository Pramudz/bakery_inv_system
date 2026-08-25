import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tenant } from './tenant.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantSelfController } from './tenant-self.controller';
import { SecurityModule } from '../auth/security.module';
import { MediaController } from '../../common/media.controller';
import { MediaStorageService } from '../../common/media-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    SecurityModule,
  ],
  controllers: [
    TenantsController,
    TenantSelfController,
    MediaController,
  ],
  providers: [
    TenantsService,
    MediaStorageService,
  ],
  exports: [
    TenantsService,
  ],
})
export class TenantsModule {}
