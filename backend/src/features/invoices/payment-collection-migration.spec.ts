import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryRunner } from 'typeorm';
import { AddPaymentCollectionReceipts1770000049000 } from '../../migrations/1770000049000-AddPaymentCollectionReceipts';

test('payment collection migration rerun makes no DDL changes', async () => {
  const queries: string[] = [];
  const runner = {
    hasColumn: async () => true,
    getTable: async () => ({ findColumnByName: () => ({ length: '24' }) }),
    query: async (sql: string) => { queries.push(sql); return []; },
  } as unknown as QueryRunner;
  await new AddPaymentCollectionReceipts1770000049000().up(runner);
  assert.deepEqual(queries, []);
});

test('payment collection migration resumes after partial MySQL DDL', async () => {
  const queries: string[] = [];
  const runner = {
    hasColumn: async () => false,
    getTable: async (table: string) => ({ findColumnByName: () => ({ length: table === 'tbl_pos_print_job' ? '24' : '10' }) }),
    query: async (sql: string) => { queries.push(sql); return []; },
  } as unknown as QueryRunner;
  await new AddPaymentCollectionReceipts1770000049000().up(runner);
  assert.deepEqual(queries, [
    'ALTER TABLE tbl_invoice_payment ADD COLUMN receipt_snapshot json NULL',
    'ALTER TABLE tbl_pos_receipt_reprint MODIFY COLUMN document_type varchar(24) NOT NULL',
  ]);
});
