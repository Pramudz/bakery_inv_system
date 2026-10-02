import assert from 'node:assert/strict';
import test from 'node:test';
import { AddPaymentTypesAndCardChannels1770000028000 } from '../../migrations/1770000028000-AddPaymentTypesAndCardChannels';

test('payment type migration backfills only unambiguous names and leaves Credit unclassified', async () => {
  const sql: string[] = [];
  const addedColumns: string[] = [];
  const createdTables: any[] = [];
  const runner: any = {
    hasTable: async (name: string) => name !== 'tbl_payment_channel',
    hasColumn: async () => false,
    addColumn: async (_table: string, column: { name: string }) => addedColumns.push(column.name),
    query: async (statement: string) => sql.push(statement),
    createTable: async (table: any) => createdTables.push(table),
    getTable: async () => ({ foreignKeys: [] }),
    createForeignKey: async () => undefined,
  };
  await new AddPaymentTypesAndCardChannels1770000028000().up(runner);
  const backfill = sql.join('\n');
  assert.match(backfill, /payment_method_name\)\) = 'CASH'/);
  assert.match(backfill, /'CREDIT CARD'/);
  assert.match(backfill, /'CHEQUE', 'CHECK'/);
  assert.doesNotMatch(backfill, /payment_method_name\)\) = 'CREDIT'/);
  assert.ok(addedColumns.includes('payment_method_type'));
  assert.equal(createdTables[0].name, 'tbl_payment_channel');
  const channelColumns = createdTables[0].columns.map((column: any) => column.name);
  assert.deepEqual(channelColumns, ['payment_channel_id', 'tenant_id', 'code', 'name', 'is_active', 'created_at', 'updated_at']);
  assert.ok(!channelColumns.includes('location_id'));
  assert.ok(!channelColumns.includes('machine_identifier'));
  assert.deepEqual(createdTables[0].indices.find((index: any) => index.isUnique).columnNames, ['tenant_id', 'code']);
});

test('payment type migration refuses to invent a base sales schema', async () => {
  const runner: any = { hasTable: async (name: string) => name !== 'tbl_invoice_payment' };
  await assert.rejects(new AddPaymentTypesAndCardChannels1770000028000().up(runner), /tbl_invoice_payment must exist/);
});
