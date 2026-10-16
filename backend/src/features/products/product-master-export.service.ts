import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { businessDateOnly, tenantBusinessClock } from '../../common/business-date';
import { divide4, multiply, units } from '../../common/inventory-decimal';
import { decimal4, discountBreakdown, format4 } from '../price-list-item-discounts/discount-money';
import { PriceListItemDiscountType } from '../price-list-item-discounts/price-list-item-discounts.entity';

export const ITEM_MASTER_HEADERS = [
  'SKU', 'Item Name', 'Category', 'Category Level 2', 'Category Level 3', 'Primary Supplier',
  'Brand', 'Base Unit', 'Current Selling Price', 'Selling Price From', 'Selling Price Valid to',
  'Current Discount value', 'Current Discount %', 'Discount From', 'Discount To', 'Current WAVG',
  'Status', 'Primary Sup Code', 'Primary Sup Name', 'Primary Sup Active Purchase Unit',
  'Primary Sup Current Purchase Price', 'Primary Sup Case Size', 'Current Barcode Primary', 'Product Type',
] as const;

type ExportQuery = { scope: 'TENANT' | 'LOCATION'; priceListId: number; locationId?: number; search: string; status: string; categoryId?: number };
type Row = Record<string, any>;
const positiveId = (value: string | undefined, label: string, required = true) => {
  if (!value && !required) return undefined;
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new BadRequestException(`${label} must be a positive integer.`);
  return Number(value);
};
export function parseItemMasterQuery(query: Record<string, string>): ExportQuery {
  if (query.scope !== 'TENANT' && query.scope !== 'LOCATION') throw new BadRequestException('Export scope must be TENANT or LOCATION.');
  const locationId = positiveId(query.locationId, 'Location ID', query.scope === 'LOCATION');
  if (query.scope === 'TENANT' && query.locationId) throw new BadRequestException('Tenant export does not accept a location.');
  if (query.status && !['active', 'inactive'].includes(query.status)) throw new BadRequestException('Invalid status filter.');
  if ((query.search ?? '').length > 150) throw new BadRequestException('Search is too long.');
  return { scope: query.scope, priceListId: positiveId(query.priceListId, 'Price list ID')!, locationId,
    search: (query.search ?? '').trim(), status: query.status ?? '', categoryId: positiveId(query.categoryId, 'Category ID', false) };
}
export function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const csvLine = (values: readonly unknown[]) => values.map(csvCell).join(',');
const two = (value: bigint) => format4((value + 50n) / 100n * 100n).slice(0, -2);
const byLatest = (a: Row, b: Row, field: string, id: string) =>
  new Date(b[field]).getTime() - new Date(a[field]).getTime() || Number(b[id]) - Number(a[id]);
const group = (rows: Row[], key: string) => {
  const result = new Map<number, Row[]>();
  for (const row of rows) {
    const id = Number(row[key]);
    const existing = result.get(id);
    if (existing) existing.push(row);
    else result.set(id, [row]);
  }
  return result;
};
export function categoryLevels(categoryId: number, categories: Map<number, Row>): string[] {
  const chain: string[] = [];
  const visited = new Set<number>();
  let id: number | null = categoryId;
  while (id && categories.has(id) && !visited.has(id) && chain.length < 3) {
    visited.add(id);
    const row: Row = categories.get(id)!;
    chain.unshift(row.category_name);
    id = row.parent_category_id ? Number(row.parent_category_id) : null;
  }
  // A broken chain or cycle has no reliable level numbering.
  return id ? ['', '', ''] : [chain[0] ?? '', chain[1] ?? '', chain[2] ?? ''];
}
export function consolidatedWavg(balances: Row[], transfers: Row[]): string {
  let quantity = 0n;
  let value = 0n;
  for (const row of balances) {
    const qty = units(row.quantity_on_hand);
    if (qty <= 0n) continue;
    quantity += qty;
    value += multiply(qty, units(row.average_cost));
  }
  for (const row of transfers) {
    const qty = units(row.outstanding_qty);
    if (qty <= 0n) continue;
    quantity += qty;
    value += units(row.outstanding_value);
  }
  return quantity > 0n ? divide4(value, quantity) : '';
}

@Injectable()
export class ProductMasterExportService {
  constructor(private readonly dataSource: DataSource) {}

  async options(user: TenantPrincipal) {
    const manager = this.dataSource.manager;
    const clock = await tenantBusinessClock(manager, user.tenantId);
    const priceLists: Row[] = await manager.query('SELECT price_list_id AS priceListId, code, name, is_default AS isDefault FROM tbl_price_list WHERE tenant_id = ? AND is_active = 1 ORDER BY is_default DESC, name, price_list_id', [user.tenantId]);
    const ids = user.accessScope === 'LOCATION' ? user.assignedLocationIds.map(Number) : [];
    const locations: Row[] = user.accessScope === 'LOCATION' && !ids.length ? [] : await manager.query(
      `SELECT location_id AS locationId, code, name FROM tbl_location WHERE tenant_id = ? AND is_active = 1 ${user.accessScope === 'LOCATION' ? `AND location_id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY name, location_id`,
      user.accessScope === 'LOCATION' ? [user.tenantId, ...ids] : [user.tenantId]);
    return { businessDate: clock.businessDate, canTenantExport: user.accessScope === 'TENANT', priceLists, locations };
  }

  async export(user: TenantPrincipal, raw: Record<string, string>, emit?: (chunk: string) => Promise<void>) {
    const query = parseItemMasterQuery(raw);
    if (query.scope === 'TENANT' && user.accessScope !== 'TENANT')
      throw new ForbiddenException('Tenant-wide cost export requires a tenant-wide role.');
    if (query.scope === 'LOCATION' && user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(query.locationId!))
      throw new ForbiddenException('You do not have access to this location.');
    return this.dataSource.transaction('REPEATABLE READ', async manager => this.build(manager, user, query, emit));
  }

  private async build(manager: EntityManager, user: TenantPrincipal, query: ExportQuery, emit?: (chunk: string) => Promise<void>) {
    const clock = await tenantBusinessClock(manager, user.tenantId);
    const lists: Row[] = await manager.query('SELECT price_list_id, currency_code FROM tbl_price_list WHERE tenant_id = ? AND price_list_id = ? AND is_active = 1', [user.tenantId, query.priceListId]);
    if (!lists.length) throw new BadRequestException('Active price list was not found for this tenant.');
    let locationCode = '';
    if (query.locationId) {
      const locations: Row[] = await manager.query('SELECT code FROM tbl_location WHERE tenant_id = ? AND location_id = ? AND is_active = 1', [user.tenantId, query.locationId]);
      if (!locations.length) throw new BadRequestException('Active location was not found for this tenant.');
      locationCode = locations[0].code;
    }
    const categoryRows: Row[] = await manager.query('SELECT category_id, category_name, parent_category_id FROM tbl_category WHERE tenant_id = ?', [user.tenantId]);
    const categories = new Map(categoryRows.map(row => [Number(row.category_id), row]));
    const lines: string[] = [];
    if (emit) await emit('\uFEFF' + csvLine(ITEM_MASTER_HEADERS) + '\r\n');
    else lines.push(csvLine(ITEM_MASTER_HEADERS));
    let cursorSku = '';
    let cursorId = 0;
    for (;;) {
      const where = [`p.tenant_id = ?`, `(p.sku > ? OR (p.sku = ? AND p.product_id > ?))`];
      const params: unknown[] = [user.tenantId, cursorSku, cursorSku, cursorId];
      if (query.search) {
        where.push(`(p.sku LIKE ? OR p.product_name LIKE ? OR EXISTS (SELECT 1 FROM tbl_product_identifier fi WHERE fi.tenant_id = p.tenant_id AND fi.product_id = p.product_id AND fi.is_active = 1 AND fi.normalized_identifier_value LIKE ?))`);
        params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search.toUpperCase()}%`);
      }
      if (query.categoryId) { where.push('p.category_id = ?'); params.push(query.categoryId); }
      if (query.status) { where.push('p.is_active = ?'); params.push(query.status === 'active' ? 1 : 0); }
      if (query.locationId) {
        where.push('EXISTS (SELECT 1 FROM tbl_product_location pl WHERE pl.product_id = p.product_id AND pl.location_id = ? AND pl.is_active = 1)');
        params.push(query.locationId);
      }
      const products: Row[] = await manager.query(`SELECT p.product_id, p.sku, p.product_name, p.product_type, p.category_id, p.is_active,
        b.brand_name, u.name AS base_unit FROM tbl_product p LEFT JOIN tbl_brand b ON b.brand_id = p.brand_id AND b.tenant_id = p.tenant_id
        JOIN tbl_unit_of_measure u ON u.unit_id = p.base_unit_id AND u.tenant_id = p.tenant_id
        WHERE ${where.join(' AND ')} ORDER BY p.sku, p.product_id LIMIT 500`, params);
      if (!products.length) break;
      const last = products[products.length - 1]; cursorSku = last.sku; cursorId = Number(last.product_id);
      const ids = products.map(row => Number(row.product_id));
      const marks = ids.map(() => '?').join(',');
      const base = [user.tenantId, ...ids];
      const [prices, suppliers, identifiers, balances, transfers] = await Promise.all([
        manager.query(`SELECT pi.*, d.price_list_item_discount_id, d.discount_type, d.discount_value, d.effective_from AS discount_from, d.effective_to AS discount_to
          FROM tbl_price_list_item pi JOIN tbl_product_unit pu ON pu.product_unit_id = pi.product_unit_id AND pu.product_id = pi.product_id
          LEFT JOIN tbl_price_list_item_discount d ON d.price_list_item_id = pi.price_list_item_id AND d.tenant_id = pi.tenant_id
            AND d.is_active = 1 AND d.effective_from <= ? AND (d.effective_to IS NULL OR d.effective_to >= ?)
          WHERE pi.tenant_id = ? AND pi.product_id IN (${marks}) AND pi.price_list_id = ? AND pi.is_active = 1
            AND pu.is_active = 1 AND pu.is_base_unit = 1 AND pu.is_sales_unit = 1 AND pu.conversion_factor = 1
            AND pi.unit_id = pu.unit_id AND pi.currency_code = ? AND pi.minimum_quantity <= 1
            AND pi.effective_from <= ? AND (pi.effective_to IS NULL OR pi.effective_to >= ?)`,
          [clock.now, clock.now, ...base, query.priceListId, lists[0].currency_code, clock.now, clock.now]),
        manager.query(`SELECT ps.product_id, ps.product_supplier_id, ps.is_active AS link_active, s.supplier_code, s.supplier_name, s.is_active AS supplier_active,
          su.product_supplier_unit_id, su.is_active AS supplier_unit_active, su.is_default_purchase_unit, su.supplier_product_code,
          pu.is_active AS product_unit_active, pu.is_purchase_unit, pu.conversion_factor, u.name AS purchase_unit,
          sp.product_supplier_price_id, sp.purchase_price, sp.currency_code, sp.minimum_quantity, sp.effective_from, sp.effective_to, sp.is_active AS price_active
          FROM tbl_product_supplier ps JOIN tbl_supplier s ON s.supplier_id = ps.supplier_id AND s.tenant_id = ?
          LEFT JOIN tbl_product_supplier_unit su ON su.product_supplier_id = ps.product_supplier_id
          LEFT JOIN tbl_product_unit pu ON pu.product_unit_id = su.product_unit_id AND pu.product_id = ps.product_id
          LEFT JOIN tbl_unit_of_measure u ON u.unit_id = pu.unit_id AND u.tenant_id = s.tenant_id
          LEFT JOIN tbl_product_supplier_price sp ON sp.product_supplier_unit_id = su.product_supplier_unit_id
            AND sp.is_active = 1 AND sp.currency_code = ? AND sp.minimum_quantity <= 1
            AND sp.effective_from <= ? AND (sp.effective_to IS NULL OR sp.effective_to >= ?)
          WHERE ps.is_primary_supplier = 1 AND ps.product_id IN (${marks})`, [user.tenantId, lists[0].currency_code, clock.now, clock.now, ...ids]),
        manager.query(`SELECT i.product_id, i.identifier_value, i.product_identifier_id, t.code FROM tbl_product_identifier i
          JOIN tbl_identifier_type t ON t.identifier_type_id = i.identifier_type_id AND t.is_active = 1
          WHERE i.tenant_id = ? AND i.product_id IN (${marks}) AND i.is_active = 1 AND i.is_primary = 1
            AND t.code IN ('BARCODE','EAN','UPC','GTIN') AND (i.valid_from IS NULL OR i.valid_from <= ?)
            AND (i.valid_to IS NULL OR i.valid_to >= ?)`, [...base, clock.now, clock.now]),
        manager.query(`SELECT ib.product_id, ib.location_id, ib.quantity_on_hand, ib.average_cost FROM tbl_inventory_balance ib
          JOIN tbl_location loc ON loc.location_id = ib.location_id AND loc.tenant_id = ib.tenant_id
          WHERE ib.tenant_id = ? AND ib.product_id IN (${marks}) ${query.locationId ? 'AND ib.location_id = ?' : ''}`, query.locationId ? [...base, query.locationId] : base),
        query.scope === 'TENANT' ? manager.query(`SELECT l.product_id, l.dispatched_quantity - l.received_quantity AS outstanding_qty,
          l.transfer_value - COALESCE(SUM(r.received_value), 0) AS outstanding_value
          FROM tbl_stock_transfer_line l JOIN tbl_stock_transfer t ON t.stock_transfer_id = l.stock_transfer_id AND t.tenant_id = ?
          JOIN tbl_location source_loc ON source_loc.location_id = t.source_location_id AND source_loc.tenant_id = t.tenant_id
          JOIN tbl_location destination_loc ON destination_loc.location_id = t.destination_location_id AND destination_loc.tenant_id = t.tenant_id
          LEFT JOIN tbl_stock_transfer_receipt_line r ON r.stock_transfer_line_id = l.stock_transfer_line_id
          WHERE l.product_id IN (${marks}) AND t.status IN ('DISPATCHED','PART_RECEIVED')
            AND l.dispatched_quantity > l.received_quantity AND l.transfer_value IS NOT NULL
          GROUP BY l.stock_transfer_line_id`, base) : Promise.resolve([]),
      ]) as Row[][];
      const priceMap = group(prices, 'product_id'); const supplierMap = group(suppliers, 'product_id');
      const identifierMap = group(identifiers, 'product_id'); const balanceMap = group(balances, 'product_id');
      const transitMap = group(transfers, 'product_id');
      const batchLines: string[] = [];
      for (const product of products) {
        const pid = Number(product.product_id);
        const price = (priceMap.get(pid) ?? []).sort((a, b) => Number(b.minimum_quantity) - Number(a.minimum_quantity) || byLatest(a, b, 'effective_from', 'price_list_item_id'))[0];
        const discounts = (priceMap.get(pid) ?? []).filter(row => row.price_list_item_id === price?.price_list_item_id && row.price_list_item_discount_id);
        const discount = discounts.sort((a, b) => byLatest(a, b, 'discount_from', 'price_list_item_discount_id'))[0];
        const amount = price && discount ? decimal4(discountBreakdown(price.selling_price, discount.discount_type as PriceListItemDiscountType, discount.discount_value).amount) : 0n;
        const percentage = price && discount && decimal4(price.selling_price) > 0n ? (amount * 1_000_000n + decimal4(price.selling_price) / 2n) / decimal4(price.selling_price) : 0n;
        const primary = (supplierMap.get(pid) ?? []).sort((a, b) => Number(a.product_supplier_id) - Number(b.product_supplier_id))[0];
        const eligibleUnits = (supplierMap.get(pid) ?? []).filter(row => row.product_supplier_id === primary?.product_supplier_id && row.link_active && row.supplier_active && row.supplier_unit_active && row.product_unit_active && row.is_purchase_unit);
        const chosenUnit = eligibleUnits.sort((a, b) => Number(b.is_default_purchase_unit) - Number(a.is_default_purchase_unit) || Number(a.product_supplier_unit_id) - Number(b.product_supplier_unit_id))[0];
        const purchasePrice = chosenUnit ? eligibleUnits.filter(row => row.product_supplier_unit_id === chosenUnit.product_supplier_unit_id && row.price_active && row.purchase_price !== null)
          .sort((a, b) => Number(b.minimum_quantity) - Number(a.minimum_quantity) || byLatest(a, b, 'effective_from', 'product_supplier_price_id'))[0] : null;
        const barcode = (identifierMap.get(pid) ?? []).sort((a, b) => Number(a.product_identifier_id) - Number(b.product_identifier_id))[0];
        const wavg = query.scope === 'TENANT' ? consolidatedWavg(balanceMap.get(pid) ?? [], transitMap.get(pid) ?? [])
          : (() => { const balance = (balanceMap.get(pid) ?? [])[0]; return balance && units(balance.quantity_on_hand) > 0n ? format4(units(balance.average_cost)) : ''; })();
        const date = (value: unknown) => businessDateOnly(value as Date | string | null, clock.timeZone) ?? '';
        batchLines.push(csvLine([
          product.sku, product.product_name, ...categoryLevels(Number(product.category_id), categories), primary ? 'Yes' : 'No',
          product.brand_name, product.base_unit, price ? format4(decimal4(price.selling_price)) : '', date(price?.effective_from), date(price?.effective_to),
          two(amount), two(percentage), date(discount?.discount_from), date(discount?.discount_to), wavg,
          product.is_active ? 'Active' : 'Inactive', primary?.supplier_code, primary?.supplier_name,
          chosenUnit?.purchase_unit, purchasePrice ? format4(decimal4(purchasePrice.purchase_price)) : '', chosenUnit?.conversion_factor,
          barcode?.identifier_value, product.product_type,
        ]));
      }
      if (emit) await emit(batchLines.join('\r\n') + '\r\n');
      else lines.push(...batchLines);
      if (products.length < 500) break;
    }
    return { businessDate: clock.businessDate, scope: query.scope, locationCode, csv: emit ? undefined : '\uFEFF' + lines.join('\r\n') };
  }
}
