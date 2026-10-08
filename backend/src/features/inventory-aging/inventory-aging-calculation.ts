import { checked, multiply, units } from '../../common/inventory-decimal';

export interface AgingInboundEvent {
  locationId: number;
  productId: number;
  agingDate: string | null;
  quantity: string;
  sourceType: string;
  sourceId: number;
  sourceLineId: number;
}

export interface AgingComposition {
  agingDate: string;
  quantity: string;
}

export interface AgingResult {
  locationId: number;
  productId: number;
  quantityOnHand: string;
  averageCost: string;
  inventoryValue: string;
  qty0to30: string;
  qty31to60: string;
  qty61to90: string;
  qty91to180: string;
  qty181to365: string;
  qty365plus: string;
  unknownQty: string;
  attributedQty: string;
  agingCoveragePercentage: string;
  averageAgeDays: string | null;
  oldestAgeDays: number | null;
  composition: AgingComposition[];
}

function calendarDays(asOf: string, dated: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dated)) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${dated}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

export function calculateAgingRow(
  balance: { locationId: number; productId: number; quantityOnHand: string; averageCost: string },
  events: AgingInboundEvent[],
  asOfBusinessDate: string,
): AgingResult {
  const qoh = units(balance.quantityOnHand) > 0n ? units(balance.quantityOnHand) : 0n;
  const averageCost = units(balance.averageCost);
  const bucket = [0n, 0n, 0n, 0n, 0n, 0n];
  const composition: AgingComposition[] = [];
  let remaining = qoh;
  let weightedAge = 0n;
  let oldestAgeDays: number | null = null;
  // Unknown-origin receipts are kept visible before dated receipts; no date is invented.
  const ordered = [...events].sort((a, b) =>
    (b.agingDate ?? '9999-12-31').localeCompare(a.agingDate ?? '9999-12-31') ||
    b.sourceId - a.sourceId || b.sourceLineId - a.sourceLineId);
  let unknown = 0n;
  for (const event of ordered) {
    if (remaining <= 0n) break;
    const available = units(event.quantity);
    if (available <= 0n) continue;
    const take = available < remaining ? available : remaining;
    remaining -= take;
    const age = event.agingDate ? calendarDays(asOfBusinessDate, event.agingDate) : null;
    if (age === null) {
      unknown += take;
      continue;
    }
    const index = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : age <= 180 ? 3 : age <= 365 ? 4 : 5;
    bucket[index] += take;
    weightedAge += take * BigInt(age);
    oldestAgeDays = Math.max(oldestAgeDays ?? 0, age);
    composition.push({ agingDate: event.agingDate!, quantity: checked(take) });
  }
  unknown += remaining;
  const attributed = qoh - unknown;
  const coverage = qoh === 0n ? '0.0000' : checked((attributed * 1_000_000n + qoh / 2n) / qoh);
  const averageAgeDays = attributed === 0n ? null : checked((weightedAge * 10_000n + attributed / 2n) / attributed);
  const reconciled = bucket.reduce((sum, quantity) => sum + quantity, 0n) + unknown;
  if (reconciled !== qoh) throw new Error('Inventory aging failed quantity reconciliation.');
  return {
    locationId: balance.locationId, productId: balance.productId,
    quantityOnHand: checked(qoh), averageCost: checked(averageCost), inventoryValue: checked(multiply(qoh, averageCost)),
    qty0to30: checked(bucket[0]), qty31to60: checked(bucket[1]), qty61to90: checked(bucket[2]),
    qty91to180: checked(bucket[3]), qty181to365: checked(bucket[4]), qty365plus: checked(bucket[5]),
    unknownQty: checked(unknown), attributedQty: checked(attributed), agingCoveragePercentage: coverage,
    averageAgeDays, oldestAgeDays, composition,
  };
}
