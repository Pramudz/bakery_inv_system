import assert from 'node:assert/strict';
import test from 'node:test';
import { AddPosRegisterAndCashierSessions1770000031000 } from '../../migrations/1770000031000-AddPosRegisterAndCashierSessions';

test('register-session migration creates guarded session tables and nullable historical attribution', async () => {
  const existing = new Set(['tbl_tenant', 'tbl_location', 'tbl_user', 'tbl_pos_location_config', 'tbl_pos_terminal', 'tbl_invoice', 'tbl_invoice_payment']);
  const created: any[] = [];
  const sql: string[] = [];
  const columns = new Map<string, any[]>();
  const foreignKeys = new Map<string, any[]>();
  const runner: any = {
    hasTable: async (name: string) => existing.has(name),
    createTable: async (table: any) => { created.push(table); existing.add(table.name); },
    query: async (statement: string) => sql.push(statement),
    hasColumn: async (table: string, column: string) => (columns.get(table) ?? []).some((candidate) => candidate.name === column),
    addColumn: async (table: string, column: any) => { const rows = columns.get(table) ?? []; rows.push(column); columns.set(table, rows); },
    getTable: async (table: string) => ({ foreignKeys: foreignKeys.get(table) ?? [] }),
    createForeignKey: async (table: string, key: any) => { const rows = foreignKeys.get(table) ?? []; rows.push(key); foreignKeys.set(table, rows); },
  };
  await new AddPosRegisterAndCashierSessions1770000031000().up(runner);
  assert.deepEqual(created.map((table) => table.name), ['tbl_pos_cash_register', 'tbl_pos_register_session', 'tbl_pos_cashier_session']);
  assert.ok(created[0].indices.some((index: any) => index.name === 'uq_pos_cash_register_tenant_key'));
  assert.ok(sql.some((statement) => statement.includes('open_register_guard') && statement.includes('GENERATED ALWAYS')));
  assert.ok(sql.some((statement) => statement.includes('active_cashier_guard') && statement.includes('GENERATED ALWAYS')));
  assert.ok(sql.some((statement) => statement.includes('active_terminal_guard') && statement.includes('GENERATED ALWAYS')));
  for (const table of ['tbl_invoice', 'tbl_invoice_payment']) {
    assert.deepEqual((columns.get(table) ?? []).map((column) => column.name), ['pos_terminal_id', 'pos_register_session_id', 'pos_cashier_session_id']);
    assert.ok((columns.get(table) ?? []).every((column) => column.isNullable), 'historical attribution must remain nullable');
    assert.equal((foreignKeys.get(table) ?? []).length, 3);
  }
  assert.ok(sql.every((statement) => !/\b(INSERT|UPDATE)\b/i.test(statement)), 'historical transactions must not be rewritten');
});

test('register-session migration is safe when an upgrade clone already has its schema', async () => {
  let mutations = 0;
  const runner: any = {
    hasTable: async () => true,
    hasColumn: async () => true,
    createTable: async () => { mutations += 1; },
    addColumn: async () => { mutations += 1; },
    query: async () => { mutations += 1; },
    getTable: async (table: string) => ({ foreignKeys: [
      { name: `fk_${table.slice(4)}_pos_terminal` },
      { name: `fk_${table.slice(4)}_pos_register_session` },
      { name: `fk_${table.slice(4)}_pos_cashier_session` },
    ] }),
    createForeignKey: async () => { mutations += 1; },
  };
  await new AddPosRegisterAndCashierSessions1770000031000().up(runner);
  assert.equal(mutations, 0);
});
