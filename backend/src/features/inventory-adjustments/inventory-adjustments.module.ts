import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAgeLayerModule } from '../inventory-age-layers/inventory-age-layer.module';
import { InventoryBalanceModule } from '../inventory-balance/inventory-balance.module';
import { InventoryLedgerModule } from '../inventory-ledger/inventory-ledger.module';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';
import { InventoryAdjustmentLine } from './inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from './inventory-adjustment-reason.entity';
import { InventoryAdjustmentReasonsController } from './inventory-adjustment-reasons.controller';
import { InventoryAdjustmentReasonsService } from './inventory-adjustment-reasons.service';
import { InventoryAdjustment } from './inventory-adjustment.entity';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryAdjustment, InventoryAdjustmentLine, InventoryAdjustmentReason]), InventoryBalanceModule, InventoryLedgerModule, InventoryAgeLayerModule, NumberSequencesModule],
  controllers: [InventoryAdjustmentsController, InventoryAdjustmentReasonsController],
  providers: [InventoryAdjustmentsService, InventoryAdjustmentReasonsService],
  exports: [InventoryAdjustmentReasonsService],
})
export class InventoryAdjustmentsModule {}
