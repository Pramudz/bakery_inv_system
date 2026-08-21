import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAgeLayerModule } from '../inventory-age-layers/inventory-age-layer.module';
import { InventoryBalanceModule } from '../inventory-balance/inventory-balance.module';
import { InventoryLedgerModule } from '../inventory-ledger/inventory-ledger.module';
import { PurchaseOrderLine } from '../purchase-orders/purchase-order-line.entity';
import { PurchaseOrder } from '../purchase-orders/purchase-order.entity';
import { GoodsReceiptLine } from './goods-receipt-line.entity';
import { GoodsReceipt } from './goods-receipt.entity';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';

@Module({ imports: [TypeOrmModule.forFeature([GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine]), InventoryBalanceModule, InventoryLedgerModule, InventoryAgeLayerModule, NumberSequencesModule], controllers: [GoodsReceiptsController], providers: [GoodsReceiptsService] })
export class GoodsReceiptsModule {}
