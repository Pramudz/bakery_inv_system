import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { businessDateAt, businessDayStart } from '../../common/business-date';
import { Tenant } from '../tenants/tenant.entity';
import { CATEGORY_LEVELS_SQL, CATEGORY_PARENTS_SQL, PRIMARY_SUPPLIER_SQL, SALES_SQL, salesEventRow } from './sales-report';
import { ReportInventoryService } from './report-inventory.service';
import { materializeReport, ReportDataRow, ReportView } from './report-view';
import { TimeGranularity } from './report-period';
import { chartQuery, chartSupported } from './report-chart';

export type ReportFilters = { from?: string; to?: string; locationId?: string; snapshotDate?: string; targetCoverageDays?: string;
  view?: string; granularity?: string; groupBy?: string; page?: string; pageSize?: string; all?: string; chart?: string } & Record<string, string | undefined>;

const REFUNDS_SQL = `
  SELECT CAST(COALESCE(r.business_date, DATE(r.refund_date)) AS CHAR) AS reportDate, l.name AS location, r.refund_number AS refund,
    i.invoice_number AS originalInvoice, p.product_id AS productId, p.sku, p.product_name AS product,
    cat.category_name AS category, ${CATEGORY_LEVELS_SQL},
    brand.brand_name AS brand, s.supplier_name AS primarySupplier,
    d.quantity AS qty, d.refund_amount AS refundValue, r.reason, r.status
  FROM tbl_invoice_refund r
  JOIN tbl_invoice i ON i.invoice_id = r.invoice_id
  JOIN tbl_invoice_refund_detail d ON d.invoice_refund_id = r.invoice_refund_id
  JOIN tbl_product p ON p.product_id = d.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  ${CATEGORY_PARENTS_SQL}
  JOIN tbl_location l ON l.location_id = r.location_id
  LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
  ${PRIMARY_SUPPLIER_SQL}
  WHERE r.tenant_id = ? AND r.status = 'COMPLETED'
    AND COALESCE(r.business_date, DATE(r.refund_date)) BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY r.refund_date DESC, r.invoice_refund_id DESC, d.invoice_refund_detail_id
`;

const PAYMENT_SQL = `
  SELECT pay.paid_at AS eventAt, l.name AS location, pm.payment_method_name AS paymentMethod,
    COALESCE(pay.payment_method_type_snapshot, pm.payment_method_type) AS paymentMethodType,
    CASE WHEN COALESCE(pay.payment_method_type_snapshot, pm.payment_method_type) = 'CARD'
      THEN pay.payment_channel_id ELSE NULL END AS channelId,
    CASE WHEN COALESCE(pay.payment_method_type_snapshot, pm.payment_method_type) = 'CARD'
      THEN pay.payment_channel_code_snapshot ELSE NULL END AS channelCode,
    CASE WHEN COALESCE(pay.payment_method_type_snapshot, pm.payment_method_type) = 'CARD'
      THEN COALESCE(pay.payment_channel_name_snapshot, pc.name) ELSE NULL END AS channel,
    i.invoice_number AS invoice, COALESCE(c.customer_name, 'Walk-in') AS customer,
    pay.reference_number AS externalReference, pay.invoice_payment_id AS paymentId,
    CONCAT_WS(' ', cashier.first_name, cashier.last_name) AS cashier,
    terminal.display_name AS terminal, cash.display_name AS register,
    pay.amount AS paymentValue, 1 AS paymentCount, 1 AS billCount
  FROM tbl_invoice_payment pay
  JOIN tbl_invoice i ON i.invoice_id = pay.invoice_id
  JOIN tbl_payment_method pm ON pm.payment_method_id = pay.payment_method_id
  JOIN tbl_location l ON l.location_id = i.location_id
  LEFT JOIN tbl_payment_channel pc ON pc.payment_channel_id = pay.payment_channel_id
  LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id
  LEFT JOIN tbl_user cashier ON cashier.user_id = pay.created_by_user_id
  LEFT JOIN tbl_pos_terminal terminal ON terminal.pos_terminal_id = pay.pos_terminal_id
  LEFT JOIN tbl_pos_register_session session ON session.pos_register_session_id = pay.pos_register_session_id
  LEFT JOIN tbl_pos_cash_register cash ON cash.pos_cash_register_id = session.pos_cash_register_id
  WHERE i.tenant_id = ? AND i.invoice_status IN ('COMPLETED','PARTIALLY_REFUNDED','FULLY_REFUNDED')
    AND pay.is_reversed = 0 AND pay.paid_at >= ? AND pay.paid_at < ? {LOCATION_FILTER}
  ORDER BY pay.paid_at DESC, pay.invoice_payment_id DESC
`;

const STOCK_SQL = `
  SELECT l.name AS location, cat.category_name AS category, ${CATEGORY_LEVELS_SQL}, p.sku, p.product_name AS product,
    b.quantity_on_hand AS qty, b.average_cost AS unitCost,
    (b.quantity_on_hand * b.average_cost) AS stockValue, b.last_movement_at AS lastMovementAt,
    COALESCE(brand.brand_name, 'Unbranded') AS brand,
    COALESCE(s.supplier_name, 'Unassigned') AS primarySupplier
  FROM tbl_inventory_balance b
  JOIN tbl_product p ON p.product_id = b.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  ${CATEGORY_PARENTS_SQL}
  JOIN tbl_location l ON l.location_id = b.location_id
  LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
  LEFT JOIN (
    SELECT ps.product_id, MIN(ps.supplier_id) AS supplier_id FROM tbl_product_supplier ps
    WHERE ps.is_primary_supplier = 1 AND ps.is_active = 1 GROUP BY ps.product_id
  ) primary_ps ON primary_ps.product_id = p.product_id
  LEFT JOIN tbl_supplier s ON s.supplier_id = primary_ps.supplier_id
  WHERE b.tenant_id = ? {LOCATION_FILTER}
  ORDER BY l.name, cat.category_name, p.product_name
`;

const MOVEMENT_SQL = `
  SELECT led.movement_date AS eventAt, l.name AS location, led.movement_type AS movementType,
    led.source_document_type AS sourceDocumentType, led.source_document_id AS sourceDocumentId,
    led.source_document_line_id AS sourceDocumentLineId, p.product_id AS productId, p.sku, p.product_name AS product,
    led.quantity_in AS qtyIn, led.quantity_out AS qtyOut, led.unit_cost AS unitCost,
    led.movement_value AS movementValue, led.quantity_before AS qtyBefore, led.quantity_after AS qtyAfter
  FROM tbl_inventory_ledger led
  JOIN tbl_product p ON p.product_id = led.product_id
  JOIN tbl_location l ON l.location_id = led.location_id
  WHERE led.tenant_id = ? AND led.movement_date >= ? AND led.movement_date < ? {LOCATION_FILTER}
  ORDER BY led.movement_date DESC, led.inventory_ledger_id DESC
`;

const PURCHASE_ORDER_SQL = `
  SELECT CAST(po.order_date AS CHAR) AS reportDate, l.name AS location, po.po_number AS purchaseOrder,
    po.status, doc_supplier.supplier_name AS supplier, p.product_id AS productId, p.sku, p.product_name AS product,
    ${CATEGORY_LEVELS_SQL}, brand.brand_name AS brand, s.supplier_name AS primarySupplier,
    line.ordered_qty AS qty, line.received_qty AS receivedQty, line.line_total AS lineValue
  FROM tbl_purchase_order po
  JOIN tbl_purchase_order_line line ON line.purchase_order_id = po.purchase_order_id
  JOIN tbl_supplier doc_supplier ON doc_supplier.supplier_id = po.supplier_id
  JOIN tbl_product p ON p.product_id = line.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  ${CATEGORY_PARENTS_SQL}
  JOIN tbl_location l ON l.location_id = po.location_id
  LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
  ${PRIMARY_SUPPLIER_SQL}
  WHERE po.tenant_id = ? AND po.order_date BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY po.order_date DESC, po.purchase_order_id DESC, line.purchase_order_line_id
`;

const RECEIPT_SQL = `
  SELECT CAST(grn.receipt_date AS CHAR) AS reportDate, l.name AS location, grn.grn_number AS grn,
    grn.status, doc_supplier.supplier_name AS supplier, po.po_number AS purchaseOrder,
    p.product_id AS productId, p.sku, p.product_name AS product,
    ${CATEGORY_LEVELS_SQL}, brand.brand_name AS brand, s.supplier_name AS primarySupplier,
    line.received_qty AS qty, line.line_total AS lineValue
  FROM tbl_goods_receipt grn
  JOIN tbl_goods_receipt_line line ON line.goods_receipt_id = grn.goods_receipt_id
  JOIN tbl_supplier doc_supplier ON doc_supplier.supplier_id = grn.supplier_id
  JOIN tbl_product p ON p.product_id = line.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  ${CATEGORY_PARENTS_SQL}
  JOIN tbl_location l ON l.location_id = grn.location_id
  LEFT JOIN tbl_purchase_order po ON po.purchase_order_id = grn.purchase_order_id
  LEFT JOIN tbl_brand brand ON brand.brand_id = p.brand_id
  ${PRIMARY_SUPPLIER_SQL}
  WHERE grn.tenant_id = ? AND grn.status = 'POSTED' AND grn.receipt_date BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY grn.receipt_date DESC, grn.goods_receipt_id DESC, line.goods_receipt_line_id
`;

const REGISTER_SQL = `
  SELECT CAST(reportRows.reportDate AS CHAR) AS reportDate, reportRows.location, reportRows.register, reportRows.terminal,
    reportRows.status, reportRows.eventType, reportRows.sessionId, reportRows.cashier,
    reportRows.paymentMethod, reportRows.channel, reportRows.invoice, reportRows.movementType,
    reportRows.sourceDocument, reportRows.amount, reportRows.openingBalance,
    reportRows.paymentValue, reportRows.cashMovementValue, reportRows.cashierSessionCount,
    reportRows.openedAt, reportRows.closedAt, reportRows.openedBy, reportRows.closedBy,
    reportRows.expectedCash, reportRows.countedCash, reportRows.variance, reportRows.reconciliationStatus
  FROM (
    SELECT session.tenant_id AS tenantId, session.location_id AS locationId,
      session.business_date AS reportDate, l.name AS location, cash.display_name AS register,
      terminal.display_name AS terminal, session.status, 'REGISTER SESSION' AS eventType,
      session.pos_register_session_id AS sessionId, NULL AS cashier, NULL AS paymentMethod,
      NULL AS channel, NULL AS invoice, NULL AS movementType, NULL AS sourceDocument,
      NULL AS amount, session.opening_balance AS openingBalance, 0 AS paymentValue,
      0 AS cashMovementValue, 0 AS cashierSessionCount, session.opened_at AS openedAt,
      session.closed_at AS closedAt, CONCAT_WS(' ', opener.first_name, opener.last_name) AS openedBy,
      CONCAT_WS(' ', closer.first_name, closer.last_name) AS closedBy,
      reconciliation.expectedCash, reconciliation.countedCash, reconciliation.variance,
      reconciliation.reconciliationStatus
    FROM tbl_pos_register_session session
    JOIN tbl_pos_cash_register cash ON cash.pos_cash_register_id = session.pos_cash_register_id
    LEFT JOIN tbl_pos_terminal terminal ON terminal.pos_terminal_id = cash.pos_terminal_id
    JOIN tbl_location l ON l.location_id = session.location_id
    JOIN tbl_user opener ON opener.user_id = session.opened_by_user_id
    LEFT JOIN tbl_user closer ON closer.user_id = session.closed_by_user_id
    LEFT JOIN (
      SELECT latest.pos_register_session_id, SUM(latest.expected_cash) AS expectedCash,
        SUM(COALESCE(latest.counted_cash, 0)) AS countedCash,
        SUM(COALESCE(latest.cashier_variance, 0)) AS variance,
        GROUP_CONCAT(DISTINCT latest.status ORDER BY latest.status SEPARATOR ', ') AS reconciliationStatus
      FROM tbl_pos_cash_reconciliation latest
      JOIN (
        SELECT pos_cashier_session_id, MAX(attempt_number) AS maxAttempt
        FROM tbl_pos_cash_reconciliation
        GROUP BY pos_cashier_session_id
      ) lastAttempt ON lastAttempt.pos_cashier_session_id = latest.pos_cashier_session_id
        AND lastAttempt.maxAttempt = latest.attempt_number
      GROUP BY latest.pos_register_session_id
    ) reconciliation ON reconciliation.pos_register_session_id = session.pos_register_session_id
    UNION ALL
    SELECT session.tenant_id, session.location_id, session.business_date, l.name,
      cash.display_name, terminal.display_name, session.status, 'CASHIER SESSION',
      session.pos_register_session_id, CONCAT_WS(' ', cashier.first_name, cashier.last_name),
      NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 1,
      cashierSession.started_at, cashierSession.ended_at, NULL, NULL, NULL, NULL, NULL, NULL
    FROM tbl_pos_cashier_session cashierSession
    JOIN tbl_pos_register_session session ON session.pos_register_session_id = cashierSession.pos_register_session_id
    JOIN tbl_pos_cash_register cash ON cash.pos_cash_register_id = session.pos_cash_register_id
    LEFT JOIN tbl_pos_terminal terminal ON terminal.pos_terminal_id = cashierSession.pos_terminal_id
    JOIN tbl_location l ON l.location_id = session.location_id
    JOIN tbl_user cashier ON cashier.user_id = cashierSession.cashier_user_id
    UNION ALL
    SELECT session.tenant_id, session.location_id, session.business_date, l.name,
      cash.display_name, terminal.display_name, session.status, 'PAYMENT',
      session.pos_register_session_id, CONCAT_WS(' ', cashier.first_name, cashier.last_name),
      pm.payment_method_name, COALESCE(pay.payment_channel_name_snapshot, pc.name, '—'),
      invoice.invoice_number, NULL, CONCAT('PAY-', pay.invoice_payment_id), pay.amount, 0,
      pay.amount, 0, 0, session.opened_at, session.closed_at, NULL, NULL, NULL, NULL, NULL, NULL
    FROM tbl_invoice_payment pay
    JOIN tbl_pos_register_session session ON session.pos_register_session_id = pay.pos_register_session_id
    JOIN tbl_pos_cash_register cash ON cash.pos_cash_register_id = session.pos_cash_register_id
    LEFT JOIN tbl_pos_terminal terminal ON terminal.pos_terminal_id = pay.pos_terminal_id
    LEFT JOIN tbl_pos_cashier_session cashierSession ON cashierSession.pos_cashier_session_id = pay.pos_cashier_session_id
    LEFT JOIN tbl_user cashier ON cashier.user_id = cashierSession.cashier_user_id
    JOIN tbl_invoice invoice ON invoice.invoice_id = pay.invoice_id
    JOIN tbl_payment_method pm ON pm.payment_method_id = pay.payment_method_id
    LEFT JOIN tbl_payment_channel pc ON pc.payment_channel_id = pay.payment_channel_id
    JOIN tbl_location l ON l.location_id = session.location_id
    WHERE pay.is_reversed = 0
    UNION ALL
    SELECT session.tenant_id, session.location_id, session.business_date, l.name,
      cash.display_name, terminal.display_name, session.status, 'CASH MOVEMENT',
      session.pos_register_session_id, CONCAT_WS(' ', cashier.first_name, cashier.last_name),
      NULL, NULL, NULL, CONCAT(movement.direction, ': ', movement.movement_type),
      CONCAT(movement.source_type, '-', movement.source_id), movement.amount, 0, 0,
      movement.amount, 0, session.opened_at, session.closed_at, NULL, NULL, NULL, NULL, NULL, NULL
    FROM tbl_pos_cash_movement movement
    JOIN tbl_pos_register_session session ON session.pos_register_session_id = movement.pos_register_session_id
    JOIN tbl_pos_cash_register cash ON cash.pos_cash_register_id = session.pos_cash_register_id
    LEFT JOIN tbl_pos_terminal terminal ON terminal.pos_terminal_id = cash.pos_terminal_id
    LEFT JOIN tbl_pos_cashier_session cashierSession ON cashierSession.pos_cashier_session_id = movement.pos_cashier_session_id
    LEFT JOIN tbl_user cashier ON cashier.user_id = cashierSession.cashier_user_id
    JOIN tbl_location l ON l.location_id = session.location_id
  ) reportRows
  WHERE reportRows.tenantId = ? AND reportRows.reportDate BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY reportRows.reportDate DESC, reportRows.sessionId DESC, reportRows.eventType
`;

const REPORT_QUERIES: Record<string, { sql: string; domain: string }> = {
  // Legacy IDs remain for saved links and API clients; the report library uses the consolidated IDs.
  'sales-analysis': { sql: SALES_SQL, domain: 'sales' },
  'payment-analysis': { sql: PAYMENT_SQL, domain: 'sales' },
  'gross-sales': { sql: SALES_SQL, domain: 'sales' },
  'daily-sales': { sql: SALES_SQL, domain: 'sales' },
  'product-sales': { sql: SALES_SQL, domain: 'sales' },
  'category-sales': { sql: SALES_SQL, domain: 'sales' },
  'cashier-sales': { sql: SALES_SQL, domain: 'sales' },
  'customer-sales': { sql: SALES_SQL, domain: 'sales' },
  'credit-sales': { sql: SALES_SQL, domain: 'sales' },
  'supplier-sales': { sql: SALES_SQL, domain: 'sales' },
  'payment-methods': { sql: PAYMENT_SQL, domain: 'sales' },
  'stock-on-hand': { sql: STOCK_SQL, domain: 'inventory' },
  'stock-valuation': { sql: STOCK_SQL, domain: 'inventory' },
  'inventory-movement': { sql: MOVEMENT_SQL, domain: 'inventory' },
  'purchase-orders': { sql: PURCHASE_ORDER_SQL, domain: 'purchasing' },
  'grn-report': { sql: RECEIPT_SQL, domain: 'purchasing' },
  'supplier-purchases': { sql: RECEIPT_SQL, domain: 'purchasing' },
  'refunds': { sql: REFUNDS_SQL, domain: 'refunds' },
  'register-reconciliation': { sql: REGISTER_SQL, domain: 'registers' },
};

const PERMISSION_FOR_REPORT: Record<string, string> = {
  'sales-analysis': 'SALES_INVOICE_VIEW',
  'payment-analysis': 'SALES_INVOICE_VIEW',
  'inventory-position': 'INVENTORY_ADJUSTMENT_VIEW',
  'inventory-aging': 'INVENTORY_AGING_VIEW',
  'stock-replenishment': 'INVENTORY_ADJUSTMENT_VIEW',
  'gross-sales': 'SALES_INVOICE_VIEW',
  'daily-sales': 'SALES_INVOICE_VIEW',
  'product-sales': 'SALES_INVOICE_VIEW',
  'category-sales': 'SALES_INVOICE_VIEW',
  'cashier-sales': 'SALES_INVOICE_VIEW',
  'customer-sales': 'SALES_INVOICE_VIEW',
  'supplier-sales': 'SALES_INVOICE_VIEW',
  'payment-methods': 'SALES_INVOICE_VIEW',
  'credit-sales': 'SALES_INVOICE_VIEW',
  'stock-on-hand': 'INVENTORY_ADJUSTMENT_VIEW',
  'stock-valuation': 'INVENTORY_ADJUSTMENT_VIEW',
  'inventory-movement': 'INVENTORY_ADJUSTMENT_VIEW',
  'purchase-orders': 'PURCHASE_ORDER_VIEW',
  'grn-report': 'GRN_VIEW',
  'supplier-purchases': 'GRN_VIEW',
  refunds: 'SALES_REFUND_VIEW',
  'register-reconciliation': 'SALES_REGISTER_CLOSE',
};

const SUPPORTED_VIEWS: Record<string, readonly ReportView[]> = {
  'sales-analysis': ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'],
  'credit-sales': ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'],
  'payment-analysis': ['SUMMARY', 'DOCUMENT_DETAIL'],
  'inventory-position': ['SUMMARY', 'ITEM_DETAIL'],
  'inventory-movement': ['SUMMARY', 'DOCUMENT_DETAIL'],
  'inventory-aging': ['SUMMARY', 'ITEM_DETAIL'],
  'stock-replenishment': ['ITEM_DETAIL'],
  'purchase-orders': ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'],
  'grn-report': ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'],
  'supplier-purchases': ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'],
  refunds: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'],
  'register-reconciliation': ['SUMMARY', 'DOCUMENT_DETAIL'],
};

const SUPPORTED_GROUPS: Record<string, readonly string[]> = {
  'sales-analysis': ['location', 'product', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'cashier', 'customer', 'primarySupplier', 'brand'],
  'credit-sales': ['location', 'product', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'cashier', 'customer', 'primarySupplier', 'brand'],
  'payment-analysis': ['paymentMethod', 'channel', 'location'],
  'inventory-position': ['location', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier'],
  'inventory-movement': ['location', 'movementType', 'product'],
  'inventory-aging': ['location', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier'],
  'stock-replenishment': [],
  'purchase-orders': ['supplier', 'status', 'purchaseOrder', 'product'],
  'grn-report': ['supplier', 'location', 'grn', 'product'],
  'supplier-purchases': ['supplier', 'product', 'grn'],
  refunds: ['location', 'primarySupplier', 'product'],
  'register-reconciliation': ['location', 'register', 'terminal', 'eventType'],
};

@Injectable()
export class ReportsService {
  constructor(private readonly dataSource: DataSource, private readonly inventory: ReportInventoryService) {}

  locations(user: TenantPrincipal) {
    const params: Array<string | number> = [user.tenantId];
    let locationClause = '';
    if (user.accessScope === 'LOCATION') {
      if (!user.assignedLocationIds.length) return [];
      locationClause = ` AND location_id IN (${user.assignedLocationIds.map(() => '?').join(', ')})`;
      params.push(...user.assignedLocationIds.map(Number));
    }
    return this.dataSource.query(
      `SELECT location_id AS locationId, code, name
       FROM tbl_location
       WHERE tenant_id = ? AND is_active = 1${locationClause}
       ORDER BY name`,
      params,
    );
  }

  async run(reportId: string, filters: ReportFilters, user: TenantPrincipal) {
    const report = REPORT_QUERIES[reportId];
    const inventoryReport = ['inventory-position', 'inventory-aging', 'stock-replenishment'].includes(reportId);
    if (!report && !inventoryReport) throw new NotFoundException('Report not found.');
    await this.assertPermission(user, PERMISSION_FOR_REPORT[reportId]);

    const tenant = await this.dataSource.getRepository(Tenant).findOneBy({ tenantId: user.tenantId });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    const timeZone = tenant.timeZone;
    const defaultTo = businessDateAt(new Date(), timeZone);
    const defaultFromDate = new Date(`${defaultTo}T00:00:00Z`);
    defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
    const from = filters.from || defaultFromDate.toISOString().slice(0, 10);
    const to = filters.to || defaultTo;
    if (!this.isDate(from) || !this.isDate(to) || from > to) {
      throw new BadRequestException('A valid date range is required.');
    }
    const location = filters.locationId ? Number(filters.locationId) : undefined;
    if (location !== undefined && (!Number.isSafeInteger(location) || location <= 0)) {
      throw new BadRequestException('Location ID must be a positive integer.');
    }

    const visibleLocations = user.accessScope === 'LOCATION'
      ? user.assignedLocationIds.map(Number)
      : undefined;
    if (location && visibleLocations && !visibleLocations.includes(location)) {
      throw new ForbiddenException('You do not have access to this location.');
    }
    const allowedLocations = location ? [location] : visibleLocations;
    if (filters.chart && (filters.chart !== '1' || filters.view !== 'SUMMARY' ||
      (filters.granularity || 'AGGREGATED') !== 'AGGREGATED' || !chartSupported(reportId)))
      throw new BadRequestException('Chart requires an aggregated summary report.');
    if (inventoryReport) {
      if (reportId === 'inventory-position') {
        const rows = await this.inventory.position(user, location);
        return this.result(reportId, from, to, rows as unknown as ReportDataRow[],
          ['qty', 'stockValue', 'incomingTransitQty', 'incomingTransitValue', 'outgoingTransitQty', 'outgoingTransitValue', 'companyOwnedValue'], filters);
      }
      if (reportId === 'inventory-aging') {
        if (filters.snapshotDate && !this.isDate(filters.snapshotDate)) throw new BadRequestException('Invalid snapshot date.');
        const rows = await this.inventory.currentAging(user, location, filters.snapshotDate);
        return this.result(reportId, from, to, rows as unknown as ReportDataRow[],
          ['qty', 'stockValue', 'qty0to30', 'qty31to60', 'qty61to90', 'qty91to180', 'qty181to365', 'qty365plus', 'unknownQty', 'attributedQty'], filters);
      }
      const targetCoverageDays = filters.targetCoverageDays === undefined || filters.targetCoverageDays === '' ? 14 : Number(filters.targetCoverageDays);
      const rows = await this.inventory.replenishment(user, from, to, targetCoverageDays, location);
      return this.result(reportId, from, to, rows as unknown as ReportDataRow[],
        ['qty', 'stockValue', 'openPoBaseQty', 'incomingTransferQty', 'inventoryPositionQty', 'consumptionQty', 'perDayRate', 'suggestedBaseQty'], filters);
    }
    if (!report) throw new NotFoundException('Report not found.');
    let locationClause = '';
    const params: Array<string | number | Date> = [];
    if (report.sql === SALES_SQL) params.push(user.tenantId, from, to, user.tenantId, from, to);
    if (report.sql !== SALES_SQL) params.push(user.tenantId);
    const hasDateRange = !['stock-on-hand', 'stock-valuation', 'inventory-aging'].includes(reportId);
    if (hasDateRange) {
      if (reportId === 'payment-methods' || reportId === 'payment-analysis' || reportId === 'inventory-movement') {
        const nextDay = new Date(`${to}T00:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        params.push(businessDayStart(from, timeZone), businessDayStart(nextDay.toISOString().slice(0, 10), timeZone));
      } else if (report.sql !== SALES_SQL) params.push(from, to);
    }
    if (allowedLocations) {
      if (!allowedLocations.length) {
        locationClause = ' AND 1 = 0';
      } else {
        locationClause = ` AND {LOCATION_COLUMN} IN (${allowedLocations.map(() => '?').join(', ')})`;
        params.push(...allowedLocations);
      }
    }

    const locationColumn = report.sql === SALES_SQL ? 'events.locationId'
      : report.domain === 'sales' ? 'i.location_id'
      : report.domain === 'refunds' ? 'r.location_id'
      : report.domain === 'inventory' ? (reportId === 'inventory-movement' ? 'led.location_id' : reportId === 'inventory-aging' ? 'age.location_id' : 'b.location_id')
      : report.domain === 'purchasing' ? (reportId === 'purchase-orders' ? 'po.location_id' : 'grn.location_id')
      : 'reportRows.locationId';
    let sql = report.sql
      .replace('{LOCATION_FILTER}', locationClause.replace('{LOCATION_COLUMN}', locationColumn))
      .replace('{LOCATION_COLUMN}', locationColumn);
    sql = sql.replaceAll('{CREDIT_FILTER}', reportId === 'credit-sales' ? 'AND i.is_credit_sale = 1' : '');
    if (filters.chart === '1') {
      const chart = chartQuery(reportId, sql, filters.groupBy || '', filters, params, SUPPORTED_GROUPS[reportId] ?? []);
      const rows = await this.dataSource.query(chart.sql, chart.params) as ReportDataRow[];
      return { reportId, from, to, view: 'SUMMARY', granularity: 'AGGREGATED', groupBy: filters.groupBy,
        metric: chart.metric, rows };
    }
    const rawRows = await this.dataSource.query(sql, params);
    const rows = report.sql === SALES_SQL
      ? rawRows.map(salesEventRow)
      : (reportId === 'payment-methods' || reportId === 'payment-analysis' || reportId === 'inventory-movement')
        ? rawRows.map(({ eventAt, ...row }: { eventAt: Date; [key: string]: unknown }) => ({ reportDate: businessDateAt(eventAt, timeZone), ...row }))
        : rawRows;
    return this.result(reportId, from, to, rows as ReportDataRow[], this.measureNames(reportId, report.domain), filters);
  }

  private result(reportId: string, from: string, to: string, rows: ReportDataRow[], measures: string[], filters: ReportFilters) {
    if (!filters.view) return { reportId, from, to, rows, rowCount: rows.length, measures };
    const view = filters.view as ReportView;
    const granularity = (filters.granularity || 'AGGREGATED') as TimeGranularity;
    if (!['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'].includes(view)) throw new BadRequestException('Invalid report view.');
    if (!['AGGREGATED', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(granularity)) throw new BadRequestException('Invalid time granularity.');
    if (SUPPORTED_VIEWS[reportId] && !SUPPORTED_VIEWS[reportId].includes(view))
      throw new BadRequestException('Unsupported view for this report.');
    if (filters.groupBy && SUPPORTED_GROUPS[reportId] && !SUPPORTED_GROUPS[reportId].includes(filters.groupBy))
      throw new BadRequestException('Unsupported grouping for this report.');
    const page = filters.page === undefined ? 1 : Number(filters.page);
    const pageSize = filters.pageSize === undefined ? 50 : Number(filters.pageSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000)
      throw new BadRequestException('Invalid report pagination.');
    const result = materializeReport(rows, reportId, view, granularity, filters.groupBy || '', filters,
      page, pageSize, filters.all === '1');
    return { reportId, from, to, view, granularity, groupBy: filters.groupBy || '', measures, ...result };
  }

  private async assertPermission(user: TenantPrincipal, code: string) {
    if (user.roleCode === 'TENANT_ADMIN') return;
    const permission = await this.dataSource.getRepository(Permission).findOneBy({ code, isActive: true });
    if (!permission) throw new ForbiddenException('Report permission is unavailable.');
    const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({
      tenantId: user.tenantId,
      moduleId: permission.moduleId,
      isEnabled: true,
    });
    if (!enabled) throw new ForbiddenException('The required module is not enabled for this tenant.');
    const grant = await this.dataSource.getRepository(RolePermission).findOneBy({
      roleId: user.roleId,
      permissionId: permission.permissionId,
    });
    if (!grant) throw new ForbiddenException('You do not have permission to view this report.');
  }

  private isDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  private measureNames(reportId: string, domain: string) {
    if (reportId === 'payment-methods' || reportId === 'payment-analysis') return ['paymentValue', 'paymentCount'];
    if (domain === 'sales') return ['qty', 'refundQty', 'grossSales', 'discount', 'netSalesBeforeRefund', 'refundValue', 'netSales', 'cogs', 'gp', 'gpPercent', 'netQty', 'billCount', 'cogsMissing'];
    if (domain === 'refunds') return ['qty', 'refundValue'];
    if (domain === 'inventory') return ['qty', 'stockValue', 'movementValue'];
    if (domain === 'purchasing') return ['qty', 'receivedQty', 'lineValue'];
    return ['openingBalance', 'cashierSessionCount', 'paymentValue', 'cashMovementValue', 'expectedCash', 'countedCash', 'variance'];
  }
}
