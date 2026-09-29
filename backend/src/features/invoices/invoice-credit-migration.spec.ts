import assert from 'node:assert/strict';
import test from 'node:test';
import { AddInvoiceCreditAuthorization1770000029000 } from '../../migrations/1770000029000-AddInvoiceCreditAuthorization';

test('credit authorization migration upgrades the baseline schema without reclassifying legacy invoices', async () => {
  const columns: any[] = [];
  const foreignKeys: any[] = [];
  const sql: string[] = [];
  const runner: any = {
    hasTable: async (name: string) => ['tbl_invoice', 'tbl_user'].includes(name),
    hasColumn: async (_table: string, name: string) => columns.some((column) => column.name === name),
    addColumn: async (_table: string, column: any) => columns.push(column),
    getTable: async () => ({ foreignKeys }),
    createForeignKey: async (_table: string, key: any) => foreignKeys.push(key),
    query: async (statement: string) => sql.push(statement),
  };
  await new AddInvoiceCreditAuthorization1770000029000().up(runner);
  assert.deepEqual(columns.map((column) => column.name), ['is_credit_sale', 'credit_authorized_by_user_id', 'credit_authorized_at']);
  assert.equal(columns[0].default, 0);
  assert.equal(columns[1].isNullable, true);
  assert.equal(columns[2].isNullable, true);
  assert.equal(foreignKeys[0].name, 'fk_invoice_credit_authorized_by');
  assert.deepEqual(sql, [], 'legacy rows must not be rewritten or inferred as credit sales');
});

test('credit authorization migration is safe when an upgrade clone already has every change', async () => {
  let mutations = 0;
  const runner: any = {
    hasTable: async () => true,
    hasColumn: async () => true,
    addColumn: async () => { mutations += 1; },
    getTable: async () => ({ foreignKeys: [{ name: 'fk_invoice_credit_authorized_by' }] }),
    createForeignKey: async () => { mutations += 1; },
  };
  await new AddInvoiceCreditAuthorization1770000029000().up(runner);
  assert.equal(mutations, 0);
});
