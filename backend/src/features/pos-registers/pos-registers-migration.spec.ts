import assert from 'node:assert/strict';
import test from 'node:test';
import { AddPosLocationModesAndTerminals1770000030000 } from '../../migrations/1770000030000-AddPosLocationModesAndTerminals';

test('POS register migration creates the minimal four-table schema without configuring existing locations', async () => {
  const existing = new Set(['tbl_tenant', 'tbl_location', 'tbl_user']);
  const created: any[] = [];
  const sql: string[] = [];
  const runner: any = {
    hasTable: async (name: string) => existing.has(name),
    createTable: async (table: any) => { created.push(table); existing.add(table.name); },
    query: async (statement: string) => sql.push(statement),
  };
  await new AddPosLocationModesAndTerminals1770000030000().up(runner);
  assert.deepEqual(created.map((table) => table.name), [
    'tbl_pos_location_config', 'tbl_pos_terminal', 'tbl_pos_terminal_activation', 'tbl_pos_terminal_pairing',
  ]);
  const config = created[0];
  assert.deepEqual(config.columns.find((column: any) => column.name === 'register_mode').enum, ['TERMINAL_REGISTER', 'MASTER_REGISTER']);
  assert.ok(config.indices.some((index: any) => index.isUnique && index.columnNames.join(',') === 'location_id'));
  const terminal = created[1];
  assert.ok(terminal.indices.some((index: any) => index.isUnique && index.columnNames.join(',') === 'tenant_id,terminal_code'));
  assert.equal(created[2].columns.find((column: any) => column.name === 'activation_secret_hash').length, '64');
  assert.equal(created[3].columns.find((column: any) => column.name === 'pairing_secret_hash').length, '64');
  assert.deepEqual(sql, [], 'existing locations must remain unconfigured and no data may be backfilled');
});

test('POS register migration is safe when an upgrade clone already has all four tables', async () => {
  let mutations = 0;
  const runner: any = {
    hasTable: async () => true,
    createTable: async () => { mutations += 1; },
  };
  await new AddPosLocationModesAndTerminals1770000030000().up(runner);
  assert.equal(mutations, 0);
});
