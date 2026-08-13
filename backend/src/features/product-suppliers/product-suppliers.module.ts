import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductSupplier } from './product-suppliers.entity';
import { ProductSupplierController } from './product-suppliers.controller';
import { ProductSupplierService } from './product-suppliers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductSupplier])],
  controllers: [ProductSupplierController],
  providers: [ProductSupplierService],
  exports: [ProductSupplierService],
})
export class ProductSupplierModule {}
