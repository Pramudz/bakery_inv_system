import { businessDateAt } from '../../common/business-date';
import { checked, units } from '../../common/inventory-decimal';

export const CATEGORY_LEVELS_SQL = `
  CASE WHEN grand.category_id IS NOT NULL THEN grand.category_name
       WHEN parent.category_id IS NOT NULL THEN parent.category_name ELSE cat.category_name END AS categoryLevel1,
  CASE WHEN grand.category_id IS NOT NULL THEN parent.category_name
       WHEN parent.category_id IS NOT NULL THEN cat.category_name ELSE NULL END AS categoryLevel2,
  CASE WHEN grand.category_id IS NOT NULL THEN cat.category_name ELSE NULL END AS categoryLevel3`;

export const CATEGORY_PARENTS_SQL = `
  LEFT JOIN tbl_category parent ON parent.category_id = cat.parent_category_id AND parent.tenant_id = cat.tenant_id
  LEFT JOIN tbl_category grand ON grand.category_id = parent.parent_category_id AND grand.tenant_id = cat.tenant_id`;

export const PRIMARY_SUPPLIER_SQL = `
  LEFT JOIN (
    SELECT ps.product_id, MIN(ps.supplier_id) AS supplier_id FROM tbl_product_supplier ps
    WHERE ps.is_primary_supplier = 1 AND ps.is_active = 1 GROUP BY ps.product_id
  ) primary_ps ON primary_ps.product_id = p.product_id
  LEFT JOIN tbl_supplier s ON s.supplier_id = primary_ps.supplier_id`;

// Sale and refund are separate dated events. A refund therefore belongs to its
// own business period even when the original sale is outside the selected range.
export const SALES_SQL = `
  SELECT events.reportDate, l.name AS location, i.invoice_number AS invoice,
    events.refund, events.eventType, CONCAT_WS(' ', cashier.first_name, cashier.last_name) AS cashier,
    terminal.display_name AS terminal, cash.display_name AS register,
    COALESCE(c.customer_name, 'Walk-in') AS customer, cat.category_name AS category,
    ${CATEGORY_LEVELS_SQL}, COALESCE(events.skuSnapshot, p.sku) AS sku,
    COALESCE(events.productSnapshot, p.product_name) AS product,
    p.product_id AS productId, events.invoiceLineId, events.refundLineId,
    i.printed_location_code AS printedLocationCode, i.printed_register_code AS printedRegisterCode,
    i.bill_no AS billNo, brand.brand_name AS brand,
    events.qty, events.refundQty, events.grossSales, events.discount, events.refundValue,
    events.saleCost, events.returnCost, events.costSource, events.billCount,
    CASE WHEN p.is_stock_item = 1 THEN events.costMissing ELSE 0 END AS cogsMissing,
    s.supplier_name AS primarySupplier
  FROM (
    SELECT CAST(COALESCE(i.business_date, DATE(i.invoice_date)) AS CHAR) AS reportDate,
      i.invoice_id AS invoiceId, i.location_id AS locationId, d.product_id AS productId,
      d.invoice_detail_id AS invoiceLineId, NULL AS refundLineId,
      d.sku_snapshot AS skuSnapshot, d.product_name_snapshot AS productSnapshot,
      NULL AS refund, 'SALE' AS eventType, d.quantity AS qty, 0 AS refundQty,
      d.gross_total AS grossSales, (d.gross_total - d.net_total) AS discount,
      0 AS refundValue, COALESCE(d.cogs_amount, ledger.movement_value) AS saleCost,
      0 AS returnCost, CASE WHEN d.cogs_amount IS NOT NULL THEN 'SNAPSHOT'
        WHEN ledger.inventory_ledger_id IS NOT NULL THEN 'LEDGER_FALLBACK' ELSE 'UNAVAILABLE' END AS costSource,
      1 AS billCount,
      CASE WHEN d.cogs_amount IS NULL AND ledger.inventory_ledger_id IS NULL THEN 1 ELSE 0 END AS costMissing
    FROM tbl_invoice i
    JOIN tbl_invoice_detail d ON d.invoice_id = i.invoice_id
    LEFT JOIN tbl_inventory_ledger ledger ON ledger.tenant_id = i.tenant_id
      AND ledger.source_document_type = 'INVOICE' AND ledger.source_document_id = i.invoice_id
      AND ledger.source_document_line_id = d.invoice_detail_id AND ledger.movement_type = 'SALE'
    WHERE i.tenant_id = ? AND i.invoice_status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED')
      AND COALESCE(i.business_date, DATE(i.invoice_date)) BETWEEN ? AND ? {CREDIT_FILTER}
    UNION ALL
    SELECT CAST(COALESCE(r.business_date, DATE(r.refund_date)) AS CHAR),
      i.invoice_id, r.location_id, rd.product_id,
      NULL, rd.invoice_refund_detail_id, original_detail.sku_snapshot, original_detail.product_name_snapshot,
      r.refund_number, 'REFUND', 0, rd.quantity, 0, 0, rd.refund_amount,
      0, CASE WHEN rd.return_to_stock = 0 THEN 0
        ELSE COALESCE(rd.cogs_reversal_amount, return_ledger.movement_value) END,
      CASE WHEN rd.cogs_reversal_amount IS NOT NULL THEN 'SNAPSHOT'
        WHEN rd.return_to_stock = 0 THEN 'NO_STOCK_RETURN'
        WHEN return_ledger.inventory_ledger_id IS NOT NULL THEN 'LEDGER_FALLBACK' ELSE 'UNAVAILABLE' END,
      0,
      CASE WHEN rd.return_to_stock = 1 AND rd.cogs_reversal_amount IS NULL AND return_ledger.inventory_ledger_id IS NULL THEN 1 ELSE 0 END
    FROM tbl_invoice_refund r
    JOIN tbl_invoice_refund_detail rd ON rd.invoice_refund_id = r.invoice_refund_id
    JOIN tbl_invoice i ON i.invoice_id = r.invoice_id AND i.tenant_id = r.tenant_id
    JOIN tbl_invoice_detail original_detail ON original_detail.invoice_detail_id = rd.invoice_detail_id
    LEFT JOIN tbl_inventory_ledger return_ledger ON return_ledger.tenant_id = r.tenant_id
      AND return_ledger.source_document_type = 'INVOICE_REFUND'
      AND return_ledger.source_document_id = r.invoice_refund_id
      AND return_ledger.source_document_line_id = rd.invoice_refund_detail_id
      AND return_ledger.movement_type = 'SALE_RETURN'
    WHERE r.tenant_id = ? AND r.status = 'COMPLETED'
      AND i.invoice_status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED')
      AND COALESCE(r.business_date, DATE(r.refund_date)) BETWEEN ? AND ? {CREDIT_FILTER}
  ) events
  JOIN tbl_invoice i ON i.invoice_id = events.invoiceId
  JOIN tbl_product p ON p.product_id = events.productId
  JOIN tbl_category cat ON cat.category_id = p.category_id
  ${CATEGORY_PARENTS_SQL}
  JOIN tbl_location l ON l.location_id = events.locationId
  LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
  LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id
  LEFT JOIN tbl_user cashier ON cashier.user_id = i.created_by_user_id
  LEFT JOIN tbl_pos_terminal terminal ON terminal.pos_terminal_id = i.pos_terminal_id
  LEFT JOIN tbl_pos_register_session session ON session.pos_register_session_id = i.pos_register_session_id
  LEFT JOIN tbl_pos_cash_register cash ON cash.pos_cash_register_id = session.pos_cash_register_id
  ${PRIMARY_SUPPLIER_SQL}
  WHERE 1 = 1 {LOCATION_FILTER}
  ORDER BY events.reportDate DESC, events.invoiceId DESC, events.eventType, p.product_id`;

export type SalesEvent = Record<string, unknown> & {
  eventType: 'SALE' | 'REFUND'; qty: number | string; refundQty: number | string;
  grossSales: number | string; discount: number | string; refundValue: number | string;
  saleCost: number | string | null; returnCost: number | string | null; billCount: number | string;
  cogsMissing?: number | string;
};

export function percent4(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) return '0.0000';
  const scaled = numerator * 1_000_000n;
  const negative = (scaled < 0n) !== (denominator < 0n);
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const absoluteNumerator = scaled < 0n ? -scaled : scaled;
  const rounded = (absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator;
  return checked(negative ? -rounded : rounded);
}

export function salesEventRow(event: SalesEvent) {
  const value = (field: keyof SalesEvent) => units(String(event[field] ?? 0));
  const netBefore = value('grossSales') - value('discount');
  const net = netBefore - value('refundValue');
  const missing = value('cogsMissing') > 0n;
  const cost = missing ? null : value('saleCost') - value('returnCost');
  const profit = cost === null ? null : net - cost;
  const percent = profit === null ? null : percent4(profit, net);
  const { saleCost: _saleCost, returnCost: _returnCost, ...rest } = event;
  return { ...rest, netSalesBeforeRefund: checked(netBefore), netSales: checked(net),
    saleCogs: event.eventType === 'SALE' && !missing ? checked(value('saleCost')) : '0.0000',
    cogsReversal: event.eventType === 'REFUND' && !missing ? checked(value('returnCost')) : '0.0000',
    cogs: cost === null ? null : checked(cost), gp: profit === null ? null : checked(profit),
    gpPercent: percent, netQty: checked(value('qty') - value('refundQty')) };
}

export function reportBusinessDate(value: string | Date, timeZone: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return businessDateAt(value instanceof Date ? value : new Date(value), timeZone);
}
