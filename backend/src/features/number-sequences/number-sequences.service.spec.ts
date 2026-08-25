import assert from 'node:assert/strict';
import test from 'node:test';
import { EntityManager } from 'typeorm';
import {
  formatGoodsReceiptNumber,
  formatPurchaseOrderNumber,
  formatSku,
  formatSupplierCode,
  formatCustomerCode,
} from './number-sequence-formatters';
import { NumberSequenceKeys } from './number-sequence-keys';
import { NumberSequencesService } from './number-sequences.service';

class FakeMysqlManager {
  private lastInsertId = 0;

  constructor(private readonly counters: Map<string, number>) {}

  async query(sql: string, parameters: unknown[] = []) {
    if (sql.includes('INSERT INTO')) {
      const key = parameters.join('|');
      if (!this.counters.has(key)) this.counters.set(key, 0);
      return [];
    }
    if (sql.includes('UPDATE tbl_number_sequence')) {
      const key = parameters.join('|');
      this.lastInsertId = (this.counters.get(key) ?? 0) + 1;
      this.counters.set(key, this.lastInsertId);
      return [];
    }
    return [{ nextNumber: this.lastInsertId }];
  }
}

const manager = (counters: Map<string, number>) =>
  new FakeMysqlManager(counters) as unknown as EntityManager;

test('formats first SKU, PO and GRN numbers', () => {
  assert.equal(formatSku(1), 'SKU-000001');
  assert.equal(formatPurchaseOrderNumber(1515, '2026', 1), 'PO-1515-2026-000001');
  assert.equal(formatGoodsReceiptNumber(1515, '2026', 1), 'GRN-1515-2026-000001');
  assert.equal(formatSupplierCode(1), 'SUP-000001');
  assert.equal(formatCustomerCode(1), 'CUS-000001');
});

test('supplier and customer use separate tenant-level counters', async () => {
  const service = new NumberSequencesService();
  const tx = manager(new Map());
  assert.equal(await service.getTenantNextNumber(tx, 5, NumberSequenceKeys.SUPPLIER), 1);
  assert.equal(await service.getTenantNextNumber(tx, 5, NumberSequenceKeys.CUSTOMER), 1);
  assert.equal(await service.getTenantNextNumber(tx, 5, NumberSequenceKeys.SUPPLIER), 2);
});

test('generates sequential tenant numbers', async () => {
  const service = new NumberSequencesService();
  const tx = manager(new Map());
  assert.equal(await service.getTenantNextNumber(tx, 1, NumberSequenceKeys.SKU), 1);
  assert.equal(await service.getTenantNextNumber(tx, 1, NumberSequenceKeys.SKU), 2);
});

test('keeps tenant and yearly counters separate', async () => {
  const service = new NumberSequencesService();
  const tx = manager(new Map());
  assert.equal(await service.getTenantNextNumber(tx, 1, NumberSequenceKeys.PURCHASE_ORDER, '2026'), 1);
  assert.equal(await service.getTenantNextNumber(tx, 2, NumberSequenceKeys.PURCHASE_ORDER, '2026'), 1);
  assert.equal(await service.getTenantNextNumber(tx, 1, NumberSequenceKeys.PURCHASE_ORDER, '2027'), 1);
  assert.equal(await service.getTenantNextNumber(tx, 1, NumberSequenceKeys.GOODS_RECEIPT, '2026'), 1);
});

test('concurrent callers receive unique numbers', async () => {
  const service = new NumberSequencesService();
  const counters = new Map<string, number>();
  const values = await Promise.all(
    Array.from({ length: 20 }, () =>
      service.getTenantNextNumber(manager(counters), 1, NumberSequenceKeys.SKU),
    ),
  );
  assert.equal(new Set(values).size, 20);
  assert.deepEqual([...values].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('failed Product, PO and GRN transactions do not commit counter increments', async () => {
  const service = new NumberSequencesService();
  for (const [sequenceKey, periodKey] of [
    [NumberSequenceKeys.SKU, 'NEVER'],
    [NumberSequenceKeys.PURCHASE_ORDER, '2026'],
    [NumberSequenceKeys.GOODS_RECEIPT, '2026'],
  ] as const) {
    const committed = new Map<string, number>();
    const transactionState = new Map(committed);
    assert.equal(await service.getTenantNextNumber(manager(transactionState), 9, sequenceKey, periodKey), 1);
    // Simulate the outer caller transaction rolling back by discarding its state.
    assert.equal(await service.getTenantNextNumber(manager(committed), 9, sequenceKey, periodKey), 1);
  }
});
