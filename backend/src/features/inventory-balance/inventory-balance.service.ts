import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InventoryBalance } from './inventory-balance.entity';

@Injectable()
export class InventoryBalanceService {
  async addStock(manager: EntityManager, tenantId: number, locationId: number, productId: number, quantity: number, cost: number) {
    const repository = manager.getRepository(InventoryBalance);
    let balance = await repository.findOneBy({ tenantId, locationId, productId });
    const quantityBefore = Number(balance?.quantityOnHand ?? 0);
    const averageCostBefore = Number(balance?.averageCost ?? 0);
    const quantityAfter = quantityBefore + quantity;
    const averageCostAfter = quantityBefore <= 0 ? cost : (quantityBefore * averageCostBefore + quantity * cost) / quantityAfter;
    if (!balance) {
      balance = repository.create({ tenantId, locationId, productId, quantityOnHand: String(quantityAfter), averageCost: String(averageCostAfter), lastMovementAt: new Date() });
    } else {
      Object.assign(balance, { quantityOnHand: String(quantityAfter), averageCost: String(averageCostAfter), lastMovementAt: new Date() });
    }
    await repository.save(balance);
    return { quantityBefore, quantityAfter, averageCostBefore, averageCostAfter };
  }
}
