import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { baseQuantity, checked, multiply, units } from '../../common/inventory-decimal';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryAgingService } from '../inventory-aging/inventory-aging.service';
import { calculateReplenishment, purchaseUnitSuggestion, resolveLeadTime, resolvePurchaseUnit, SupplierPurchaseUnit } from './replenishment-calculation';
import { inclusiveCalendarDays } from './report-period';
import { CATEGORY_LEVELS_SQL, CATEGORY_PARENTS_SQL, PRIMARY_SUPPLIER_SQL } from './sales-report';

interface PositionSqlRow {
  locationId: string; productId: string; location: string; sku: string; product: string;
  categoryLevel1: string | null; categoryLevel2: string | null; categoryLevel3: string | null;
  brand: string | null; primarySupplier: string | null; primarySupplierId: string | null;
  qty: string; unitCost: string;
}

export interface InventoryPositionRow {
  locationId: number; productId: number; location: string; sku: string; product: string;
  categoryLevel1: string | null; categoryLevel2: string | null; categoryLevel3: string | null;
  brand: string | null; primarySupplier: string | null; primarySupplierId: number | null;
  qty: string; unitCost: string; stockValue: string;
  incomingTransitQty: string; incomingTransitValue: string;
  outgoingTransitQty: string; outgoingTransitValue: string;
  companyOwnedValue: string;
}

const key = (locationId: number, productId: number) => `${locationId}:${productId}`;

@Injectable()
export class ReportInventoryService {
  constructor(private readonly dataSource: DataSource, private readonly aging: InventoryAgingService) {}

  private allowedLocations(user: TenantPrincipal, locationId?: number) {
    if (locationId !== undefined && (!Number.isSafeInteger(locationId) || locationId <= 0)) throw new BadRequestException('Invalid location ID.');
    if (locationId !== undefined && user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId))
      throw new BadRequestException('Location is outside assigned scope.');
    return locationId === undefined ? (user.accessScope === 'LOCATION' ? user.assignedLocationIds.map(Number) : null) : [locationId];
  }

  async position(user: TenantPrincipal, locationId?: number): Promise<InventoryPositionRow[]> {
    const allowed = this.allowedLocations(user, locationId);
    if (allowed?.length === 0) return [];
    const clause = allowed ? `AND scope_keys.location_id IN (${allowed.map(() => '?').join(',')})` : '';
    const master: PositionSqlRow[] = await this.dataSource.query(`
      SELECT scope_keys.location_id AS locationId, scope_keys.product_id AS productId, l.name AS location,
        p.sku, p.product_name AS product, ${CATEGORY_LEVELS_SQL},
        brand.brand_name AS brand, s.supplier_name AS primarySupplier, primary_ps.supplier_id AS primarySupplierId,
        COALESCE(b.quantity_on_hand, 0) AS qty, COALESCE(b.average_cost, 0) AS unitCost
      FROM (
        SELECT pl.location_id, pl.product_id FROM tbl_product_location pl
          JOIN tbl_product product_scope ON product_scope.product_id = pl.product_id WHERE product_scope.tenant_id = ?
        UNION SELECT location_id, product_id FROM tbl_inventory_balance WHERE tenant_id = ?
        UNION SELECT t.destination_location_id, line.product_id FROM tbl_stock_transfer t
          JOIN tbl_stock_transfer_line line ON line.stock_transfer_id = t.stock_transfer_id
          WHERE t.tenant_id = ? AND t.status IN ('DISPATCHED','PART_RECEIVED')
        UNION SELECT t.source_location_id, line.product_id FROM tbl_stock_transfer t
          JOIN tbl_stock_transfer_line line ON line.stock_transfer_id = t.stock_transfer_id
          WHERE t.tenant_id = ? AND t.status IN ('DISPATCHED','PART_RECEIVED')
      ) scope_keys
      JOIN tbl_product p ON p.product_id = scope_keys.product_id AND p.tenant_id = ?
      JOIN tbl_category cat ON cat.category_id = p.category_id
      ${CATEGORY_PARENTS_SQL}
      JOIN tbl_location l ON l.location_id = scope_keys.location_id AND l.tenant_id = ?
      LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
      ${PRIMARY_SUPPLIER_SQL}
      LEFT JOIN tbl_inventory_balance b ON b.tenant_id = p.tenant_id AND b.location_id = scope_keys.location_id AND b.product_id = p.product_id
      WHERE p.is_stock_item = 1 ${clause} ORDER BY l.name, p.sku`,
      [user.tenantId, user.tenantId, user.tenantId, user.tenantId, user.tenantId, user.tenantId, ...(allowed ?? [])]);
    type TransitSqlRow = { sourceLocationId: string; destinationLocationId: string; productId: string;
      dispatchedQuantity: string; receivedQuantity: string; transferValue: string; receivedValue: string };
    const transit: TransitSqlRow[] = await this.dataSource.query(`
      SELECT t.source_location_id AS sourceLocationId, t.destination_location_id AS destinationLocationId,
        line.product_id AS productId, line.dispatched_quantity AS dispatchedQuantity,
        line.received_quantity AS receivedQuantity, line.transfer_value AS transferValue,
        COALESCE(received.receivedValue, 0) AS receivedValue
      FROM tbl_stock_transfer t JOIN tbl_stock_transfer_line line ON line.stock_transfer_id = t.stock_transfer_id
      LEFT JOIN (SELECT stock_transfer_line_id, SUM(received_value) AS receivedValue
        FROM tbl_stock_transfer_receipt_line GROUP BY stock_transfer_line_id) received
        ON received.stock_transfer_line_id = line.stock_transfer_line_id
      WHERE t.tenant_id = ? AND t.status IN ('DISPATCHED','PART_RECEIVED')`, [user.tenantId]);
    const amounts = new Map<string, { inQty: bigint; inValue: bigint; outQty: bigint; outValue: bigint }>();
    const get = (id: string) => {
      let value = amounts.get(id);
      if (!value) { value = { inQty: 0n, inValue: 0n, outQty: 0n, outValue: 0n }; amounts.set(id, value); }
      return value;
    };
    for (const row of transit) {
      const qty = units(row.dispatchedQuantity) - units(row.receivedQuantity);
      const value = units(row.transferValue) - units(row.receivedValue);
      if (qty <= 0n) continue;
      const productId = Number(row.productId);
      const incoming = get(key(Number(row.destinationLocationId), productId));
      incoming.inQty += qty; incoming.inValue += value;
      const outgoing = get(key(Number(row.sourceLocationId), productId));
      outgoing.outQty += qty; outgoing.outValue += value;
    }
    return master.map(row => {
      const transitValue = get(key(Number(row.locationId), Number(row.productId)));
      const stockValue = multiply(units(row.qty), units(row.unitCost));
      return { locationId: Number(row.locationId), productId: Number(row.productId), location: row.location,
        sku: row.sku, product: row.product, categoryLevel1: row.categoryLevel1,
        categoryLevel2: row.categoryLevel2, categoryLevel3: row.categoryLevel3, brand: row.brand,
        primarySupplier: row.primarySupplier, primarySupplierId: row.primarySupplierId === null ? null : Number(row.primarySupplierId),
        qty: checked(units(row.qty)), unitCost: checked(units(row.unitCost)), stockValue: checked(stockValue),
        incomingTransitQty: checked(transitValue.inQty), incomingTransitValue: checked(transitValue.inValue),
        outgoingTransitQty: checked(transitValue.outQty), outgoingTransitValue: checked(transitValue.outValue),
        companyOwnedValue: checked(stockValue + transitValue.inValue),
      };
    });
  }

  async currentAging(user: TenantPrincipal, locationId?: number, snapshotDate?: string) {
    const allowed = this.allowedLocations(user, locationId);
    if (allowed?.length === 0) return [];
    if (snapshotDate) {
      const clause = allowed ? `AND snap.location_id IN (${allowed.map(() => '?').join(',')})` : '';
      const rows: Array<Record<string, any>> = await this.dataSource.query(`
        SELECT snap.location_id AS locationId, snap.product_id AS productId,
          l.name AS location, p.sku, p.product_name AS product, ${CATEGORY_LEVELS_SQL},
          brand.brand_name AS brand, s.supplier_name AS primarySupplier,
          primary_ps.supplier_id AS primarySupplierId,
          snap.quantity_on_hand AS quantityOnHand, snap.average_cost AS averageCost,
          snap.inventory_value AS inventoryValue, snap.qty_0_30 AS qty0to30,
          snap.qty_31_60 AS qty31to60, snap.qty_61_90 AS qty61to90,
          snap.qty_91_180 AS qty91to180, snap.qty_181_365 AS qty181to365,
          snap.qty_365_plus AS qty365plus, snap.unknown_qty AS unknownQty,
          snap.attributed_qty AS attributedQty,
          snap.aging_coverage_percentage AS agingCoveragePercentage,
          snap.average_age_days AS averageAgeDays, snap.oldest_age_days AS oldestAgeDays
        FROM tbl_inventory_aging_snapshot snap
        JOIN tbl_product p ON p.product_id = snap.product_id AND p.tenant_id = snap.tenant_id
        JOIN tbl_category cat ON cat.category_id = p.category_id
        ${CATEGORY_PARENTS_SQL}
        JOIN tbl_location l ON l.location_id = snap.location_id AND l.tenant_id = snap.tenant_id
        LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
        ${PRIMARY_SUPPLIER_SQL}
        WHERE snap.tenant_id = ? AND snap.snapshot_date = ? ${clause}
        ORDER BY l.name, p.sku`, [user.tenantId, snapshotDate, ...(allowed ?? [])]);
      return rows.map(row => ({ ...row, locationId: Number(row.locationId), productId: Number(row.productId),
        primarySupplierId: row.primarySupplierId === null ? null : Number(row.primarySupplierId),
        qty: row.quantityOnHand, unitCost: row.averageCost, stockValue: row.inventoryValue,
        agingMode: 'STORED_SNAPSHOT', snapshotDate }));
    }
    const positions = await this.position(user, locationId);
    const dimensions = new Map(positions.map(row => [key(row.locationId, row.productId), row]));
    const rows = (await this.aging.calculateCurrentAging(user, { locationId })).rows;
    return rows.map(row => ({ ...row, ...(dimensions.get(key(row.locationId, row.productId)) ?? {}),
      qty: row.quantityOnHand, unitCost: row.averageCost, stockValue: row.inventoryValue,
      agingMode: 'CURRENT_LIVE', snapshotDate: null }));
  }

  async replenishment(user: TenantPrincipal, from: string, to: string, targetCoverageDays: number, locationId?: number) {
    const horizonDays = inclusiveCalendarDays(from, to);
    if (!Number.isInteger(targetCoverageDays) || targetCoverageDays < 0 || targetCoverageDays > 3650)
      throw new BadRequestException('Target coverage days must be a nonnegative integer.');
    const positions = await this.position(user, locationId);
    const saleRows: Array<{ locationId: string; productId: string; qty: string }> = await this.dataSource.query(`
      SELECT i.location_id AS locationId, d.product_id AS productId, SUM(d.quantity) AS qty
      FROM tbl_invoice i JOIN tbl_invoice_detail d ON d.invoice_id = i.invoice_id
      WHERE i.tenant_id = ? AND i.invoice_status IN ('COMPLETED','PARTIALLY_REFUNDED','FULLY_REFUNDED')
        AND COALESCE(i.business_date, DATE(i.invoice_date)) BETWEEN ? AND ?
      GROUP BY i.location_id, d.product_id`, [user.tenantId, from, to]);
    const returnRows: Array<{ locationId: string; productId: string; qty: string }> = await this.dataSource.query(`
      SELECT r.location_id AS locationId, d.product_id AS productId, SUM(d.quantity) AS qty
      FROM tbl_invoice_refund r JOIN tbl_invoice_refund_detail d ON d.invoice_refund_id = r.invoice_refund_id
      JOIN tbl_invoice i ON i.invoice_id = r.invoice_id AND i.tenant_id = r.tenant_id
      WHERE r.tenant_id = ? AND r.status = 'COMPLETED' AND d.return_to_stock = 1
        AND i.invoice_status IN ('COMPLETED','PARTIALLY_REFUNDED','FULLY_REFUNDED')
        AND COALESCE(r.business_date, DATE(r.refund_date)) BETWEEN ? AND ?
      GROUP BY r.location_id, d.product_id`, [user.tenantId, from, to]);
    const poRows: Array<{ locationId: string; productId: string; orderedQty: string; receivedQty: string; factor: string | null }> = await this.dataSource.query(`
      SELECT po.location_id AS locationId, line.product_id AS productId,
        line.ordered_qty AS orderedQty, line.received_qty AS receivedQty,
        line.conversion_factor_snapshot AS factor
      FROM tbl_purchase_order po JOIN tbl_purchase_order_line line ON line.purchase_order_id = po.purchase_order_id
      WHERE po.tenant_id = ? AND po.is_active = 1 AND po.status IN ('APPROVED','PART_RECEIVED')`, [user.tenantId]);
    type SupplierSqlRow = { productId: string; baselineLeadTimeDays: number | null; productSupplierUnitId: string | null;
      code: string | null; conversionFactor: string | null; quantityPrecision: number | null;
      leadTimeDays: number | null; isDefaultPurchaseUnit: number | null; isBaseUnit: number | null; isActive: number | null };
    const supplierRows: SupplierSqlRow[] = await this.dataSource.query(`
      SELECT ps.product_id AS productId, ps.baseline_lead_time_days AS baselineLeadTimeDays,
        psu.product_supplier_unit_id AS productSupplierUnitId, u.code, pu.conversion_factor AS conversionFactor,
        u.quantity_precision AS quantityPrecision, psu.lead_time_days AS leadTimeDays,
        psu.is_default_purchase_unit AS isDefaultPurchaseUnit, pu.is_base_unit AS isBaseUnit,
        CASE WHEN psu.is_active = 1 AND pu.is_active = 1 AND u.is_active = 1 THEN 1 ELSE 0 END AS isActive
      FROM (SELECT product_id, MIN(supplier_id) AS supplier_id FROM tbl_product_supplier
        WHERE is_active = 1 AND is_primary_supplier = 1 GROUP BY product_id) primary_ps
      JOIN tbl_product_supplier ps ON ps.product_id = primary_ps.product_id
        AND ps.supplier_id = primary_ps.supplier_id
      JOIN tbl_product p ON p.product_id = ps.product_id AND p.tenant_id = ?
      LEFT JOIN tbl_product_supplier_unit psu ON psu.product_supplier_id = ps.product_supplier_id
      LEFT JOIN tbl_product_unit pu ON pu.product_unit_id = psu.product_unit_id
      LEFT JOIN tbl_unit_of_measure u ON u.unit_id = pu.unit_id
      WHERE ps.is_active = 1 AND ps.is_primary_supplier = 1`, [user.tenantId]);
    const demand = (rows: typeof saleRows) => new Map(rows.map(row => [key(Number(row.locationId), Number(row.productId)), row.qty]));
    const sold = demand(saleRows), returned = demand(returnRows);
    const openPo = new Map<string, bigint>();
    const unknownPo = new Set<string>();
    for (const row of poRows) {
      const id = key(Number(row.locationId), Number(row.productId));
      const remainder = units(row.orderedQty) - units(row.receivedQty);
      if (remainder <= 0n) continue;
      if (!row.factor) { unknownPo.add(id); continue; }
      openPo.set(id, (openPo.get(id) ?? 0n) + units(baseQuantity(checked(remainder), row.factor)));
    }
    const suppliers = new Map<number, { baseline: number | null; units: SupplierPurchaseUnit[] }>();
    for (const row of supplierRows) {
      const productId = Number(row.productId);
      let supplier = suppliers.get(productId);
      if (!supplier) { supplier = { baseline: row.baselineLeadTimeDays, units: [] }; suppliers.set(productId, supplier); }
      if (row.productSupplierUnitId && row.code && row.conversionFactor) supplier.units.push({
        productSupplierUnitId: Number(row.productSupplierUnitId), code: row.code,
        conversionFactor: row.conversionFactor, quantityPrecision: Number(row.quantityPrecision),
        leadTimeDays: row.leadTimeDays === null ? null : Number(row.leadTimeDays),
        isDefaultPurchaseUnit: Boolean(row.isDefaultPurchaseUnit), isBaseUnit: Boolean(row.isBaseUnit), isActive: Boolean(row.isActive),
      });
    }
    return positions.map(position => {
      const id = key(position.locationId, position.productId);
      const supplier = suppliers.get(position.productId);
      const lead = resolveLeadTime(supplier?.baseline ?? null, supplier?.units ?? []);
      const openPoBaseQty = checked(openPo.get(id) ?? 0n);
      const result = calculateReplenishment({ onHandQty: position.qty, averageCost: position.unitCost,
        openPoBaseQty, incomingTransferQty: position.incomingTransitQty,
        soldQty: sold.get(id) ?? '0', returnToStockQty: returned.get(id) ?? '0',
        horizonDays, targetCoverageDays, leadTimeDays: lead.leadTimeDays });
      const unavailablePo = unknownPo.has(id);
      const suggestedBaseQty = unavailablePo ? null : result.suggestedBaseQty;
      return { ...position, ...result, ...lead, openPoBaseQty: unavailablePo ? null : openPoBaseQty,
        incomingTransferQty: position.incomingTransitQty, rateFrom: from, rateTo: to, rateHorizonDays: horizonDays,
        targetCoverageDays, suggestedBaseQty,
        reorderStatus: unavailablePo && result.reorderStatus !== 'NO_RECENT_DEMAND' ? 'OPEN_PO_CONVERSION_UNKNOWN' : result.reorderStatus,
        ...purchaseUnitSuggestion(suggestedBaseQty, resolvePurchaseUnit(supplier?.units ?? [])) };
    });
  }
}
