import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductUnit } from './product-units.entity';
import { ProductUnitController } from './product-units.controller';
import { ProductUnitService } from './product-units.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductUnit])],
  controllers: [ProductUnitController],
  providers: [ProductUnitService],
  exports: [ProductUnitService],
})
export class ProductUnitModule {}
