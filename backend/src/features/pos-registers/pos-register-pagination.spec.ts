import assert from 'node:assert/strict';
import test from 'node:test';
import { PosTerminal } from './pos-terminal.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';
import { PosRegistersService } from './pos-registers.service';

test('terminal pagination applies access, filters, stable ordering, offset, and total before returning a page', async () => {
  const calls = { where: [] as string[], order: [] as string[], skip: 0, take: 0 };
  const terminal = { posTerminalId: 7, tenantId: 1, locationId: 11, terminalCode: 'POS1', displayName: 'Front', isActive: true, location: { locationId: 11, code: 'BND', name: 'Bandaragama', isActive: true } } as any;
  const builder: any = {
    leftJoinAndSelect: () => builder,
    where: (clause: string) => { calls.where.push(clause); return builder; },
    andWhere: (clause: string) => { calls.where.push(clause); return builder; },
    orderBy: (column: string) => { calls.order.push(column); return builder; },
    addOrderBy: (column: string) => { calls.order.push(column); return builder; },
    skip: (value: number) => { calls.skip = value; return builder; },
    take: (value: number) => { calls.take = value; return builder; },
    getManyAndCount: async () => [[terminal], 37],
  };
  const dataSource: any = { getRepository: (entity: unknown) => {
    if (entity === PosTerminal) return { createQueryBuilder: () => builder };
    if (entity === PosTerminalPairing) return { findBy: async () => [] };
    throw new Error('Unexpected repository');
  } };
  const service = new PosRegistersService(dataSource);
  const result = await service.terminals({ page: 2, pageSize: 20, search: 'pos', locationId: 11, status: 'ACTIVE' }, { tenantId: 1, userId: 2, accessScope: 'LOCATION', assignedLocationIds: [11] } as any);
  assert.equal(result.total, 37);
  assert.equal(result.items.length, 1);
  assert.equal(calls.skip, 20);
  assert.equal(calls.take, 20);
  assert.ok(calls.where.some((clause) => clause.includes('location_id IN')));
  assert.ok(calls.where.some((clause) => clause.includes('terminal.location_id =')));
  assert.ok(calls.where.some((clause) => clause.includes('terminal.is_active')));
  assert.ok(calls.where.some((clause) => clause.includes('terminal.terminal_code LIKE')));
  assert.deepEqual(calls.order, ['location.name', 'terminal.terminalCode', 'terminal.posTerminalId']);
});
