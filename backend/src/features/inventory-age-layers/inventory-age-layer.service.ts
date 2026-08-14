import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InventoryAgeLayer } from './inventory-age-layer.entity';

export type InventoryAgeLayerEntry = Omit<InventoryAgeLayer, keyof import('../../common/audit.entity').AuditEntity | 'inventoryAgeLayerId' | 'tenant' | 'location' | 'product'>;

@Injectable()
export class InventoryAgeLayerService {
  insert(manager: EntityManager, entry: InventoryAgeLayerEntry) {
    const repository = manager.getRepository(InventoryAgeLayer);
    return repository.save(repository.create(entry));
  }
}
