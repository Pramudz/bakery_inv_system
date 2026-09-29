/** Explicit disposable-local-MySQL migration suite. Never selects the configured application database. */
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { AddMasterCashierBatches1770000033000 } from '../../migrations/1770000033000-AddMasterCashierBatches';

test('disposable MySQL: fresh and Step 3A upgrade-clone master batch migrations', { timeout: 120000 }, async () => {
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

    const migration = new AddMasterCashierBatches1770000033000();
    await migration.down(runner);
    assert.equal(await runner.hasTable('tbl_pos_cash_reconciliation_payment'), false, 'down reconstructs the Step 3A shape');
    await migration.up(runner);
    assert.ok(await runner.hasTable('tbl_pos_cash_reconciliation_payment'), 'upgrade clone creates payment coverage');
    assert.ok(await runner.hasColumn('tbl_pos_cash_reconciliation', 'reconciliation_type'), 'upgrade clone gains reconciliation type');
    await migration.up(runner);
    const indexRows: any[] = await runner.query("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_cash_reconciliation_payment' AND index_name = 'uq_pos_reconciliation_payment_active'");
    assert.equal(indexRows.length, 2, 'active payment coverage has the tenant and generated payment guard columns');
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
