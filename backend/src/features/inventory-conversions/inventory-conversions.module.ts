import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAgeLayerModule } from '../inventory-age-layers/inventory-age-layer.module';
import { InventoryBalanceModule } from '../inventory-balance/inventory-balance.module';
import { InventoryLedgerModule } from '../inventory-ledger/inventory-ledger.module';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';
import { InventoryConversionLine } from './inventory-conversion-line.entity';
import { InventoryConversion } from './inventory-conversion.entity';
import { InventoryConversionsController } from './inventory-conversions.controller';
import { InventoryConversionsService } from './inventory-conversions.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryConversion, InventoryConversionLine]), InventoryBalanceModule, InventoryLedgerModule, InventoryAgeLayerModule, NumberSequencesModule],
  controllers: [InventoryConversionsController],
  providers: [InventoryConversionsService],
})
export class InventoryConversionsModule {}
