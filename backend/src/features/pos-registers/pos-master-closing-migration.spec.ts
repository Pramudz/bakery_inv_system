import assert from 'node:assert/strict';
import test from 'node:test';
import { AddMasterRegisterClosing1770000034000 } from '../../migrations/1770000034000-AddMasterRegisterClosing';

test('master closing migration adds direct-payout metadata and a stable closing snapshot', async () => {
  const existing = new Set([
    'tbl_pos_cash_movement',
    'tbl_pos_register_session',
    'tbl_tenant',
    'tbl_location',
    'tbl_user',
  ]);
  const created: any[] = [];
  const sql: string[] = [];
  const runner: any = {
    hasTable: async (name: string) => existing.has(name),
    hasColumn: async () => false,
    createTable: async (table: any) => {
      created.push(table);
      existing.add(table.name);
    },
    query: async (statement: string) => {
      if (/^SELECT index_name/i.test(statement)) return [];
      sql.push(statement);
      return [];
    },
  };

  await new AddMasterRegisterClosing1770000034000().up(runner);

  assert.ok(sql.some((statement) => statement.includes('MODIFY pos_cashier_session_id bigint NULL')));
  for (const column of ['funding_source', 'physical_payer_identity', 'payout_key', 'payout_fingerprint']) {
    assert.ok(sql.some((statement) => statement.includes(`ADD COLUMN ${column}`)));
  }
  assert.deepEqual(created.map((table) => table.name), ['tbl_pos_master_reconciliation']);
  const reconciliation = created[0];
  assert.ok(reconciliation.columns.some((column: any) => column.name === 'system_expected_cash'));
  assert.ok(reconciliation.columns.some((column: any) => column.name === 'confirmed_batch_cash_basis'));
  assert.ok(reconciliation.columns.some((column: any) => column.name === 'summary_snapshot'));
  assert.ok(sql.some((statement) => statement.includes('pending_register_guard')));
  assert.ok(sql.every((statement) => !/\b(INSERT|UPDATE)\b/i.test(statement)));
});

test('master closing migration is safe on an upgrade clone that already has the complete shape', async () => {
  let mutations = 0;
  const runner: any = {
    hasTable: async () => true,
    hasColumn: async () => true,
    createTable: async () => {
      mutations += 1;
    },
    query: async (statement: string) => {
      if (/^SELECT index_name/i.test(statement)) return [{ index_name: 'uq_pos_cash_movement_payout_key' }];
      mutations += 1;
      return [];
    },
  };

  await new AddMasterRegisterClosing1770000034000().up(runner);
  assert.equal(mutations, 0);
});
