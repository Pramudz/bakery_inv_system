import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { businessDateOnly, tenantBusinessClock } from '../../common/business-date';
import { checked, units } from '../../common/inventory-decimal';
import { TenantPrincipal } from '../auth/auth.types';
import { AgingInboundEvent, AgingResult, calculateAgingRow } from './inventory-aging-calculation';
import { InventoryAgingSnapshot } from './inventory-aging-snapshot.entity';

export interface AgingFilters { locationId?: number; productId?: number }

@Injectable()
export class InventoryAgingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async calculateCurrentAging(user: TenantPrincipal, filters: AgingFilters = {}, manager: EntityManager = this.dataSource.manager) {
    if (filters.locationId !== undefined && (!Number.isSafeInteger(filters.locationId) || filters.locationId <= 0)) throw new BadRequestException('Invalid location ID.');
    if (filters.productId !== undefined && (!Number.isSafeInteger(filters.productId) || filters.productId <= 0)) throw new BadRequestException('Invalid product ID.');
    if (user.accessScope === 'LOCATION' && filters.locationId !== undefined && !user.assignedLocationIds.map(Number).includes(filters.locationId)) throw new ForbiddenException('Location is outside your assigned scope.');
    if (user.accessScope === 'LOCATION' && user.assignedLocationIds.length === 0) return { asOfBusinessDate: (await tenantBusinessClock(manager, user.tenantId)).businessDate, rows: [] as AgingResult[] };
    const clock = await tenantBusinessClock(manager, user.tenantId);
    const where = (alias: string) => {
      const fragments = [`${alias}.tenant_id = ?`];
      const params: Array<number> = [user.tenantId];
      if (user.accessScope === 'LOCATION') {
        fragments.push(`${alias}.location_id IN (${user.assignedLocationIds.map(() => '?').join(',')})`);
        params.push(...user.assignedLocationIds.map(Number));
      }
      if (filters.locationId !== undefined) { fragments.push(`${alias}.location_id = ?`); params.push(filters.locationId); }
      if (filters.productId !== undefined) { fragments.push(`${alias}.product_id = ?`); params.push(filters.productId); }
      return { sql: fragments.join(' AND '), params };
    };
    const balanceScope = where('b');
    const ledgerScope = where('l');
    const transferScope = where('t');
    type BalanceRow = { location_id: string; product_id: string; quantity_on_hand: string; average_cost: string };
    type LedgerRow = { inventory_ledger_id: string; location_id: string; product_id: string; movement_type: string; quantity_in: string; reversed_quantity: string | null; business_date: string | Date | null; movement_date: Date; receipt_date: string | Date | null; grn_status: string | null; reversal_id: string | null };
    type TransferRow = { stock_transfer_age_allocation_id: string; location_id: string; product_id: string; origin_aging_date: string | Date | null; received_quantity: string };
    const balances: BalanceRow[] = await manager.query(`SELECT b.location_id, b.product_id, b.quantity_on_hand, b.average_cost
      FROM tbl_inventory_balance b WHERE ${balanceScope.sql} ORDER BY b.location_id, b.product_id`, balanceScope.params);
    const ledgers: LedgerRow[] = await manager.query(`SELECT l.inventory_ledger_id, l.location_id, l.product_id, l.movement_type,
      l.quantity_in, reversal.quantity_out AS reversed_quantity, reversal.inventory_ledger_id AS reversal_id,
      l.business_date, l.movement_date, grn.receipt_date, grn.status AS grn_status
      FROM tbl_inventory_ledger l
      LEFT JOIN tbl_inventory_ledger reversal ON reversal.reversal_of_ledger_id = l.inventory_ledger_id AND reversal.tenant_id = l.tenant_id
      LEFT JOIN tbl_goods_receipt grn ON l.movement_type = 'GRN' AND l.source_document_type = 'GRN'
        AND grn.goods_receipt_id = l.source_document_id AND grn.tenant_id = l.tenant_id
      WHERE ${ledgerScope.sql} AND l.movement_type IN ('GRN','ADJI','AVIN','SALE_RETURN') AND l.quantity_in > 0`, ledgerScope.params);
    const transfers: TransferRow[] = await manager.query(`SELECT allocation.stock_transfer_age_allocation_id,
      t.destination_location_id AS location_id, line.product_id, allocation.origin_aging_date, allocation.received_quantity
      FROM tbl_stock_transfer_age_allocation allocation
      JOIN tbl_stock_transfer_line line ON line.stock_transfer_line_id = allocation.stock_transfer_line_id
      JOIN tbl_stock_transfer t ON t.stock_transfer_id = line.stock_transfer_id
      WHERE ${transferScope.sql.replaceAll('t.location_id', 't.destination_location_id').replaceAll('t.product_id', 'line.product_id')}
        AND allocation.received_quantity > 0 AND t.status IN ('PART_RECEIVED','RECEIVED')`, transferScope.params);
    const grouped = new Map<string, AgingInboundEvent[]>();
    const add = (event: AgingInboundEvent) => {
      const key = `${event.locationId}:${event.productId}`;
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    };
    for (const row of ledgers) {
      if (row.movement_type === 'GRN' && row.grn_status && row.grn_status !== 'POSTED') continue;
      const effective = units(row.quantity_in) - units(row.reversed_quantity ?? '0');
      if (effective <= 0n) continue;
      const rawDate = row.movement_type === 'GRN' ? row.receipt_date : row.business_date ?? row.movement_date;
      const agingDate = businessDateOnly(rawDate, clock.timeZone);
      add({ locationId: Number(row.location_id), productId: Number(row.product_id), agingDate,
        quantity: checked(effective), sourceType: row.movement_type, sourceId: Number(row.inventory_ledger_id), sourceLineId: Number(row.inventory_ledger_id) });
    }
    for (const row of transfers) add({ locationId: Number(row.location_id), productId: Number(row.product_id),
      agingDate: businessDateOnly(row.origin_aging_date, clock.timeZone), quantity: row.received_quantity,
      sourceType: 'TRANSFER_IN', sourceId: Number(row.stock_transfer_age_allocation_id), sourceLineId: Number(row.stock_transfer_age_allocation_id) });
    const rows = balances.map(balance => calculateAgingRow({
      locationId: Number(balance.location_id), productId: Number(balance.product_id),
      quantityOnHand: balance.quantity_on_hand, averageCost: balance.average_cost,
    }, grouped.get(`${balance.location_id}:${balance.product_id}`) ?? [], clock.businessDate));
    return { asOfBusinessDate: clock.businessDate, rows };
  }

  async generateCurrentSnapshot(user: TenantPrincipal, filters: AgingFilters = {}) {
    return this.dataSource.transaction('REPEATABLE READ', async manager => {
      const calculated = await this.calculateCurrentAging(user, filters, manager);
      const repo = manager.getRepository(InventoryAgingSnapshot);
      for (const row of calculated.rows) {
        await repo.upsert({ tenantId: user.tenantId, snapshotDate: calculated.asOfBusinessDate,
          locationId: row.locationId, productId: row.productId, quantityOnHand: row.quantityOnHand,
          averageCost: row.averageCost, inventoryValue: row.inventoryValue, qty0to30: row.qty0to30,
          qty31to60: row.qty31to60, qty61to90: row.qty61to90, qty91to180: row.qty91to180,
          qty181to365: row.qty181to365, qty365plus: row.qty365plus, unknownQty: row.unknownQty,
          attributedQty: row.attributedQty, agingCoveragePercentage: row.agingCoveragePercentage,
          averageAgeDays: row.averageAgeDays, oldestAgeDays: row.oldestAgeDays },
          ['tenantId', 'snapshotDate', 'locationId', 'productId']);
      }
      return { snapshotDate: calculated.asOfBusinessDate, rowsSaved: calculated.rows.length };
    });
  }
}
