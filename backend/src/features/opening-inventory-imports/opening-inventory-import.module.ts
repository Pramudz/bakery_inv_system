import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAdjustmentsModule } from '../inventory-adjustments/inventory-adjustments.module';
import { InventoryBalanceModule } from '../inventory-balance/inventory-balance.module';
import { OpeningInventoryImportBatch } from './opening-inventory-import-batch.entity';
import { OpeningInventoryImportController } from './opening-inventory-import.controller';
import { OpeningInventoryImportService } from './opening-inventory-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([OpeningInventoryImportBatch]), InventoryAdjustmentsModule, InventoryBalanceModule],
  controllers: [OpeningInventoryImportController],
  providers: [OpeningInventoryImportService],
})
export class OpeningInventoryImportModule {}
