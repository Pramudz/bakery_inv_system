/** Explicit disposable-local-MySQL migration suite. Never selects the configured application database. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { AddMasterCashierBatches1770000033000 } from '../../migrations/1770000033000-AddMasterCashierBatches';
import { AddMasterRegisterClosing1770000034000 } from '../../migrations/1770000034000-AddMasterRegisterClosing';
import { ScopePosTerminalCodesToLocation1770000035000 } from '../../migrations/1770000035000-ScopePosTerminalCodesToLocation';
import { PosRegistersController } from './pos-registers.controller';
import { PosRegistersService } from './pos-registers.service';
import { PosCashReconciliationService } from './pos-cash-reconciliation.service';
import { PosMasterClosingService } from './pos-master-closing.service';
import { PosRegisterManagementService } from './pos-register-management.service';
import { PosSessionsService } from './pos-sessions.service';
import { PosRegisterManagementController } from './pos-register-management.controller';
import { PosSessionsController } from './pos-sessions.controller';

const testPrincipal = { tenantId: 901, userId: 1, scope: 'TENANT', accessScope: 'TENANT', assignedLocationIds: [] } as any;

test('disposable MySQL: fresh and Step 3B upgrade-clone master closing migrations', { timeout: 120000 }, async () => {
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? '')) throw new Error('This suite only permits a local MySQL host.');
  const database = `pos_master_batch_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
  assert.match(database, /^pos_master_batch_test_\d+_[a-f0-9]{8}$/);
  assert.notEqual(database, process.env.DB_DATABASE);
  const options = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD };
  const server = await createConnection(options);
  let created = false;
  const dataSource = new DataSource({
    type: 'mysql', host: options.host, port: options.port, username: options.user, password: options.password, database,
    entities: [__dirname + '/../../**/*.entity.js'], migrations: [__dirname + '/../../migrations/*.js'], synchronize: false,
  });
  try {
    await server.query(`CREATE DATABASE \`${database}\``);
    created = true;
    const baselineConnection = await createConnection({ ...options, database, multipleStatements: true });
    try {
      const baseline = await readFile(join(__dirname, '../../../schema/baseline-1770000023000.sql'), 'utf8');
      await baselineConnection.query(baseline);
    } finally {
      await baselineConnection.end();
    }
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'each' });
    const runner = dataSource.createQueryRunner();
    assert.ok(await runner.hasTable('tbl_pos_cash_reconciliation_payment'), 'fresh path creates payment coverage');
    assert.ok(await runner.hasColumn('tbl_pos_cash_reconciliation', 'confirmed_net_cash'), 'fresh path creates confirmation fields');
    assert.ok(await runner.hasTable('tbl_pos_master_reconciliation'), 'fresh path creates master closing snapshots');
    assert.ok(await runner.hasColumn('tbl_pos_cash_movement', 'funding_source'), 'fresh path creates funding source attribution');
    assert.ok(await runner.hasColumn('tbl_pos_cash_movement', 'payout_key'), 'fresh path creates payout idempotency keys');
    const freshTerminalIndexes: any[] = await runner.query("SELECT column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_terminal' AND index_name = 'uq_pos_terminal_location_code' ORDER BY seq_in_index");
    assert.deepEqual(freshTerminalIndexes.map((row) => row.columnName), ['tenant_id', 'location_id', 'terminal_code'], 'fresh path scopes terminal codes to a location');

    const batchMigration = new AddMasterCashierBatches1770000033000();
    const closingMigration = new AddMasterRegisterClosing1770000034000();
    const terminalCodeMigration = new ScopePosTerminalCodesToLocation1770000035000();
    await terminalCodeMigration.down(runner);
    await closingMigration.down(runner);
    await batchMigration.down(runner);
    assert.equal(await runner.hasTable('tbl_pos_cash_reconciliation_payment'), false, 'down reconstructs the Step 3A shape');
    assert.equal(await runner.hasTable('tbl_pos_master_reconciliation'), false, 'down removes master closing snapshots');
    const tenantTerminalIndexes: any[] = await runner.query("SELECT column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_terminal' AND index_name = 'uq_pos_terminal_tenant_code' ORDER BY seq_in_index");
    assert.deepEqual(tenantTerminalIndexes.map((row) => row.columnName), ['tenant_id', 'terminal_code'], 'upgrade clone begins with tenant-scoped terminal codes');
    await batchMigration.up(runner);
    await closingMigration.up(runner);
    await terminalCodeMigration.up(runner);
    assert.ok(await runner.hasTable('tbl_pos_cash_reconciliation_payment'), 'upgrade clone creates payment coverage');
    assert.ok(await runner.hasColumn('tbl_pos_cash_reconciliation', 'reconciliation_type'), 'upgrade clone gains reconciliation type');
    assert.ok(await runner.hasTable('tbl_pos_master_reconciliation'), 'upgrade clone creates master closing snapshots');
    assert.ok(await runner.hasColumn('tbl_pos_cash_movement', 'physical_payer_identity'), 'upgrade clone gains payout audit fields');
    const upgradedTerminalIndexes: any[] = await runner.query("SELECT column_name AS columnName FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_terminal' AND index_name = 'uq_pos_terminal_location_code' ORDER BY seq_in_index");
    assert.deepEqual(upgradedTerminalIndexes.map((row) => row.columnName), ['tenant_id', 'location_id', 'terminal_code'], 'upgrade clone gains location-scoped terminal codes');
    await batchMigration.up(runner);
    await closingMigration.up(runner);
    await terminalCodeMigration.up(runner);
    const indexRows: any[] = await runner.query("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_cash_reconciliation_payment' AND index_name = 'uq_pos_reconciliation_payment_active'");
    assert.equal(indexRows.length, 2, 'active payment coverage has the tenant and generated payment guard columns');
    const payoutIndexRows: any[] = await runner.query("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_cash_movement' AND index_name = 'uq_pos_cash_movement_payout_key'");
    assert.equal(payoutIndexRows.length, 2, 'payout idempotency is tenant scoped');

    await runner.query("INSERT INTO tbl_tenant (tenant_id, code, name) VALUES (901, 'POS_PAGE_A', 'POS paging tenant'), (902, 'POS_PAGE_B', 'Other tenant')");
    await runner.query("INSERT INTO tbl_module (module_id, code, name) VALUES (901, 'SALES_TEST', 'Sales test')");
    await runner.query("INSERT INTO tbl_permission (permission_id, module_id, code, name) VALUES (901, 901, 'SALES_POS_REGISTER_ADMIN', 'Register administration'), (902, 901, 'SALES_REGISTER_VERIFY', 'Register verification'), (903, 901, 'SALES_BILLING', 'Billing')");
    await runner.query('INSERT INTO tbl_tenant_module (tenant_id, module_id, is_enabled) VALUES (901, 901, 1)');
    await runner.query("INSERT INTO tbl_location (location_id, tenant_id, code, name, location_type) VALUES (911, 901, 'ANU', 'Anuradhapura', 'STORE'), (912, 901, 'BND', 'Bandaragama', 'STORE'), (921, 902, 'OTHER', 'Other tenant location', 'STORE')");
    const terminalValues = [
      ...Array.from({ length: 11 }, (_, index) => [901, 911, index === 0 ? 'POS1' : `T${String(index).padStart(2, '0')}`, `Anuradhapura ${index}`]),
      ...Array.from({ length: 11 }, (_, index) => [901, 912, index === 0 ? 'POS1' : `T${String(index).padStart(2, '0')}`, `Bandaragama ${index}`]),
      [902, 921, 'POS1', 'Other tenant terminal'],
    ];
    for (const [terminalTenant, terminalLocation, code, name] of terminalValues) {
      await runner.query('INSERT INTO tbl_pos_terminal (tenant_id, location_id, terminal_code, display_name, is_active) VALUES (?, ?, ?, ?, 1)', [terminalTenant, terminalLocation, code, name]);
    }

    const registers = new PosRegistersService(dataSource);
    const pageOne = await registers.terminals({ page: 1, pageSize: 20 }, testPrincipal);
    const pageTwo = await registers.terminals({ page: 2, pageSize: 20 }, testPrincipal);
    assert.equal(pageOne.total, 22);
    assert.equal(pageOne.limit, 20);
    assert.equal(pageOne.items.length, 20);
    assert.equal(pageTwo.items.length, 2);
    assert.equal(pageOne.items[0].location?.name, 'Anuradhapura');
    assert.equal(pageOne.items[0].terminalCode, 'POS1');
    assert.equal(pageOne.items[11].location?.name, 'Bandaragama');
    assert.equal(pageOne.items[11].terminalCode, 'POS1');
    assert.equal((await registers.terminals({ page: 1, pageSize: 20, search: 'POS1' }, testPrincipal)).total, 2);
    assert.equal((await registers.terminals({ page: 1, pageSize: 20, locationId: 912 }, testPrincipal)).total, 11);
    assert.equal((await registers.terminals({ page: 1, pageSize: 20 }, { ...testPrincipal, accessScope: 'LOCATION', assignedLocationIds: [911] })).total, 11);

    @Module({
      controllers: [PosRegistersController],
      providers: [
        PosRegistersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(UserSession), useValue: {
          findOne: async () => ({
            revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
            user: { userId: 1, tenantId: 901, username: 'paging-test', isActive: true, tenant: { isActive: true }, userRoles: [{ role: { roleId: 1, code: 'TENANT_ADMIN', accessScope: 'TENANT', isActive: true } }], userLocations: [] },
          }),
          save: async () => undefined,
        } },
      ],
    })
    class TerminalListHttpTestModule {}
    const app = await NestFactory.create(TerminalListHttpTestModule, { logger: ['error'], abortOnError: false });
    try {
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
      await app.listen(0, '127.0.0.1');
      const response = await fetch(`${await app.getUrl()}/pos-registers/terminals?page=1&pageSize=20`, { headers: { authorization: 'Bearer disposable-test-token' } });
      if (response.status !== 200) assert.fail(`GET terminals returned ${response.status}: ${await response.text()}`);
      const body: any = await response.json();
      assert.equal(body.total, 22);
      assert.equal(body.items.length, 20);
    } finally {
      await app.close();
    }

    const locations = await registers.locationConfigs({ page: 1, pageSize: 20 }, testPrincipal);
    assert.equal(locations.total, 2);
    const cashierQueue = await new PosCashReconciliationService(dataSource, null as any).queue({ page: 1, pageSize: 20 }, testPrincipal);
    assert.equal(cashierQueue.total, 0);
    const masterClosing = new PosMasterClosingService(dataSource);
    assert.equal((await masterClosing.queue({ page: 1, pageSize: 20 }, testPrincipal)).total, 0);
    assert.equal((await masterClosing.history(911, { page: 1, pageSize: 20 }, testPrincipal)).total, 0);
    const management = new PosRegisterManagementService(dataSource, null as any, masterClosing);
    for (const kind of ['REGISTERS', 'CASHIERS', 'CASHIER_RECONCILIATIONS', 'MASTER_RECONCILIATIONS', 'PAYOUTS']) {
      assert.equal((await management.history(911, { page: 1, pageSize: 20 }, kind, testPrincipal)).total, 0, `${kind} history paginates without an order metadata error`);
    }

    // Exercise the real mode-specific resolver against historical rows, not a mocked repository.
    await runner.query("INSERT INTO tbl_user (user_id, tenant_id, username, password_hash, first_name) VALUES (1, 901, 'cashier', 'unused', 'Nimal'), (2, 902, 'other', 'unused', 'Other'), (3, 901, 'second', 'unused', 'Second')");
    await runner.query("INSERT INTO tbl_pos_location_config (tenant_id, location_id, register_mode) VALUES (901, 912, 'MASTER_REGISTER')");
    const terminalAtBandaragama: any[] = await runner.query("SELECT pos_terminal_id AS id FROM tbl_pos_terminal WHERE tenant_id = 901 AND location_id = 912 AND terminal_code = 'POS1'");
    const terminalId = Number(terminalAtBandaragama[0].id);
    const pairingCredential = 'disposable-bandaragama-pairing';
    await runner.query('INSERT INTO tbl_pos_terminal_pairing (tenant_id, pos_terminal_id, pairing_secret_hash, paired_at, paired_by_user_id) VALUES (901, ?, ?, NOW(), 1)', [terminalId, createHash('sha256').update(pairingCredential).digest('hex')]);
    await runner.query("INSERT INTO tbl_pos_cash_register (tenant_id, location_id, pos_terminal_id, register_mode, register_key, display_name) VALUES (901, 912, NULL, 'MASTER_REGISTER', 'MASTER:912', 'Historic master')");
    const historicalMaster: any[] = await runner.query("SELECT pos_cash_register_id AS id, register_key AS registerKey, register_mode AS registerMode, pos_terminal_id AS terminalId FROM tbl_pos_cash_register WHERE tenant_id = 901 AND location_id = 912");
    const masterId = Number(historicalMaster[0].id);
    await runner.query("INSERT INTO tbl_pos_register_session (pos_cash_register_id, tenant_id, location_id, business_date, opening_balance, opened_by_user_id, opened_at, status, closed_at) VALUES (?, 901, 912, '2026-10-01', 50, 1, NOW(), 'CLOSED', NOW())", [masterId]);
    const masterSession: any[] = await runner.query('SELECT pos_register_session_id AS id FROM tbl_pos_register_session WHERE pos_cash_register_id = ?', [masterId]);
    const sessions = new PosSessionsService(dataSource);
    await registers.configureLocation(912, { registerMode: 'TERMINAL_REGISTER' as any }, testPrincipal);
    const [firstOpen, repeatedOpen] = await Promise.all([
      sessions.openTerminal({ openingBalance: 125 }, pairingCredential, testPrincipal),
      sessions.openTerminal({ openingBalance: 999 }, pairingCredential, testPrincipal),
    ]);
    assert.deepEqual([firstOpen.resumed, repeatedOpen.resumed].sort(), [false, true]);
    assert.notEqual(firstOpen.register.posCashRegisterId, masterId);
    const actualRegisters: any[] = await runner.query('SELECT pos_cash_register_id AS id, register_key AS registerKey, register_mode AS registerMode, pos_terminal_id AS terminalId FROM tbl_pos_cash_register WHERE tenant_id = 901 AND location_id = 912 ORDER BY pos_cash_register_id');
    assert.equal(actualRegisters.length, 2);
    assert.deepEqual(actualRegisters[0], historicalMaster[0]);
    assert.equal(actualRegisters[1].registerKey, `TERMINAL:${terminalId}`);
    assert.equal(Number(actualRegisters[1].terminalId), terminalId);
    assert.equal(firstOpen.cashierSession?.posRegisterSessionId, firstOpen.registerSession.posRegisterSessionId);

    await runner.query("INSERT INTO tbl_payment_method (tenant_id, payment_method_name) VALUES (901, 'CASH')");
    const paymentMethod: any[] = await runner.query("SELECT payment_method_id AS id FROM tbl_payment_method WHERE tenant_id = 901 AND payment_method_name = 'CASH'");
    await runner.query("INSERT INTO tbl_invoice (tenant_id, location_id, invoice_number, invoice_date, sale_type, subtotal, grand_total, paid_amount, balance_amount, payment_status, created_by_user_id, checkout_key, checkout_fingerprint, pos_terminal_id, pos_register_session_id, pos_cashier_session_id) VALUES (901, 912, 'POS-HISTORY-TEST', NOW(), 'SALE', 100, 100, 100, 0, 'PAID', 1, 'pos-history-test', ?, ?, ?, ?)", ['a'.repeat(64), terminalId, firstOpen.registerSession.posRegisterSessionId, firstOpen.cashierSession?.posCashierSessionId]);
    const invoice: any[] = await runner.query("SELECT invoice_id AS id, pos_terminal_id AS terminalId, pos_register_session_id AS registerSessionId, pos_cashier_session_id AS cashierSessionId FROM tbl_invoice WHERE invoice_number = 'POS-HISTORY-TEST'");
    await runner.query('INSERT INTO tbl_invoice_payment (invoice_id, payment_method_id, amount, paid_at, created_by_user_id, tendered_amount, pos_terminal_id, pos_register_session_id, pos_cashier_session_id) VALUES (?, ?, 100, NOW(), 1, 100, ?, ?, ?)', [invoice[0].id, paymentMethod[0].id, terminalId, firstOpen.registerSession.posRegisterSessionId, firstOpen.cashierSession?.posCashierSessionId]);
    const attributedPayment: any[] = await runner.query('SELECT pos_register_session_id AS registerSessionId, pos_cashier_session_id AS cashierSessionId FROM tbl_invoice_payment WHERE invoice_id = ?', [invoice[0].id]);
    assert.equal(Number(invoice[0].registerSessionId), Number(firstOpen.registerSession.posRegisterSessionId));
    assert.equal(Number(attributedPayment[0].cashierSessionId), Number(firstOpen.cashierSession?.posCashierSessionId));

    // Three verification sources share one authorized, stable server-side page.
    await runner.query("INSERT INTO tbl_pos_cashier_session (pos_register_session_id, tenant_id, location_id, cashier_user_id, pos_terminal_id, started_at, ended_at, status) VALUES (?, 901, 912, 1, ?, NOW(), NOW(), 'ENDED')", [masterSession[0].id, terminalId]);
    const masterCashier: any[] = await runner.query('SELECT pos_cashier_session_id AS id FROM tbl_pos_cashier_session WHERE pos_register_session_id = ?', [masterSession[0].id]);
    await runner.query('UPDATE tbl_pos_cashier_session SET status = ?, ended_at = NOW() WHERE pos_cashier_session_id = ?', ['ENDED', firstOpen.cashierSession?.posCashierSessionId]);
    const insertCashCount = 'INSERT INTO tbl_pos_cash_reconciliation (tenant_id, location_id, pos_register_session_id, pos_cashier_session_id, attempt_number, reconciliation_type, submission_key, opening_balance, cash_received, cash_paid_out, expected_cash, counted_cash, cashier_variance, summary_snapshot, submitted_by_user_id, submitted_at, status) VALUES (?, ?, ?, ?, 1, ?, ?, 0, 100, 0, 100, ?, 0, ?, ?, ?, ?)';
    await runner.query(insertCashCount, [901, 912, firstOpen.registerSession.posRegisterSessionId, firstOpen.cashierSession?.posCashierSessionId, 'TERMINAL_CASH_COUNT', 'terminal-count-test', 100, '{}', 1, '2026-10-01 10:00:00', 'PENDING_VERIFICATION']);
    await runner.query(insertCashCount, [901, 912, masterSession[0].id, masterCashier[0].id, 'MASTER_CASH_BATCH', 'master-batch-test', null, '{}', 1, '2026-10-01 11:00:00', 'PENDING_VERIFICATION']);
    await runner.query("INSERT INTO tbl_pos_master_reconciliation (tenant_id, location_id, pos_register_session_id, attempt_number, submission_key, submission_fingerprint, opening_balance, system_expected_cash, confirmed_batch_cash_basis, batch_confirmation_difference, counted_cash, count_vs_confirmed_basis, count_vs_system_expected, summary_snapshot, master_cashier_identity, submitted_by_user_id, submitted_at, status) VALUES (901, 912, ?, 1, 'master-count-test', ?, 50, 150, 150, 0, 150, 0, 0, '{}', 'Master cashier', 1, '2026-10-01 12:00:00', 'PENDING_VERIFICATION')", [masterSession[0].id, 'a'.repeat(64)]);
    await runner.query("INSERT INTO tbl_pos_cash_register (tenant_id, location_id, pos_terminal_id, register_mode, register_key, display_name) VALUES (901, 911, NULL, 'MASTER_REGISTER', 'MASTER:911', 'Anuradhapura master'), (902, 921, NULL, 'MASTER_REGISTER', 'MASTER:921', 'Other tenant master')");
    const isolatedRegisters: any[] = await runner.query("SELECT tenant_id AS tenantId, location_id AS locationId, pos_cash_register_id AS id FROM tbl_pos_cash_register WHERE register_key IN ('MASTER:911', 'MASTER:921') ORDER BY tenant_id");
    for (const register of isolatedRegisters) {
      const actor = Number(register.tenantId) === 901 ? 1 : 2;
      await runner.query("INSERT INTO tbl_pos_register_session (pos_cash_register_id, tenant_id, location_id, business_date, opening_balance, opened_by_user_id, opened_at, status, closed_at) VALUES (?, ?, ?, '2026-10-01', 0, ?, NOW(), 'CLOSED', NOW())", [register.id, register.tenantId, register.locationId, actor]);
      const isolationSession: any[] = await runner.query('SELECT pos_register_session_id AS id FROM tbl_pos_register_session WHERE pos_cash_register_id = ?', [register.id]);
      await runner.query("INSERT INTO tbl_pos_master_reconciliation (tenant_id, location_id, pos_register_session_id, attempt_number, submission_key, submission_fingerprint, opening_balance, system_expected_cash, confirmed_batch_cash_basis, batch_confirmation_difference, counted_cash, count_vs_confirmed_basis, count_vs_system_expected, summary_snapshot, master_cashier_identity, submitted_by_user_id, submitted_at, status) VALUES (?, ?, ?, 1, ?, ?, 0, 0, 0, 0, 0, 0, 0, '{}', 'Isolated master', ?, '2026-10-01 08:00:00', ?)", [register.tenantId, register.locationId, isolationSession[0].id, `isolation-${register.tenantId}`, 'b'.repeat(64), actor, Number(register.tenantId) === 901 ? 'APPROVED' : 'PENDING_VERIFICATION']);
    }
    const all = await management.verificationQueue({ page: 1, pageSize: 20, type: 'ALL' }, testPrincipal);
    assert.equal(all.total, 3);
    assert.deepEqual(all.items.map((item) => item.verificationType), ['MASTER_REGISTER_COUNT', 'MASTER_CASH_BATCH', 'TERMINAL_CASH_COUNT']);
    for (const type of ['TERMINAL_CASH_COUNT', 'MASTER_CASH_BATCH', 'MASTER_REGISTER_COUNT'] as const) {
      const filtered = await management.verificationQueue({ type }, testPrincipal);
      assert.equal(filtered.total, 1);
      assert.equal(filtered.items[0].verificationType, type);
    }
    assert.equal((await management.verificationQueue({ search: 'Bandaragama' }, testPrincipal)).total, 3);
    assert.equal((await management.verificationQueue({ search: 'Nimal' }, testPrincipal)).total, 2);
    assert.equal((await management.verificationQueue({ locationId: 911 }, testPrincipal)).total, 0);
    assert.equal((await management.verificationQueue({ locationId: 911, status: 'ALL' }, testPrincipal)).total, 1);
    assert.equal((await management.verificationQueue({ status: 'ALL' }, { ...testPrincipal, accessScope: 'LOCATION', assignedLocationIds: [911] })).total, 1);
    await assert.rejects(management.verificationQueue({ locationId: 912 }, { ...testPrincipal, accessScope: 'LOCATION', assignedLocationIds: [911] }), /access/i);
    assert.equal((await management.verificationQueue({}, { ...testPrincipal, tenantId: 902 })).total, 1);
    for (let attempt = 2; attempt <= 22; attempt++) {
      await runner.query("INSERT INTO tbl_pos_cash_reconciliation (tenant_id, location_id, pos_register_session_id, pos_cashier_session_id, attempt_number, reconciliation_type, submission_key, opening_balance, cash_received, cash_paid_out, expected_cash, counted_cash, cashier_variance, summary_snapshot, submitted_by_user_id, submitted_at, status) VALUES (901, 912, ?, ?, ?, 'TERMINAL_CASH_COUNT', ?, 0, 100, 0, 100, 100, 0, '{}', 1, '2026-10-01 09:00:00', 'APPROVED')", [firstOpen.registerSession.posRegisterSessionId, firstOpen.cashierSession?.posCashierSessionId, attempt, `historic-count-${attempt}`]);
    }
    const firstPage = await management.verificationQueue({ page: 1, pageSize: 20, status: 'ALL' }, testPrincipal);
    const secondPage = await management.verificationQueue({ page: 2, pageSize: 20, status: 'ALL' }, testPrincipal);
    assert.equal(firstPage.page, 1);
    assert.equal(firstPage.limit, 20);
    assert.equal(firstPage.total, 25);
    assert.equal(firstPage.items.length, 20);
    assert.equal(secondPage.total, 25);
    assert.equal(secondPage.items.length, 5);
    assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => `${item.verificationType}:${item.sourceId}`)).size, 25);
    assert.deepEqual(firstPage.items.slice(0, 3).map((item) => item.verificationType), ['MASTER_REGISTER_COUNT', 'MASTER_CASH_BATCH', 'TERMINAL_CASH_COUNT']);
    await runner.query("UPDATE tbl_pos_cash_reconciliation SET status = 'APPROVED' WHERE reconciliation_type = 'MASTER_CASH_BATCH' AND tenant_id = 901");
    assert.equal((await management.verificationQueue({}, testPrincipal)).total, 2, 'decision refresh changes pending All results');
    assert.equal((await management.verificationQueue({ status: 'ALL' }, testPrincipal)).total, 25);
    await runner.query("UPDATE tbl_pos_cash_reconciliation SET status = 'APPROVED' WHERE tenant_id = 901 AND status = 'PENDING_VERIFICATION'");
    await runner.query("UPDATE tbl_pos_master_reconciliation SET status = 'APPROVED' WHERE tenant_id = 901 AND status = 'PENDING_VERIFICATION'");
    await runner.query("UPDATE tbl_pos_register_session SET status = 'CLOSED', closed_at = NOW() WHERE pos_register_session_id = ?", [firstOpen.registerSession.posRegisterSessionId]);
    await registers.configureLocation(912, { registerMode: 'MASTER_REGISTER' as any }, testPrincipal);
    const reopenedMaster = await sessions.openMaster({ locationId: 912, openingBalance: 75 }, testPrincipal);
    assert.equal(Number(reopenedMaster.register.posCashRegisterId), masterId);
    assert.equal(reopenedMaster.resumed, false);
    await runner.query("UPDATE tbl_pos_register_session SET status = 'CLOSED', closed_at = NOW() WHERE pos_register_session_id = ?", [reopenedMaster.registerSession.posRegisterSessionId]);
    await registers.configureLocation(912, { registerMode: 'TERMINAL_REGISTER' as any }, testPrincipal);
    const reopenedTerminal = await sessions.openTerminal({ openingBalance: 80 }, pairingCredential, testPrincipal);
    assert.equal(Number(reopenedTerminal.register.posCashRegisterId), Number(firstOpen.register.posCashRegisterId));
    assert.equal((await runner.query('SELECT pos_cash_register_id FROM tbl_pos_cash_register WHERE tenant_id = 901 AND location_id = 912') as any[]).length, 2);
    const secondTerminal: any[] = await runner.query("SELECT pos_terminal_id AS id FROM tbl_pos_terminal WHERE tenant_id = 901 AND location_id = 912 AND terminal_code = 'T01'");
    const secondCredential = 'disposable-second-pairing';
    await runner.query('INSERT INTO tbl_pos_terminal_pairing (tenant_id, pos_terminal_id, pairing_secret_hash, paired_at, paired_by_user_id) VALUES (901, ?, ?, NOW(), 1)', [secondTerminal[0].id, createHash('sha256').update(secondCredential).digest('hex')]);

    @Module({
      controllers: [PosRegisterManagementController, PosSessionsController],
      providers: [
        { provide: PosRegisterManagementService, useValue: management },
        { provide: PosSessionsService, useValue: sessions },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(UserSession), useValue: {
          findOne: async () => ({ revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { userId: 3, tenantId: 901, username: 'second', isActive: true, tenant: { isActive: true }, userRoles: [{ role: { roleId: 1, code: 'TENANT_ADMIN', accessScope: 'TENANT', isActive: true } }], userLocations: [] } }),
          save: async () => undefined,
        } },
      ],
    })
    class VerificationHttpTestModule {}
    const verificationApp = await NestFactory.create(VerificationHttpTestModule, { logger: ['error'], abortOnError: false });
    try {
      verificationApp.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
      await verificationApp.listen(0, '127.0.0.1');
      const response = await fetch(`${await verificationApp.getUrl()}/pos-register-management/verification-queue?type=ALL&status=ALL&page=2&pageSize=20`, { headers: { authorization: 'Bearer disposable-test-token' } });
      if (response.status !== 200) assert.fail(`GET verification queue returned ${response.status}: ${await response.text()}`);
      const body: any = await response.json();
      assert.equal(body.total, 25);
      assert.equal(body.page, 2);
      assert.equal(body.items.length, 5);
      const openingResponse = await fetch(`${await verificationApp.getUrl()}/pos-register-sessions/terminal/open`, { method: 'POST', headers: { authorization: 'Bearer disposable-test-token', 'x-pos-terminal-credential': secondCredential, 'content-type': 'application/json' }, body: JSON.stringify({ openingBalance: 25 }) });
      if (openingResponse.status !== 201) assert.fail(`POST terminal open returned ${openingResponse.status}: ${await openingResponse.text()}`);
      const openedByHttp: any = await openingResponse.json();
      assert.equal(Number(openedByHttp.register.posTerminalId), Number(secondTerminal[0].id));
      assert.equal(openedByHttp.register.registerMode, 'TERMINAL_REGISTER');
      assert.equal(openedByHttp.resumed, false);
    } finally {
      await verificationApp.close();
    }
    await runner.release();
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
    if (created) {
      assert.match(database, /^pos_master_batch_test_/);
      await server.query(`DROP DATABASE \`${database}\``);
    }
    await server.end();
  }
});
