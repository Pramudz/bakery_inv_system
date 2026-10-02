import assert from 'node:assert/strict';
import test from 'node:test';
import { ScopePosTerminalCodesToLocation1770000035000 } from '../../migrations/1770000035000-ScopePosTerminalCodesToLocation';

test('terminal-code migration replaces tenant-wide uniqueness with location-scoped uniqueness', async () => {
  const dropped: string[] = [];
  const created: any[] = [];
  const sql: string[] = [];
  const runner: any = {
    hasTable: async () => true,
    getTable: async () => ({ indices: [{ name: 'uq_pos_terminal_tenant_code' }] }),
    dropIndex: async (_table: string, index: any) => dropped.push(index.name),
    createIndex: async (_table: string, index: any) => created.push(index),
    query: async (statement: string) => {
      if (/^\s*SELECT/i.test(statement)) return [];
      sql.push(statement);
      return [];
    },
  };
  await new ScopePosTerminalCodesToLocation1770000035000().up(runner);
  assert.deepEqual(dropped, ['uq_pos_terminal_tenant_code']);
  assert.deepEqual(created[0].columnNames, ['tenant_id', 'location_id', 'terminal_code']);
  assert.ok(sql.some((statement) => statement.includes('UPPER(TRIM(terminal_code))')));
});

test('terminal-code migration rejects normalized conflicts before changing the constraint', async () => {
  let mutations = 0;
  const runner: any = {
    hasTable: async () => true,
    getTable: async () => ({ indices: [{ name: 'uq_pos_terminal_tenant_code' }] }),
    dropIndex: async () => { mutations += 1; },
    createIndex: async () => { mutations += 1; },
    query: async (statement: string) => /^\s*SELECT/i.test(statement) ? [{ tenant_id: '1', location_id: '2', normalized_code: 'POS1', duplicate_count: '2' }] : [],
  };
  await assert.rejects(new ScopePosTerminalCodesToLocation1770000035000().up(runner), /duplicate POS1.*location 2/i);
  assert.equal(mutations, 0);
});

test('terminal-code migration is safe on an upgrade clone with the scoped index', async () => {
  let indexMutations = 0;
  const runner: any = {
    hasTable: async () => true,
    getTable: async () => ({ indices: [{ name: 'uq_pos_terminal_location_code' }] }),
    dropIndex: async () => { indexMutations += 1; },
    createIndex: async () => { indexMutations += 1; },
    query: async (statement: string) => /^\s*SELECT/i.test(statement) ? [] : [],
  };
  await new ScopePosTerminalCodesToLocation1770000035000().up(runner);
  assert.equal(indexMutations, 0);
});
