import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductSupplierPrice } from './product-supplier-price.entity';
import { ProductSupplierPricesController } from './product-supplier-prices.controller';
import { ProductSupplierPricesService } from './product-supplier-prices.service';
@Module({imports:[TypeOrmModule.forFeature([ProductSupplierPrice])],controllers:[ProductSupplierPricesController],providers:[ProductSupplierPricesService]})
export class ProductSupplierPricesModule {}
