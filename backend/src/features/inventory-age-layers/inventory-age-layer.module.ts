import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryAgeLayer } from './inventory-age-layer.entity';
import { InventoryAgeLayerService } from './inventory-age-layer.service';

@Module({ imports: [TypeOrmModule.forFeature([InventoryAgeLayer])], providers: [InventoryAgeLayerService], exports: [InventoryAgeLayerService] })
export class InventoryAgeLayerModule {}
