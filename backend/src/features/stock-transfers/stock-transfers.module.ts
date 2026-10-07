import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAgingModule } from '../inventory-aging/inventory-aging.module';
import { InventoryBalanceModule } from '../inventory-balance/inventory-balance.module';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';
import { StockTransferAgeAllocation } from './stock-transfer-age-allocation.entity';
import { StockTransferLine } from './stock-transfer-line.entity';
import { StockTransferReceiptLine } from './stock-transfer-receipt-line.entity';
import { StockTransferReceipt } from './stock-transfer-receipt.entity';
import { StockTransfer } from './stock-transfer.entity';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';

@Module({
  imports: [TypeOrmModule.forFeature([StockTransfer, StockTransferLine, StockTransferAgeAllocation, StockTransferReceipt, StockTransferReceiptLine]), InventoryBalanceModule, InventoryAgingModule, NumberSequencesModule],
  controllers: [StockTransfersController], providers: [StockTransfersService],
})
export class StockTransfersModule {}
