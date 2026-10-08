import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAgingController } from './inventory-aging.controller';
import { InventoryAgingService } from './inventory-aging.service';
import { InventoryAgingSnapshot } from './inventory-aging-snapshot.entity';

@Module({ imports: [TypeOrmModule.forFeature([InventoryAgingSnapshot])], controllers: [InventoryAgingController], providers: [InventoryAgingService], exports: [InventoryAgingService] })
export class InventoryAgingModule {}
