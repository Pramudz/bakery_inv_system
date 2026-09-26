import { ConflictException, Injectable } from '@nestjs/common';
import { checked, units } from '../../common/inventory-decimal';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { EntityManager } from 'typeorm';
import { InventoryAgeLayer } from './inventory-age-layer.entity';

export type InventoryAgeLayerEntry = Omit<InventoryAgeLayer, keyof import('../../common/audit.entity').AuditEntity | 'inventoryAgeLayerId' | 'tenant' | 'location' | 'product'>;

@Injectable()
export class InventoryAgeLayerService {
  // Caller locks all product/location layers. Prefer this receipt, then FIFO.
  async relieve(manager: EntityManager, layers: InventoryAgeLayer[], request: {
    quantity: string;
    preferredSource?: Pick<InventoryLedger, 'sourceDocumentType' | 'sourceDocumentId' | 'sourceDocumentLineId'>;
    exact?: boolean;
  }) {
    let remaining = units(request.quantity);
    if (remaining <= 0n) throw new ConflictException('Layer stock relief requires a positive quantity.');
    const original = request.preferredSource;
    const own = (layer: InventoryAgeLayer) => Boolean(original && layer.sourceDocumentType === original.sourceDocumentType && String(layer.sourceDocumentId) === String(original.sourceDocumentId) && String(layer.sourceDocumentLineId) === String(original.sourceDocumentLineId));
    const ordered = [...layers].sort((a, b) => Number(own(b)) - Number(own(a)) || a.receiptDate.localeCompare(b.receiptDate) || Number(a.inventoryAgeLayerId) - Number(b.inventoryAgeLayerId));
    const allocations: NonNullable<InventoryLedger['ageLayerRelief']>['allocations'] = [];
    for (const layer of ordered) {
      if (!remaining) break;
      const before = units(layer.remainingQuantity);
      if (before < 0n) throw new ConflictException('Age layer has an invalid negative remaining quantity.');
      if (!layer.isActive || before === 0n || (request.exact && !own(layer))) continue;
      if (request.exact && own(layer) && before > units(request.quantity)) throw new ConflictException('Original age layer exceeds the receipt quantity.');
      const quantity = before < remaining ? before : remaining;
      const after = before - quantity;
      layer.remainingQuantity = checked(after);
      layer.isActive = after > 0n;
      await manager.getRepository(InventoryAgeLayer).save(layer);
      allocations.push({ layerId: layer.inventoryAgeLayerId, quantity: checked(quantity), before: checked(before), after: checked(after) });
      remaining -= quantity;
    }
    return { allocations, unallocatedQuantity: checked(remaining) };
  }

  insert(manager: EntityManager, entry: InventoryAgeLayerEntry) {
    const repository = manager.getRepository(InventoryAgeLayer);
    return repository.save(repository.create(entry));
  }
}
