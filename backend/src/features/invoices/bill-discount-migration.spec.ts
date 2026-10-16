import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryRunner } from 'typeorm';
import { AddInvoiceBillDiscount1770000050000 } from '../../migrations/1770000050000-AddInvoiceBillDiscount';

test('bill discount migration adds only new fields and preserves posted commercial columns', async () => {
  const columns = new Set<string>();
  const statements: string[] = [];
  const runner = { hasColumn: async (table: string, column: string) => columns.has(`${table}.${column}`),
    addColumn: async (table: string, column: { name: string }) => { columns.add(`${table}.${column.name}`); },
    getTable: async () => ({ foreignKeys: [] }), createForeignKey: async () => {},
    query: async (sql: string) => { statements.push(sql); return []; } } as unknown as QueryRunner;
  await new AddInvoiceBillDiscount1770000050000().up(runner);
  assert.ok(columns.has('tbl_invoice.bill_discount_total'));
  assert.ok(columns.has('tbl_invoice_detail.bill_discount_allocated'));
  assert.ok(columns.has('tbl_invoice_refund_detail.bill_discount_allocated'));
  assert.ok(statements.some((sql) => sql.includes('item_discount_total = discount_total')));
  assert.ok(statements.some((sql) => sql.includes('net_before_bill_discount = net_total')));
  assert.ok(statements.every((sql) => !/SET\s+(grand_total|net_total|discount_total)\s*=/i.test(sql)));
});

test('rollback refuses to drop the breakdown when discounted invoices exist', async () => {
  const runner = { query: async () => [{ count: 1 }] } as unknown as QueryRunner;
  await assert.rejects(new AddInvoiceBillDiscount1770000050000().down(runner), /discounted invoices exist/i);
});
