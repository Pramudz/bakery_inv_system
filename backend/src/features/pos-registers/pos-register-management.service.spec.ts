import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Location } from '../locations/locations.entity';
import { PosCashReconciliation } from './pos-cash-reconciliation.entity';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosLocationConfig, PosRegisterMode } from './pos-location-config.entity';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { PosRegisterManagementService } from './pos-register-management.service';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';
import { PosTerminal } from './pos-terminal.entity';

const tenantUser = { tenantId: 1, userId: 7, accessScope: 'LOCATION', assignedLocationIds: [3] } as any;

function fixture() {
  const location = { locationId: 3, tenantId: 1, code: 'MAIN', name: 'Main', isActive: true };
  const terminals = [
    { posTerminalId: 21, tenantId: 1, locationId: 3, terminalCode: 'T01', displayName: 'Front', isActive: true },
    { posTerminalId: 22, tenantId: 1, locationId: 3, terminalCode: 'T02', displayName: 'Side', isActive: true },
  ];
  const register = { posCashRegisterId: 10, tenantId: 1, locationId: 3, displayName: 'Front register', registerMode: PosRegisterMode.TERMINAL_REGISTER, isActive: true, terminal: terminals[0] };
  const registerSession = { posRegisterSessionId: 11, posCashRegisterId: 10, tenantId: 1, locationId: 3, businessDate: '2026-10-01', openingBalance: '100', openedAt: new Date(), closedAt: null, status: PosRegisterSessionStatus.OPEN, register };
  const cashier = { posCashierSessionId: 12, posRegisterSessionId: 11, tenantId: 1, locationId: 3, cashierUserId: 7, posTerminalId: 21, startedAt: new Date(), endedAt: null, status: PosCashierSessionStatus.ACTIVE, cashier: { userId: 7, username: 'cashier', firstName: 'Nimal', lastName: null }, terminal: terminals[0], registerSession };
  const repos = (entity: unknown): any => {
    if (entity === Location) return { findOneBy: async (where: any) => Number(where.locationId) === 3 && Number(where.tenantId) === 1 ? location : null, find: async () => [location] };
    if (entity === PosLocationConfig) return { find: async () => [{ tenantId: 1, locationId: 3, registerMode: PosRegisterMode.TERMINAL_REGISTER }] };
    if (entity === PosCashRegister) return { find: async () => [register] };
    if (entity === PosRegisterSession) return { find: async () => [registerSession], createQueryBuilder: () => {
      const builder: any = { leftJoinAndSelect: () => builder, where: () => builder, andWhere: () => builder, orderBy: () => builder, addOrderBy: () => builder, skip: () => builder, take: () => builder, getManyAndCount: async () => [[registerSession], 1] };
      return builder;
    } };
    if (entity === PosCashierSession) return { find: async () => [cashier], count: async () => 1 };
    if (entity === PosCashReconciliation) return { findOne: async () => null, count: async () => 0 };
    if (entity === PosMasterReconciliation) return { count: async () => 0 };
    if (entity === PosTerminal) return { find: async () => terminals, count: async () => 2 };
    throw new Error(`Unexpected repository ${(entity as any)?.name}`);
  };
  const context = { location, config: { registerMode: PosRegisterMode.TERMINAL_REGISTER }, pairingValid: true, terminal: { ...terminals[0], location }, register, registerSession, cashierSession: cashier, canBill: true, action: null, blockedReason: null };
  const sessionService = { context: async () => context } as any;
  const service = new PosRegisterManagementService({ getRepository: repos, manager: { getRepository: repos } } as any, sessionService, { buildSummary: async () => null } as any);
  return { service, context };
}

test('management overview is tenant/location scoped and selecting rows cannot impersonate another terminal', async () => {
  const { service, context } = fixture();
  const result = await service.overview(3, 'browser-secret', tenantUser);
  assert.equal(result.context.terminal!.posTerminalId, context.terminal.posTerminalId);
  assert.equal(result.terminals.find((row) => row.posTerminalId === 21)?.isCurrentDevice, true);
  assert.equal(result.terminals.find((row) => row.posTerminalId === 22)?.isCurrentDevice, false);
  assert.equal(result.cashierSessions[0].isCurrentDevice, true);
  assert.equal(result.cashierSessions[0].nextAction, 'SIGN_OFF');
  assert.deepEqual(result.sessionSummary, { currentCashiers: 1, activeTerminals: 2, availableTerminals: 1 });
  await assert.rejects(service.overview(4, 'browser-secret', tenantUser), ForbiddenException);
});

test('management location list returns only authorized locations and their configured real mode', async () => {
  const { service } = fixture();
  const rows = await service.locations(tenantUser);
  assert.deepEqual(rows, [{ locationId: 3, code: 'MAIN', name: 'Main', registerMode: PosRegisterMode.TERMINAL_REGISTER }]);
});

test('management history is location scoped and paginated', async () => {
  const { service } = fixture();
  const history = await service.history(3, { page: 1, limit: 20 }, 'REGISTERS', tenantUser);
  assert.equal(history.page, 1);
  assert.equal(history.limit, 20);
  assert.equal(history.total, 1);
  assert.equal(history.items[0].id, 11);
  await assert.rejects(service.history(4, { page: 1, limit: 20 }, 'REGISTERS', tenantUser), ForbiddenException);
});
