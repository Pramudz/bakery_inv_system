import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { units } from '../../common/inventory-decimal';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { InventoryOpeningClaim } from './inventory-opening-claim.entity';

export interface OpeningTarget { tenantId: number; locationId: number; productId: number }

// All inbound writers lock ProductLocation and/or InventoryBalance before
// writing a ledger. Reserve both existing lock points, including the first
// balance row, then inspect history using current (locking) reads.
export async function lockOpeningTarget(manager: EntityManager, balances: InventoryBalanceService, target: OpeningTarget) {
  const context = await manager.getRepository(ProductLocation).createQueryBuilder('context')
    .setLock('pessimistic_write')
    .where('context.productId = :productId AND context.locationId = :locationId AND context.isActive = true', target).getOne();
  if (!context) throw new ConflictException('Product/location is unavailable for opening inventory.');
  const balance = await balances.lockOrCreateZero(manager, target.tenantId, target.locationId, target.productId);
  const params = [target.tenantId, target.productId, target.locationId];
  const claim: unknown[] = await manager.query(`SELECT inventory_opening_claim_id FROM tbl_inventory_opening_claim
    WHERE tenant_id = ? AND product_id = ? AND location_id = ? LIMIT 1 FOR UPDATE`, params);
  const history: unknown[] = await manager.query(`SELECT inventory_ledger_id FROM tbl_inventory_ledger
    WHERE tenant_id = ? AND product_id = ? AND location_id = ? LIMIT 1 FOR UPDATE`, params);
  const layers: unknown[] = await manager.query(`SELECT inventory_age_layer_id FROM tbl_inventory_age_layer
    WHERE tenant_id = ? AND product_id = ? AND location_id = ? LIMIT 1 FOR UPDATE`, params);
  if (claim.length || history.length || layers.length || units(balance.quantityOnHand) !== 0n ||
    units(balance.averageCost) !== 0n || balance.lastMovementAt !== null)
    throw new ConflictException('Opening inventory is permitted only once at an unused product/location.');
  return balance;
}

export async function saveOpeningClaim(manager: EntityManager, target: OpeningTarget & {
  sourceImportBatchId: number | null; sourceAdjustmentId: number; sourceAdjustmentLineId: number; createdByUserId: number;
}) {
  const repo = manager.getRepository(InventoryOpeningClaim);
  return repo.save(repo.create(target));
}
