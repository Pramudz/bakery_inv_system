import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductModule } from '../products/products.module';
import { ProductSupplierUnitsModule } from '../product-supplier-units/product-supplier-units.module';
import { PriceListItemDiscountModule } from '../price-list-item-discounts/price-list-item-discounts.module';
import { ProductImportBatch } from './product-import-batch.entity';
import { ProductImportRef } from './product-import-ref.entity';
import { ProductImportController } from './product-import.controller';
import { ProductImportPermissionGuard } from './product-import-permission.guard';
import { ProductImportService } from './product-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductImportBatch, ProductImportRef]), ProductModule, ProductSupplierUnitsModule, PriceListItemDiscountModule],
  controllers: [ProductImportController],
  providers: [ProductImportService, ProductImportPermissionGuard],
})
export class ProductImportModule {}
