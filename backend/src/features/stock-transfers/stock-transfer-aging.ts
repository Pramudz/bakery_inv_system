import { ConflictException } from '@nestjs/common';
import { checked, units } from '../../common/inventory-decimal';
import { AgingResult } from '../inventory-aging/inventory-aging-calculation';
import { StockTransferAgeAllocation } from './stock-transfer-age-allocation.entity';

export function allocateDispatchAge(aging: AgingResult, quantity: string) {
  let remaining = units(quantity);
  const rows: Array<{ originAgingDate: string | null; dispatchedQuantity: string }> = [];
  // An unknown origin has no sortable age: allocate all known dates oldest-first, then UNKNOWN.
  for (const part of [...aging.composition].sort((a, b) => a.agingDate.localeCompare(b.agingDate))) {
    if (remaining <= 0n) break;
    const available = units(part.quantity);
    const taken = available < remaining ? available : remaining;
    if (taken > 0n) rows.push({ originAgingDate: part.agingDate, dispatchedQuantity: checked(taken) });
    remaining -= taken;
  }
  if (remaining > 0n) {
    if (remaining > units(aging.unknownQty)) throw new ConflictException('Source aging does not reconcile to available stock.');
    rows.push({ originAgingDate: null, dispatchedQuantity: checked(remaining) });
  }
  return rows;
}

export function allocateReceiptAge(allocations: StockTransferAgeAllocation[], quantity: string) {
  let remaining = units(quantity);
  const changes: Array<{ allocation: StockTransferAgeAllocation; receivedQuantity: string }> = [];
  for (const allocation of [...allocations].sort((a, b) =>
    (a.originAgingDate ?? '9999-12-31').localeCompare(b.originAgingDate ?? '9999-12-31') ||
    Number(a.stockTransferAgeAllocationId) - Number(b.stockTransferAgeAllocationId))) {
    if (remaining <= 0n) break;
    const available = units(allocation.dispatchedQuantity) - units(allocation.receivedQuantity);
    if (available <= 0n) continue;
    const taken = available < remaining ? available : remaining;
    changes.push({ allocation, receivedQuantity: checked(units(allocation.receivedQuantity) + taken) });
    remaining -= taken;
  }
  if (remaining > 0n) throw new ConflictException('Transfer age allocations do not cover the received quantity.');
  return changes;
}
