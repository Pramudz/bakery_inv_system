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

test('exact-value inbound snapshot establishes WAVG without recomputing posted value from rounded unit cost', () => {
  const snapshot = new InventoryBalanceService().inboundValueSnapshot(null, '3.0000', '10.0000');
  assert.equal(snapshot.unitCost, '3.3333');
  assert.equal(snapshot.movementValue, '10.0000');
  assert.equal(snapshot.averageCostAfter, '3.3333');
});

test('exact-value inbound snapshot recalculates WAVG from the authoritative inbound value', () => {
  const snapshot = new InventoryBalanceService().inboundValueSnapshot({ quantityOnHand: '20.0000', averageCost: '120.0000' }, '5.0000', '400.0000');
  assert.equal(snapshot.unitCost, '80.0000');
  assert.equal(snapshot.quantityAfter, '25.0000');
  assert.equal(snapshot.averageCostAfter, '112.0000');
});

test('exact-value inbound permits missing WAVG at zero stock but rejects invalid existing-stock valuation', () => {
  assert.equal(new InventoryBalanceService().inboundValueSnapshot({ quantityOnHand: '0', averageCost: null as any }, '2', '10').averageCostAfter, '5.0000');
  assert.throws(() => new InventoryBalanceService().inboundValueSnapshot({ quantityOnHand: '1', averageCost: null as any }, '2', '10'), /no usable WAVG/);
  assert.throws(() => new InventoryBalanceService().inboundValueSnapshot({ quantityOnHand: '1', averageCost: '0' }, '2', '10'), /no usable WAVG/);
  assert.throws(() => new InventoryBalanceService().inboundValueSnapshot({ quantityOnHand: '1', averageCost: '-1' }, '2', '10'), /no usable WAVG/);
});
