import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './suppliers.entity';
import { SupplierController } from './suppliers.controller';
import { SupplierService } from './suppliers.service';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), NumberSequencesModule],
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule {}
