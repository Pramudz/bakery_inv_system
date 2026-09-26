import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InventoryLedger } from './inventory-ledger.entity';

export type InventoryLedgerEntry = Omit<InventoryLedger, keyof import('../../common/audit.entity').AuditEntity | 'inventoryLedgerId' | 'tenant' | 'location' | 'product' | 'createdByUser'>;

@Injectable()
export class InventoryLedgerService {
  insert(manager: EntityManager, entry: InventoryLedgerEntry) {
    const repository = manager.getRepository(InventoryLedger);
    return repository.save(repository.create(entry));
  }
}
