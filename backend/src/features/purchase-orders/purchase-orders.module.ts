import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({ imports: [TypeOrmModule.forFeature([PurchaseOrder, PurchaseOrderLine])], controllers: [PurchaseOrdersController], providers: [PurchaseOrdersService], exports: [PurchaseOrdersService] })
export class PurchaseOrdersModule {}
