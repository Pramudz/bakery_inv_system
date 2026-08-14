import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryLedger } from './inventory-ledger.entity';
import { InventoryLedgerService } from './inventory-ledger.service';

@Module({ imports: [TypeOrmModule.forFeature([InventoryLedger])], providers: [InventoryLedgerService], exports: [InventoryLedgerService] })
export class InventoryLedgerModule {}
