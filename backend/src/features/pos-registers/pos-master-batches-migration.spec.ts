import assert from 'node:assert/strict';
import test from 'node:test';
import { AddMasterCashierBatches1770000033000 } from '../../migrations/1770000033000-AddMasterCashierBatches';

test('master cash batch migration adds nullable confirmation fields and immutable payment coverage', async () => {
  const existing = new Set(['tbl_tenant', 'tbl_location', 'tbl_pos_cash_reconciliation', 'tbl_pos_register_session', 'tbl_pos_cashier_session', 'tbl_invoice_payment']);
  const created: any[] = [];
  const sql: string[] = [];
  const runner: any = {
    hasTable: async (name: string) => existing.has(name),
    hasColumn: async () => false,
    createTable: async (table: any) => { created.push(table); existing.add(table.name); },
    query: async (statement: string) => sql.push(statement),
  };
  await new AddMasterCashierBatches1770000033000().up(runner);
  for (const column of ['reconciliation_type', 'submission_fingerprint', 'verification_fingerprint', 'confirmed_net_cash', 'confirmation_variance', 'physical_recipient_identity', 'verification_reason']) {
    assert.ok(sql.some((statement) => statement.includes(`ADD COLUMN ${column}`)));
  }
  assert.deepEqual(created.map((table) => table.name), ['tbl_pos_cash_reconciliation_payment']);
  const coverage = created[0];
  assert.ok(coverage.indices.some((index: any) => index.name === 'uq_pos_reconciliation_payment_item'));
  assert.ok(sql.some((statement) => statement.includes('active_payment_guard') && statement.includes('invoice_payment_id')));
  assert.ok(sql.some((statement) => statement.includes('uq_pos_reconciliation_payment_active')));
  assert.ok(sql.every((statement) => !/\b(INSERT|UPDATE)\b/i.test(statement)), 'historical records must not receive invented batch confirmations');
});

test('master cash batch migration is safe on an upgrade clone that already has the complete shape', async () => {
  let mutations = 0;
  const runner: any = {
    hasTable: async () => true,
    hasColumn: async () => true,
    addColumn: async () => { mutations += 1; },
    createTable: async () => { mutations += 1; },
    query: async () => { mutations += 1; },
  };
  await new AddMasterCashierBatches1770000033000().up(runner);
  assert.equal(mutations, 0);
});
