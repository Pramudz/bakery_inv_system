import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryBalanceService } from './inventory-balance.service';

test('addStock locks the balance and preserves weighted-average cost under serialized updates', async () => {
  let lockMode: string | undefined;
  let saved: any;
  const existing = { quantityOnHand: '10', averageCost: '5', lastMovementAt: null };
  const builder: any = { setLock: (mode: string) => { lockMode = mode; return builder; }, where: () => builder, getOne: async () => existing };
  const repository: any = { createQueryBuilder: () => builder, save: async (row: any) => { saved = row; return row; }, create: (row: any) => row };
  const manager: any = { getRepository: () => repository };
  const result = await new InventoryBalanceService().addStock(manager, 1, 2, 3, 10, 15);
  assert.equal(lockMode, 'pessimistic_write');
  assert.equal(result.averageCostAfter, 10);
  assert.equal(saved.quantityOnHand, '20');
  assert.equal(saved.averageCost, '10');
});

test('a new balance snapshots the first receipt cost', async () => {
  const builder: any = { setLock: () => builder, where: () => builder, getOne: async () => null };
  let saved: any;
  const repository: any = { createQueryBuilder: () => builder, create: (row: any) => row, save: async (row: any) => { saved = row; } };
  await new InventoryBalanceService().addStock({ getRepository: () => repository } as any, 1, 2, 3, 4, 7.5);
  assert.equal(saved.quantityOnHand, '4');
  assert.equal(saved.averageCost, '7.5');
});
