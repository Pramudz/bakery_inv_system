import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { SupplierModule } from '../suppliers/suppliers.module';
import { ReferenceImportBatch } from './reference-import-batch.entity';
import { SupplierImportRef } from './supplier-import-ref.entity';
import { ReferenceImportController } from './reference-import.controller';
import { ReferenceImportPermissionGuard } from './reference-import-permission.guard';
import { ReferenceImportService } from './reference-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReferenceImportBatch, SupplierImportRef, UserSession]), SupplierModule],
  controllers: [ReferenceImportController],
  providers: [ReferenceImportService, ReferenceImportPermissionGuard],
})
export class ReferenceImportModule {}
