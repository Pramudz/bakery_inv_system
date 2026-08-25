import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryBalance } from './inventory-balance.entity';
import { InventoryBalanceService } from './inventory-balance.service';

@Module({ imports: [TypeOrmModule.forFeature([InventoryBalance])], providers: [InventoryBalanceService], exports: [InventoryBalanceService] })
export class InventoryBalanceModule {}
