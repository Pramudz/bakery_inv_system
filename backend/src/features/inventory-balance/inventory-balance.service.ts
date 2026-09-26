import { ConflictException, Injectable } from '@nestjs/common';
import { checked, multiply, units } from '../../common/inventory-decimal';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { EntityManager } from 'typeorm';
import { InventoryBalance } from './inventory-balance.entity';

@Injectable()
export class InventoryBalanceService {
  reversalSnapshot(balance: Pick<InventoryBalance, 'quantityOnHand' | 'averageCost'>, original: InventoryLedger, exact: boolean, keepAverageAtZero = false) {
    const before = units(balance.quantityOnHand), average = units(balance.averageCost);
    const quantity = units(original.quantityIn), value = units(original.movementValue);
    if (quantity <= 0n || value < 0n || average < 0n) throw new ConflictException('Invalid original receipt valuation.');
    const after = before - quantity;
    if (exact && (before !== units(original.quantityAfter) || average !== units(original.averageCostAfter) || after !== units(original.quantityBefore)))
      throw new ConflictException('Original posting snapshots do not match inventory.');
    const nextAverage = exact ? units(original.averageCostBefore) : after === 0n && !keepAverageAtZero ? 0n : average;
    if (nextAverage < 0n) throw new ConflictException('Invalid original average cost.');
    const relief = exact ? value : multiply(quantity, average);
    return {
      valuationMethod: exact ? 'EXACT_ORIGINAL' : 'CURRENT_WAVG_COMPENSATION',
      baseQuantity: checked(quantity), originalDocumentValue: checked(value), inventoryReliefValue: checked(relief), costVariance: checked(value - relief),
      quantityBefore: checked(before), quantityAfter: checked(after), averageCostBefore: checked(average), averageCostAfter: checked(nextAverage),
      inventoryValueBefore: checked(multiply(before, average)), inventoryValueAfter: checked(multiply(after, nextAverage)),
      createsNegativeStock: after < 0n,
    };
  }

  async applyRelief(manager: EntityManager, balance: InventoryBalance, snapshot: ReturnType<InventoryBalanceService['reversalSnapshot']>, now: Date) {
    Object.assign(balance, { quantityOnHand: snapshot.quantityAfter, averageCost: snapshot.averageCostAfter, lastMovementAt: now });
    await manager.getRepository(InventoryBalance).save(balance);
  }

  async addStock(manager: EntityManager, tenantId: number, locationId: number, productId: number, quantity: number, cost: number) {
    const repository = manager.getRepository(InventoryBalance);
    let balance = await repository.createQueryBuilder('balance')
      .setLock('pessimistic_write')
      .where('balance.tenantId = :tenantId AND balance.locationId = :locationId AND balance.productId = :productId', { tenantId, locationId, productId })
      .getOne();
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
