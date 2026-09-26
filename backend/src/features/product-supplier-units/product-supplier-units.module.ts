import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductSupplierUnit } from './product-supplier-unit.entity';
import { ProductSupplierUnitsController } from './product-supplier-units.controller';
import { ProductSupplierUnitsService } from './product-supplier-units.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductSupplierUnit])],
  controllers: [ProductSupplierUnitsController],
  providers: [ProductSupplierUnitsService],
  exports: [ProductSupplierUnitsService],
})
export class ProductSupplierUnitsModule {}