import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from './tenant-modules.entity';
import { ModuleEntity } from '../modules/modules.entity';
import { TenantModulesController } from './tenant-modules.controller';
import { TenantModulesService } from './tenant-modules.service';
@Module({ imports: [TypeOrmModule.forFeature([TenantModule, ModuleEntity])], controllers: [TenantModulesController], providers: [TenantModulesService], exports: [TypeOrmModule] })
export class TenantModulesModule {}
