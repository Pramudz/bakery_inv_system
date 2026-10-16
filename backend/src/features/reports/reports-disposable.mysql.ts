/** Read-only integration checks against the explicitly approved disposable MySQL database. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import applicationDataSource from '../../data-source';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { UserSession } from '../user-sessions/user-sessions.entity';

test('approved MySQL 8 schema and sales reports reconcile across report views', { timeout: 60000 }, async () => {
  assert.equal(process.env.DB_DATABASE, 'dev_erp_product_import_test');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''));
  const db = await applicationDataSource.initialize();
  try {
    const [{ databaseName, version }] = await db.query('SELECT DATABASE() AS databaseName, VERSION() AS version');
    assert.equal(databaseName, 'dev_erp_product_import_test');
    assert.match(version, /^8\./);
    const migrations = await db.query('SELECT name FROM migrations WHERE timestamp IN (?, ?) ORDER BY timestamp',
      [1770000049000, 1770000050000]) as Array<{ name: string }>;
    assert.deepEqual(migrations.map((row) => row.name),
      ['AddPaymentCollectionReceipts1770000049000', 'AddInvoiceBillDiscount1770000050000']);
    assert.equal(await db.showMigrations(), false, 'No release migrations should be pending');
    assert.deepEqual(await db.runMigrations({ transaction: 'each' }), [], 'Migration rerun must be a no-op');
    const columns = await db.query(`SELECT table_name AS tableName, column_name AS columnName, column_type AS columnType
      FROM information_schema.columns WHERE table_schema = DATABASE() AND (
        (table_name = 'tbl_invoice' AND column_name IN ('item_discount_total', 'bill_discount_type',
          'bill_discount_value', 'bill_discount_total', 'bill_discount_applied_by_user_id', 'bill_discount_applied_at'))
        OR (table_name = 'tbl_invoice_detail' AND column_name IN ('net_before_bill_discount', 'bill_discount_allocated'))
        OR (table_name = 'tbl_invoice_refund_detail' AND column_name = 'bill_discount_allocated')
        OR (table_name = 'tbl_invoice_payment' AND column_name = 'receipt_snapshot'))`) as Array<{ tableName: string; columnName: string; columnType: string }>;
    assert.equal(columns.length, 10);
    assert.equal(columns.find((row) => row.tableName === 'tbl_invoice' && row.columnName === 'bill_discount_total')?.columnType, 'decimal(18,2)');
    const printTypes = await db.query(`SELECT table_name AS tableName, column_type AS columnType
      FROM information_schema.columns WHERE table_schema = DATABASE()
        AND table_name IN ('tbl_pos_print_job', 'tbl_pos_receipt_reprint') AND column_name = 'document_type'`);
    assert.equal(printTypes.length, 2);
    assert.ok(printTypes.every((row: { columnType: string }) => row.columnType === 'varchar(24)'));
    const fk = await db.query(`SELECT constraint_name FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND table_name = 'tbl_invoice'
        AND column_name = 'bill_discount_applied_by_user_id' AND referenced_table_name = 'tbl_user'`);
    assert.equal(fk.length, 1);
    const uniqueIndexes = await db.query(`SELECT table_name AS tableName, index_name AS indexName
      FROM information_schema.statistics WHERE table_schema = DATABASE() AND non_unique = 0
        AND index_name IN ('uq_invoice_tenant_checkout', 'uq_invoice_payment_tenant_collection',
          'uq_invoice_refund_tenant_key', 'uq_pos_print_job_document') GROUP BY table_name, index_name`);
    assert.equal(uniqueIndexes.length, 4);
    const [{ invalid }] = await db.query(`SELECT COUNT(*) AS invalid FROM tbl_invoice i JOIN (
      SELECT invoice_id, SUM(gross_total) AS gross, SUM(discount_amount) AS item,
        SUM(bill_discount_allocated) AS bill, SUM(net_total) AS net
      FROM tbl_invoice_detail GROUP BY invoice_id) d ON d.invoice_id = i.invoice_id
      WHERE ABS(d.gross - i.subtotal) > 0.001 OR ABS(d.item - i.item_discount_total) > 0.001
        OR ABS(d.bill - i.bill_discount_total) > 0.001
        OR ABS(d.net - (i.grand_total - i.tax_total)) > 0.001
        OR ABS(i.discount_total - i.item_discount_total - i.bill_discount_total) > 0.001`);
    assert.equal(Number(invalid), 0);
    const [fixture] = await db.query(`SELECT tenant_id AS tenantId FROM tbl_invoice
      WHERE bill_discount_total > 0 ORDER BY invoice_id LIMIT 1`);
    assert.ok(fixture, 'A persisted discounted sale is required for this integration check');
    const tenantId = Number(fixture.tenantId);
    const user = { tenantId, roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] } as unknown as TenantPrincipal;
    const service = new ReportsService(db, {} as never);
    const filters = { from: '2020-01-01', to: '2030-12-31', view: 'SUMMARY', granularity: 'AGGREGATED' };
    const summary = (await service.run('sales-analysis', filters, user)).rows[0];
    assert.ok(summary);
    const amount = (row: Record<string, unknown>, field: string) => Number(row[field] ?? 0);
    const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);
    close(amount(summary, 'grossSales') - amount(summary, 'itemDiscount') - amount(summary, 'billDiscount'), amount(summary, 'netSalesBeforeRefund'));
    close(amount(summary, 'netSalesBeforeRefund') - amount(summary, 'refundValue'), amount(summary, 'netSales'));
    if (summary.cogs !== null) close(amount(summary, 'netSales') - amount(summary, 'cogs'), amount(summary, 'gp'));
    const [salesSource] = await db.query(`SELECT COUNT(*) AS lineCount, SUM(d.gross_total) AS gross,
      SUM(d.discount_amount) AS item, SUM(d.bill_discount_allocated) AS bill, SUM(d.net_total) AS net
      FROM tbl_invoice_detail d JOIN tbl_invoice i ON i.invoice_id = d.invoice_id
      WHERE i.tenant_id = ? AND i.invoice_status IN ('COMPLETED','PARTIALLY_REFUNDED','FULLY_REFUNDED')
        AND COALESCE(i.business_date, DATE(i.invoice_date)) BETWEEN ? AND ?`,
      [tenantId, filters.from, filters.to]);
    const [refundSource] = await db.query(`SELECT COUNT(*) AS lineCount, SUM(rd.refund_amount) AS refunded
      FROM tbl_invoice_refund_detail rd JOIN tbl_invoice_refund r ON r.invoice_refund_id = rd.invoice_refund_id
      JOIN tbl_invoice i ON i.invoice_id = r.invoice_id
      WHERE r.tenant_id = ? AND r.status = 'COMPLETED'
        AND i.invoice_status IN ('COMPLETED','PARTIALLY_REFUNDED','FULLY_REFUNDED')
        AND COALESCE(r.business_date, DATE(r.refund_date)) BETWEEN ? AND ?`,
      [tenantId, filters.from, filters.to]);
    for (const [field, source] of [['grossSales', salesSource.gross], ['itemDiscount', salesSource.item],
      ['billDiscount', salesSource.bill], ['netSalesBeforeRefund', salesSource.net],
      ['refundValue', refundSource.refunded]] as const) close(amount(summary, field), Number(source ?? 0));
    for (const groupBy of ['product', 'categoryLevel1', 'brand']) {
      const rows = (await service.run('sales-analysis', { ...filters, groupBy, all: '1' }, user)).rows;
      for (const field of ['grossSales', 'itemDiscount', 'billDiscount', 'refundValue', 'netSales'])
        close(rows.reduce((sum, row) => sum + amount(row, field), 0), amount(summary, field));
    }
    for (const granularity of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) {
      const rows = (await service.run('sales-analysis', { ...filters, granularity, all: '1' }, user)).rows;
      close(rows.reduce((sum, row) => sum + amount(row, 'netSales'), 0), amount(summary, 'netSales'));
    }
    for (const reportId of ['gross-sales', 'daily-sales', 'product-sales', 'category-sales', 'credit-sales',
      'payment-analysis', 'payment-methods', 'refunds']) {
      await service.run(reportId, filters, user);
    }
    for (const [reportId, groupBy] of [['sales-analysis', 'product'], ['payment-analysis', 'paymentMethod'],
      ['refunds', 'product']] as const) {
      const chart = await service.run(reportId, { ...filters, groupBy, chart: '1' }, user);
      assert.ok(Array.isArray(chart.rows));
    }
    const documents = (await service.run('sales-analysis', { ...filters, view: 'DOCUMENT_DETAIL', all: '1' }, user)).rows;
    assert.equal(documents.length, Number(salesSource.lineCount) + Number(refundSource.lineCount),
      'Report joins must not multiply or omit invoice and refund lines');
    assert.ok(documents.some((row) => row.eventType === 'REFUND' && Number(row.refundValue) > 0 && Number(row.discount) === 0));
    assert.equal((await service.run('sales-analysis', { ...filters, from: '2029-01-01', to: '2029-01-31' }, user)).rows.length, 0);
    const [location] = await db.query('SELECT location_id AS locationId FROM tbl_invoice WHERE tenant_id = ? LIMIT 1', [tenantId]);
    assert.ok(location);
    await service.run('sales-analysis', { ...filters, locationId: String(location.locationId) }, user);
    await assert.rejects(service.run('sales-analysis', { ...filters, locationId: String(location.locationId) },
      { ...user, accessScope: 'LOCATION', assignedLocationIds: [] }), /access to this location/i);

    // Exercise the same controller endpoint over HTTP with the real guards. Only the
    // session repository is a test double; report SQL and response serialization are real.
    const token = 'disposable-report-http-token';
    const session = { userSessionId: 1, sessionTokenHash: createHash('sha256').update(token).digest('hex'),
      revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: {
        userId: user.userId ?? 1, tenantId, username: 'report-fixture', isActive: true, tenant: { isActive: true },
        userRoles: [{ role: { roleId: 1, code: 'TENANT_ADMIN', isActive: true, accessScope: 'TENANT' } }], userLocations: [],
      } };
    @Module({ controllers: [ReportsController], providers: [
      { provide: ReportsService, useValue: service },
      { provide: DataSource, useValue: db },
      { provide: getRepositoryToken(UserSession), useValue: {
        findOne: async ({ where }: any) => where.sessionTokenHash === session.sessionTokenHash ? session : null,
        update: async () => ({ affected: 1 }),
      } },
      TenantAuthGuard, PermissionGuard,
    ] })
    class ReportHttpTestModule {}
    const app = await NestFactory.create(ReportHttpTestModule, { logger: ['error'], abortOnError: false });
    try {
      app.setGlobalPrefix('api');
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/reports/sales-analysis?from=2020-01-01&to=2030-12-31&view=SUMMARY&granularity=AGGREGATED`,
        { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      const body = await response.json() as { rows: Array<{ netSales: string }> };
      close(Number(body.rows[0].netSales), amount(summary, 'netSales'));
      const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/reports/sales-analysis?from=2020-01-01&to=2030-12-31`);
      assert.equal(unauthorized.status, 401);
      const locations = await db.query('SELECT location_id AS locationId FROM tbl_location WHERE tenant_id = ? ORDER BY location_id LIMIT 2', [tenantId]);
      if (locations.length === 2) {
        session.user.userRoles[0].role.accessScope = 'LOCATION';
        session.user.userLocations = [{ isActive: true, location: { isActive: true }, locationId: Number(locations[0].locationId) }] as any;
        const forbidden = await fetch(`http://127.0.0.1:${address.port}/api/reports/sales-analysis?from=2020-01-01&to=2030-12-31&locationId=${locations[1].locationId}`,
          { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(forbidden.status, 403);
      }
    } finally {
      await app.close();
    }
  } finally {
    await db.destroy();
  }
});
