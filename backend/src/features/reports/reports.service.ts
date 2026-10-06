import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

type ReportFilters = { from?: string; to?: string; locationId?: string };

const SALES_SQL = `
  SELECT DATE(i.invoice_date) AS reportDate, l.name AS location, i.invoice_number AS invoice,
    CONCAT_WS(' ', cashier.first_name, cashier.last_name) AS cashier,
    COALESCE(c.customer_name, 'Walk-in') AS customer, cat.category_name AS category,
    p.sku, p.product_name AS product, d.quantity AS qty, d.gross_total AS grossSales,
    (d.gross_total - d.net_total) AS discount, d.net_total AS netSales,
    COALESCE(ledger.movement_value, 0) AS cogs,
    (d.net_total - COALESCE(ledger.movement_value, 0)) AS gp,
    CASE WHEN d.net_total = 0 THEN 0 ELSE ROUND((d.net_total - COALESCE(ledger.movement_value, 0)) / d.net_total * 100, 2) END AS gpPercent,
    COALESCE(refund_detail.refundValue, 0) AS refundValue,
    (d.quantity - COALESCE(refund_detail.refundedQty, 0)) AS netQty, 1 AS billCount,
    COALESCE(s.supplier_name, 'Unassigned') AS primarySupplier
  FROM tbl_invoice i
  JOIN tbl_invoice_detail d ON d.invoice_id = i.invoice_id
  JOIN tbl_product p ON p.product_id = d.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  JOIN tbl_location l ON l.location_id = i.location_id
  LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id
  LEFT JOIN tbl_user cashier ON cashier.user_id = i.created_by_user_id
  LEFT JOIN tbl_inventory_ledger ledger ON ledger.source_document_type = 'INVOICE'
    AND ledger.source_document_id = i.invoice_id AND ledger.source_document_line_id = d.invoice_detail_id
  LEFT JOIN (
    SELECT rd.invoice_detail_id, SUM(rd.refund_amount) AS refundValue, SUM(rd.quantity) AS refundedQty
    FROM tbl_invoice_refund_detail rd
    JOIN tbl_invoice_refund r ON r.invoice_refund_id = rd.invoice_refund_id
      AND r.tenant_id = ? AND r.status = 'COMPLETED' AND DATE(r.refund_date) BETWEEN ? AND ?
    GROUP BY rd.invoice_detail_id
  ) refund_detail ON refund_detail.invoice_detail_id = d.invoice_detail_id
  LEFT JOIN (
    SELECT ps.product_id, MIN(ps.supplier_id) AS supplier_id FROM tbl_product_supplier ps
    WHERE ps.is_primary_supplier = 1 AND ps.is_active = 1 GROUP BY ps.product_id
  ) primary_ps ON primary_ps.product_id = p.product_id
  LEFT JOIN tbl_supplier s ON s.supplier_id = primary_ps.supplier_id
  WHERE i.tenant_id = ? AND i.invoice_status NOT IN ('CANCELLED', 'VOID')
    AND DATE(i.invoice_date) BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY i.invoice_date DESC, i.invoice_id DESC, d.invoice_detail_id
`;

const REFUNDS_SQL = `
  SELECT DATE(r.refund_date) AS reportDate, l.name AS location, r.refund_number AS refund,
    i.invoice_number AS originalInvoice, p.sku, p.product_name AS product,
    cat.category_name AS category, COALESCE(s.supplier_name, 'Unassigned') AS primarySupplier,
    d.quantity AS qty, d.refund_amount AS refundValue, r.reason, r.status
  FROM tbl_invoice_refund r
  JOIN tbl_invoice i ON i.invoice_id = r.invoice_id
  JOIN tbl_invoice_refund_detail d ON d.invoice_refund_id = r.invoice_refund_id
  JOIN tbl_product p ON p.product_id = d.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  JOIN tbl_location l ON l.location_id = r.location_id
  LEFT JOIN (
    SELECT ps.product_id, MIN(ps.supplier_id) AS supplier_id FROM tbl_product_supplier ps
    WHERE ps.is_primary_supplier = 1 AND ps.is_active = 1 GROUP BY ps.product_id
  ) primary_ps ON primary_ps.product_id = p.product_id
  LEFT JOIN tbl_supplier s ON s.supplier_id = primary_ps.supplier_id
  WHERE r.tenant_id = ? AND r.status = 'COMPLETED'
    AND DATE(r.refund_date) BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY r.refund_date DESC, r.invoice_refund_id DESC, d.invoice_refund_detail_id
`;

const PAYMENT_SQL = `
  SELECT DATE(pay.paid_at) AS reportDate, l.name AS location, pm.payment_method_name AS paymentMethod,
    COALESCE(pay.payment_channel_name_snapshot, pc.name, '—') AS channel,
    i.invoice_number AS invoice, COALESCE(c.customer_name, 'Walk-in') AS customer,
    pay.amount AS netSales, pay.amount AS paymentValue, 1 AS billCount
  FROM tbl_invoice_payment pay
  JOIN tbl_invoice i ON i.invoice_id = pay.invoice_id
  JOIN tbl_payment_method pm ON pm.payment_method_id = pay.payment_method_id
  JOIN tbl_location l ON l.location_id = i.location_id
  LEFT JOIN tbl_payment_channel pc ON pc.payment_channel_id = pay.payment_channel_id
  LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id
  WHERE i.tenant_id = ? AND pay.is_reversed = 0 AND DATE(pay.paid_at) BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY pay.paid_at DESC, pay.invoice_payment_id DESC
`;

const STOCK_SQL = `
  SELECT l.name AS location, cat.category_name AS category, p.sku, p.product_name AS product,
    b.quantity_on_hand AS qty, b.average_cost AS unitCost,
    (b.quantity_on_hand * b.average_cost) AS stockValue, b.last_movement_at AS lastMovementAt,
    COALESCE(brand.brand_name, 'Unbranded') AS brand,
    COALESCE(s.supplier_name, 'Unassigned') AS primarySupplier
  FROM tbl_inventory_balance b
  JOIN tbl_product p ON p.product_id = b.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
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
  SELECT DATE(led.movement_date) AS reportDate, l.name AS location, led.movement_type AS movementType,
    led.source_document_type AS sourceDocumentType, led.source_document_id AS sourceDocumentId,
    led.source_document_line_id AS sourceDocumentLineId, p.sku, p.product_name AS product,
    led.quantity_in AS qtyIn, led.quantity_out AS qtyOut, led.unit_cost AS unitCost,
    led.movement_value AS movementValue, led.quantity_before AS qtyBefore, led.quantity_after AS qtyAfter
  FROM tbl_inventory_ledger led
  JOIN tbl_product p ON p.product_id = led.product_id
  JOIN tbl_location l ON l.location_id = led.location_id
  WHERE led.tenant_id = ? AND DATE(led.movement_date) BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY led.movement_date DESC, led.inventory_ledger_id DESC
`;

const AGING_SQL = `
  SELECT age.inventory_age_layer_id AS ageLayerId, l.name AS location, cat.category_name AS category, p.sku, p.product_name AS product,
    age.source_document_type AS sourceDocumentType, age.source_document_id AS sourceDocumentId,
    age.receipt_date AS receiptDate, DATEDIFF(CURDATE(), age.receipt_date) AS ageDays,
    CASE WHEN DATEDIFF(CURDATE(), age.receipt_date) < 31 THEN '0-30 days'
      WHEN DATEDIFF(CURDATE(), age.receipt_date) < 61 THEN '31-60 days'
      WHEN DATEDIFF(CURDATE(), age.receipt_date) < 91 THEN '61-90 days'
      ELSE 'Over 90 days' END AS agingBucket,
    COALESCE(s.supplier_name, 'Unassigned') AS primarySupplier,
    age.remaining_quantity AS qty, age.original_unit_cost AS unitCost,
    (age.remaining_quantity * age.original_unit_cost) AS stockValue, age.batch_number AS batch,
    age.expiry_date AS expiryDate
  FROM tbl_inventory_age_layer age
  JOIN tbl_product p ON p.product_id = age.product_id
  JOIN tbl_category cat ON cat.category_id = p.category_id
  JOIN tbl_location l ON l.location_id = age.location_id
  LEFT JOIN (
    SELECT ps.product_id, MIN(ps.supplier_id) AS supplier_id FROM tbl_product_supplier ps
    WHERE ps.is_primary_supplier = 1 AND ps.is_active = 1 GROUP BY ps.product_id
  ) primary_ps ON primary_ps.product_id = p.product_id
  LEFT JOIN tbl_supplier s ON s.supplier_id = primary_ps.supplier_id
  WHERE age.tenant_id = ? AND age.is_active = 1 AND age.remaining_quantity > 0 {LOCATION_FILTER}
  ORDER BY age.receipt_date, p.product_name
`;

const PURCHASE_ORDER_SQL = `
  SELECT po.order_date AS reportDate, l.name AS location, po.po_number AS purchaseOrder,
    po.status, s.supplier_name AS supplier, p.sku, p.product_name AS product,
    line.ordered_qty AS qty, line.received_qty AS receivedQty, line.line_total AS lineValue
  FROM tbl_purchase_order po
  JOIN tbl_purchase_order_line line ON line.purchase_order_id = po.purchase_order_id
  JOIN tbl_supplier s ON s.supplier_id = po.supplier_id
  JOIN tbl_product p ON p.product_id = line.product_id
  JOIN tbl_location l ON l.location_id = po.location_id
  WHERE po.tenant_id = ? AND po.order_date BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY po.order_date DESC, po.purchase_order_id DESC, line.purchase_order_line_id
`;

const RECEIPT_SQL = `
  SELECT grn.receipt_date AS reportDate, l.name AS location, grn.grn_number AS grn,
    grn.status, s.supplier_name AS supplier, po.po_number AS purchaseOrder,
    p.sku, p.product_name AS product, line.received_qty AS qty, line.line_total AS lineValue
  FROM tbl_goods_receipt grn
  JOIN tbl_goods_receipt_line line ON line.goods_receipt_id = grn.goods_receipt_id
  JOIN tbl_supplier s ON s.supplier_id = grn.supplier_id
  JOIN tbl_product p ON p.product_id = line.product_id
  JOIN tbl_location l ON l.location_id = grn.location_id
  LEFT JOIN tbl_purchase_order po ON po.purchase_order_id = grn.purchase_order_id
  WHERE grn.tenant_id = ? AND grn.status = 'POSTED' AND grn.receipt_date BETWEEN ? AND ? {LOCATION_FILTER}
  ORDER BY grn.receipt_date DESC, grn.goods_receipt_id DESC, line.goods_receipt_line_id
`;

const REGISTER_SQL = `
  SELECT reportRows.reportDate, reportRows.location, reportRows.register, reportRows.terminal,
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
  'inventory-aging': { sql: AGING_SQL, domain: 'inventory' },
  'purchase-orders': { sql: PURCHASE_ORDER_SQL, domain: 'purchasing' },
  'grn-report': { sql: RECEIPT_SQL, domain: 'purchasing' },
  'supplier-purchases': { sql: RECEIPT_SQL, domain: 'purchasing' },
  'refunds': { sql: REFUNDS_SQL, domain: 'refunds' },
  'register-reconciliation': { sql: REGISTER_SQL, domain: 'registers' },
};

const PERMISSION_FOR_REPORT: Record<string, string> = {
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
  'inventory-aging': 'INVENTORY_ADJUSTMENT_VIEW',
  'purchase-orders': 'PURCHASE_ORDER_VIEW',
  'grn-report': 'GRN_VIEW',
  'supplier-purchases': 'GRN_VIEW',
  refunds: 'SALES_REFUND_VIEW',
  'register-reconciliation': 'SALES_REGISTER_CLOSE',
};

@Injectable()
export class ReportsService {
  constructor(private readonly dataSource: DataSource) {}

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
    if (!report) throw new NotFoundException('Report not found.');
    await this.assertPermission(user, PERMISSION_FOR_REPORT[reportId]);

    const now = new Date();
    const defaultTo = now.toISOString().slice(0, 10);
    const defaultFromDate = new Date(now);
    defaultFromDate.setDate(defaultFromDate.getDate() - 29);
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
    let locationClause = '';
    const params: Array<string | number> = [];
    if (report.domain === 'sales') params.push(user.tenantId, from, to);
    params.push(user.tenantId);
    const hasDateRange = !['stock-on-hand', 'stock-valuation', 'inventory-aging'].includes(reportId);
    if (hasDateRange) {
      params.push(from, to);
    }
    if (allowedLocations) {
      if (!allowedLocations.length) {
        locationClause = ' AND 1 = 0';
      } else {
        locationClause = ` AND {LOCATION_COLUMN} IN (${allowedLocations.map(() => '?').join(', ')})`;
        params.push(...allowedLocations);
      }
    }

    const locationColumn = report.domain === 'sales' ? 'i.location_id'
      : report.domain === 'refunds' ? 'r.location_id'
      : report.domain === 'inventory' ? (reportId === 'inventory-movement' ? 'led.location_id' : reportId === 'inventory-aging' ? 'age.location_id' : 'b.location_id')
      : report.domain === 'purchasing' ? (reportId === 'purchase-orders' ? 'po.location_id' : 'grn.location_id')
      : 'reportRows.locationId';
    let sql = report.sql
      .replace('{LOCATION_FILTER}', locationClause.replace('{LOCATION_COLUMN}', locationColumn))
      .replace('{LOCATION_COLUMN}', locationColumn);
    if (reportId === 'credit-sales') sql = sql.replace('AND DATE(i.invoice_date)', 'AND i.is_credit_sale = 1 AND DATE(i.invoice_date)');
    const rows = await this.dataSource.query(sql, params);
    return { reportId, from, to, rows, rowCount: rows.length, measures: this.measureNames(report.domain) };
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

  private measureNames(domain: string) {
    if (domain === 'sales') return ['qty', 'grossSales', 'discount', 'netSales', 'cogs', 'gp', 'gpPercent', 'refundValue', 'netQty', 'billCount'];
    if (domain === 'refunds') return ['qty', 'refundValue'];
    if (domain === 'inventory') return ['qty', 'stockValue', 'movementValue'];
    if (domain === 'purchasing') return ['qty', 'receivedQty', 'lineValue'];
    return ['openingBalance', 'cashierSessionCount', 'paymentValue', 'cashMovementValue', 'expectedCash', 'countedCash', 'variance'];
  }
}
