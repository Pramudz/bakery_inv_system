import { businessDateAt } from '../../common/business-date';

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
    COALESCE(c.customer_name, 'Walk-in') AS customer, cat.category_name AS category,
    ${CATEGORY_LEVELS_SQL}, p.sku, p.product_name AS product,
    events.qty, events.refundQty, events.grossSales, events.discount, events.refundValue,
    events.saleCost, events.returnCost, events.billCount,
    CASE WHEN p.is_stock_item = 1 THEN events.costMissing ELSE 0 END AS cogsMissing,
    COALESCE(s.supplier_name, 'Unassigned') AS primarySupplier
  FROM (
    SELECT CAST(COALESCE(i.business_date, DATE(i.invoice_date)) AS CHAR) AS reportDate,
      i.invoice_id AS invoiceId, i.location_id AS locationId, d.product_id AS productId,
      NULL AS refund, 'SALE' AS eventType, d.quantity AS qty, 0 AS refundQty,
      d.gross_total AS grossSales, (d.gross_total - d.net_total) AS discount,
      0 AS refundValue, COALESCE(ledger.movement_value, 0) AS saleCost,
      0 AS returnCost, 1 AS billCount,
      CASE WHEN ledger.inventory_ledger_id IS NULL THEN 1 ELSE 0 END AS costMissing
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
      r.refund_number, 'REFUND', 0, rd.quantity, 0, 0, rd.refund_amount,
      0, COALESCE(return_ledger.movement_value, 0), 0,
      CASE WHEN rd.return_to_stock = 1 AND return_ledger.inventory_ledger_id IS NULL THEN 1 ELSE 0 END
    FROM tbl_invoice_refund r
    JOIN tbl_invoice_refund_detail rd ON rd.invoice_refund_id = r.invoice_refund_id
    JOIN tbl_invoice i ON i.invoice_id = r.invoice_id AND i.tenant_id = r.tenant_id
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
  LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id
  LEFT JOIN tbl_user cashier ON cashier.user_id = i.created_by_user_id
  ${PRIMARY_SUPPLIER_SQL}
  WHERE 1 = 1 {LOCATION_FILTER}
  ORDER BY events.reportDate DESC, events.invoiceId DESC, events.eventType, p.product_id`;

export type SalesEvent = Record<string, unknown> & {
  eventType: 'SALE' | 'REFUND'; qty: number | string; refundQty: number | string;
  grossSales: number | string; discount: number | string; refundValue: number | string;
  saleCost: number | string; returnCost: number | string; billCount: number | string;
  cogsMissing?: number | string;
};

export function salesEventRow(event: SalesEvent) {
  const value = (field: keyof SalesEvent) => Number(event[field] ?? 0);
  const netSalesBeforeRefund = value('grossSales') - value('discount');
  const netSales = netSalesBeforeRefund - value('refundValue');
  const missing = value('cogsMissing') > 0;
  const cogs = missing ? null : value('saleCost') - value('returnCost');
  const gp = cogs === null ? null : netSales - cogs;
  const { saleCost: _saleCost, returnCost: _returnCost, ...rest } = event;
  return { ...rest, netSalesBeforeRefund, netSales, cogs, gp,
    gpPercent: gp === null ? null : netSales === 0 ? 0 : gp / netSales * 100,
    netQty: value('qty') - value('refundQty') };
}

export function reportBusinessDate(value: string | Date, timeZone: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return businessDateAt(value instanceof Date ? value : new Date(value), timeZone);
}
