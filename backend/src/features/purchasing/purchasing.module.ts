import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { PurchasingController } from "./purchasing.controller";
import {
  GoodsReceipt,
  GoodsReceiptLine,
  InventoryAgeLayer,
  InventoryBalance,
  InventoryLedger,
  PurchaseOrder,
  PurchaseOrderLine,
} from "./purchasing.entities";
import { PurchasingService } from "./purchasing.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderLine,
      GoodsReceipt,
      GoodsReceiptLine,
      InventoryBalance,
      InventoryLedger,
      InventoryAgeLayer,
    ]),
  ],
  controllers: [PurchasingController],
  providers: [PurchasingService],
})
export class PurchasingModule {}
