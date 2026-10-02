import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosLocationConfig, PosRegisterMode } from './pos-location-config.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';
import { PosSessionsService } from './pos-sessions.service';
import { PosRegistersService } from './pos-registers.service';
import { PosCashReconciliation } from './pos-cash-reconciliation.entity';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';
import { PosTerminal } from './pos-terminal.entity';

const credential = 'paired-browser-secret';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const user = (overrides: Partial<TenantPrincipal> = {}) => ({
  scope: 'TENANT', tenantId: 1, userId: 10, username: 'cashier', roleId: 2, roleCode: 'CASHIER', accessScope: 'TENANT', assignedLocationIds: [], ...overrides,
} as TenantPrincipal);

function fixture(mode: PosRegisterMode, serialize = false) {
  const state = {
    locations: [
      { locationId: 11, tenantId: 1, code: 'MAIN', name: 'Main', isActive: true },
      { locationId: 12, tenantId: 1, code: 'WEST', name: 'West', isActive: true },
    ] as any[],
    config: { posLocationConfigId: 1, tenantId: 1, locationId: 11, registerMode: mode } as any,
    terminal: { posTerminalId: 21, tenantId: 1, locationId: 11, terminalCode: 'POS-01', displayName: 'Front', isActive: true } as any,
    pairing: { posTerminalPairingId: 31, tenantId: 1, posTerminalId: 21, pairingSecretHash: hash(credential), pairedAt: new Date(), pairedByUserId: 10, lastSeenAt: null, revokedAt: null } as any,
    registers: [] as any[],
    registerSessions: [] as any[],
    cashierSessions: [] as any[],
  };
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (value?._type === 'in') return value._value.includes(row[key]);
    if (value?._type === 'isNull') return row[key] === null || row[key] === undefined;
    return row[key] === value;
  });
  const one = (rows: any[], where: any | any[]) => {
    const predicates = Array.isArray(where) ? where : [where];
    return rows.find((row) => predicates.some((predicate) => matches(row, predicate))) ?? null;
  };
  const repository = (entity: unknown): any => {
    if (entity === Tenant) return { findOneBy: async (where: any) => Number(where.tenantId) === 1 ? { tenantId: 1, timeZone: 'Asia/Colombo' } : null };
    if (entity === Location) return { findOneBy: async (where: any) => one(state.locations, where), findOne: async ({ where }: any) => one(state.locations, where) };
    if (entity === PosLocationConfig) return {
      findOneBy: async (where: any) => matches(state.config, where) ? state.config : null,
      findOne: async ({ where }: any) => matches(state.config, where) ? state.config : null,
      create: (row: any) => row,
      save: async (row: any) => Object.assign(state.config, row),
    };
    if (entity === PosTerminalPairing) return {
      findOne: async ({ where }: any) => matches(state.pairing, where) ? state.pairing : null,
      save: async (row: any) => Object.assign(state.pairing, row),
    };
    if (entity === PosTerminal) return {
      findOne: async ({ where }: any) => matches(state.terminal, where) ? { ...state.terminal } : null,
    };
    if (entity === PosCashRegister) return {
      findOneBy: async (where: any) => one(state.registers, where),
      findOne: async ({ where }: any) => one(state.registers, where),
      create: (row: any) => row,
      save: async (row: any) => {
        const saved = { ...row, posCashRegisterId: row.posCashRegisterId ?? 100 + state.registers.length };
        const index = state.registers.findIndex((candidate) => candidate.posCashRegisterId === saved.posCashRegisterId);
        if (index >= 0) state.registers[index] = saved; else state.registers.push(saved);
        return saved;
      },
    };
    if (entity === PosRegisterSession) return {
      findOneBy: async (where: any) => one(state.registerSessions, where),
      findOne: async ({ where }: any) => one(state.registerSessions, where),
      create: (row: any) => row,
      save: async (row: any) => {
        const saved = { ...row, posRegisterSessionId: row.posRegisterSessionId ?? 200 + state.registerSessions.length };
        const index = state.registerSessions.findIndex((candidate) => candidate.posRegisterSessionId === saved.posRegisterSessionId);
        if (index >= 0) state.registerSessions[index] = saved; else state.registerSessions.push(saved);
        return saved;
      },
    };
    if (entity === PosCashierSession) return {
      findOneBy: async (where: any) => one(state.cashierSessions, where),
      findOne: async ({ where }: any) => one(state.cashierSessions, where),
      create: (row: any) => row,
      save: async (row: any) => {
        const saved = { ...row, posCashierSessionId: row.posCashierSessionId ?? 300 + state.cashierSessions.length };
        const index = state.cashierSessions.findIndex((candidate) => candidate.posCashierSessionId === saved.posCashierSessionId);
        if (index >= 0) state.cashierSessions[index] = saved; else state.cashierSessions.push(saved);
        return saved;
      },
    };
    if (entity === PosCashReconciliation || entity === PosMasterReconciliation) return { findOne: async () => null };
    throw new Error(`Unexpected repository ${(entity as any)?.name}`);
  };
  const manager = { getRepository: repository } as any;
  let queue = Promise.resolve();
  const transaction = (work: any) => {
    if (!serialize) return work(manager);
    const result = queue.then(() => work(manager));
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const dataSource = { manager, getRepository: repository, transaction } as any;
  return { state, service: new PosSessionsService(dataSource), registersService: new PosRegistersService(dataSource) };
}

test('mode switching and register opening serialize so neither transition can bypass the other', async () => {
  const openingFirst = fixture(PosRegisterMode.MASTER_REGISTER, true);
  const opened = openingFirst.service.openMaster({ locationId: 11, openingBalance: 10 }, user({ userId: 99 }));
  const switched = openingFirst.registersService.configureLocation(11, { registerMode: PosRegisterMode.TERMINAL_REGISTER }, user({ userId: 99 }));
  await opened;
  await assert.rejects(switched, /open register/i);

  const switchingFirst = fixture(PosRegisterMode.MASTER_REGISTER, true);
  const switchedFirst = switchingFirst.registersService.configureLocation(11, { registerMode: PosRegisterMode.TERMINAL_REGISTER }, user({ userId: 99 }));
  const openedSecond = switchingFirst.service.openMaster({ locationId: 11, openingBalance: 10 }, user({ userId: 99 }));
  await switchedFirst;
  await assert.rejects(openedSecond, /does not use a master register/i);
});

test('terminal mode opens one register/cashier session and resumes it without another opening balance', async () => {
  const f = fixture(PosRegisterMode.TERMINAL_REGISTER);
  const opened = await f.service.openTerminal({ openingBalance: 125.5 }, credential, user());
  const resumed = await f.service.openTerminal({ openingBalance: 999 }, credential, user());
  assert.equal(opened.resumed, false);
  assert.equal(resumed.resumed, true);
  assert.equal(f.state.registers.length, 1);
  assert.equal(f.state.registerSessions.length, 1);
  assert.equal(f.state.cashierSessions.length, 1);
  assert.equal(f.state.registerSessions[0].openingBalance, '125.50');
  assert.match(f.state.registerSessions[0].businessDate, /^\d{4}-\d{2}-\d{2}$/);
  const active = await f.service.requireCashierSession((f.service as any).dataSource.manager, credential, user(), 11);
  assert.equal(active.cashierSession.posCashierSessionId, opened.cashierSession.posCashierSessionId);
});

test('master mode opens remotely without a pairing and starts each billing cashier from a paired terminal', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER);
  const opened = await f.service.openMaster({ locationId: 11, openingBalance: 500 }, user({ userId: 99, roleCode: 'TENANT_ADMIN' }));
  assert.equal(opened.terminal, null);
  assert.equal(opened.cashierSession, null);
  assert.equal(f.state.cashierSessions.length, 0);
  const started = await f.service.startCashier(credential, user());
  const resumed = await f.service.startCashier(credential, user());
  assert.equal(started.resumed, false);
  assert.equal(resumed.resumed, true);
  assert.equal(f.state.registers[0].posTerminalId, null);
  assert.equal(f.state.registerSessions[0].openingBalance, '500.00');
  assert.equal(f.state.cashierSessions.length, 1);
});

test('approved master sign-off releases the terminal for the next cashier without closing the shared register', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER);
  await f.service.openMaster({ locationId: 11, openingBalance: 500 }, user({ userId: 99, roleCode: 'TENANT_ADMIN' }));
  await f.service.startCashier(credential, user());
  f.state.cashierSessions[0].status = PosCashierSessionStatus.ENDED;
  f.state.cashierSessions[0].endedAt = new Date();
  const next = await f.service.startCashier(credential, user({ userId: 12, username: 'next-cashier' }));
  assert.equal(next.resumed, false);
  assert.equal(f.state.cashierSessions.length, 2);
  assert.equal(f.state.cashierSessions[1].cashierUserId, 12);
  assert.equal(f.state.registerSessions.length, 1);
  assert.equal(f.state.registerSessions[0].status, PosRegisterSessionStatus.OPEN);
});

test('unpaired master cashiers share one register but keep separate nullable-terminal sessions', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER, true);
  await f.service.openMaster({ locationId: 11, openingBalance: 100 }, user({ userId: 99 }));
  const first = await f.service.startCashier(undefined, user(), 11);
  const second = await f.service.startCashier(undefined, user({ userId: 12 }), 11);
  assert.equal(first.terminal, null);
  assert.equal(second.terminal, null);
  assert.equal(f.state.cashierSessions.length, 2);
  assert.ok(f.state.cashierSessions.every((row) => row.posTerminalId === null));
  assert.equal(first.registerSession.posRegisterSessionId, second.registerSession.posRegisterSessionId);
  const context = await f.service.context(11, undefined, user());
  assert.equal(context.canBill, true);
  assert.equal(context.action, null);
  const active = await f.service.requireCashierSession((f.service as any).dataSource.manager, undefined, user(), 11);
  assert.equal(active.terminal, null);
  const closing = await f.service.requireMasterClosingSession((f.service as any).dataSource.manager, undefined, user());
  assert.equal(closing.cashierSession.posCashierSessionId, first.cashierSession.posCashierSessionId);
  const terminal = fixture(PosRegisterMode.TERMINAL_REGISTER);
  await assert.rejects(terminal.service.startCashier(undefined, user(), 11), /Terminal mode requires a paired browser/);
});

test('a closed master register session is never resumed and the next opening balance is explicit', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER);
  await f.service.openMaster({ locationId: 11, openingBalance: 500 }, user({ userId: 99, roleCode: 'TENANT_ADMIN' }));
  f.state.registerSessions[0].status = PosRegisterSessionStatus.CLOSED;
  f.state.registerSessions[0].closedAt = new Date();
  f.state.registerSessions[0].closedByUserId = 77;

  const next = await f.service.openMaster(
    { locationId: 11, openingBalance: 325 },
    user({ userId: 98, roleCode: 'TENANT_ADMIN' }),
  );

  assert.equal(next.resumed, false);
  assert.equal(f.state.registerSessions.length, 2);
  assert.equal(f.state.registerSessions[1].openingBalance, '325.00');
  assert.equal(f.state.registerSessions[1].status, PosRegisterSessionStatus.OPEN);
});

test('a submitted master count freezes new cashier-session starts', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER);
  await f.service.openMaster({ locationId: 11, openingBalance: 500 }, user({ userId: 99, roleCode: 'TENANT_ADMIN' }));
  f.state.registerSessions[0].status = PosRegisterSessionStatus.PENDING_VERIFICATION;

  await assert.rejects(
    f.service.startCashier(credential, user()),
    /frozen for closing/i,
  );
  assert.equal(f.state.cashierSessions.length, 0);
});

test('serialized concurrent terminal openings create one opening balance and one cashier session', async () => {
  const f = fixture(PosRegisterMode.TERMINAL_REGISTER, true);
  const results = await Promise.all([
    f.service.openTerminal({ openingBalance: 100 }, credential, user()),
    f.service.openTerminal({ openingBalance: 200 }, credential, user()),
  ]);
  assert.equal(f.state.registerSessions.length, 1);
  assert.equal(f.state.cashierSessions.length, 1);
  assert.deepEqual(results.map((result) => result.resumed).sort(), [false, true]);
  assert.equal(f.state.registerSessions[0].openingBalance, '100.00');
});

test('closed master history remains unchanged when terminal mode opens, and reverse switching reuses each logical register', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER, true);
  const operator = user({ userId: 99, roleCode: 'TENANT_ADMIN' });
  const firstMaster = await f.service.openMaster({ locationId: 11, openingBalance: 50 }, operator);
  f.state.registerSessions[0].status = PosRegisterSessionStatus.CLOSED;
  const originalMaster = { ...f.state.registers[0] };
  f.state.config.registerMode = PosRegisterMode.TERMINAL_REGISTER;

  const [opened, resumed] = await Promise.all([
    f.service.openTerminal({ openingBalance: 125 }, credential, user()),
    f.service.openTerminal({ openingBalance: 999 }, credential, user()),
  ]);
  assert.deepEqual([opened.resumed, resumed.resumed], [false, true]);
  assert.equal(f.state.registers.length, 2);
  assert.deepEqual(f.state.registers[0], originalMaster);
  assert.equal(f.state.registers[1].registerKey, 'TERMINAL:21');
  assert.equal(opened.registerSession.posCashRegisterId, f.state.registers[1].posCashRegisterId);
  assert.equal(opened.cashierSession?.posRegisterSessionId, opened.registerSession.posRegisterSessionId);
  assert.notEqual(opened.register.posCashRegisterId, firstMaster.register.posCashRegisterId);

  f.state.registerSessions[1].status = PosRegisterSessionStatus.CLOSED;
  f.state.cashierSessions[0].status = PosCashierSessionStatus.ENDED;
  f.state.config.registerMode = PosRegisterMode.MASTER_REGISTER;
  const secondMaster = await f.service.openMaster({ locationId: 11, openingBalance: 70 }, operator);
  assert.equal(secondMaster.register.posCashRegisterId, originalMaster.posCashRegisterId);
  assert.equal(f.state.registers.length, 2);
  f.state.registerSessions[2].status = PosRegisterSessionStatus.CLOSED;
  f.state.config.registerMode = PosRegisterMode.TERMINAL_REGISTER;
  const secondTerminal = await f.service.openTerminal({ openingBalance: 80 }, credential, user());
  assert.equal(secondTerminal.register.posCashRegisterId, opened.register.posCashRegisterId);
  assert.equal(f.state.registers.length, 2);
  assert.deepEqual(f.state.registers[0], originalMaster);
});

test('invalid/revoked pairing, wrong location, missing configuration and missing sessions block checkout context', async () => {
  const revoked = fixture(PosRegisterMode.TERMINAL_REGISTER);
  revoked.state.pairing.revokedAt = new Date();
  await assert.rejects(revoked.service.requireCashierSession((revoked.service as any).dataSource.manager, credential, user(), 11), /revoked/i);

  const wrongLocation = fixture(PosRegisterMode.TERMINAL_REGISTER);
  await wrongLocation.service.openTerminal({ openingBalance: 0 }, credential, user());
  await assert.rejects(wrongLocation.service.requireCashierSession((wrongLocation.service as any).dataSource.manager, credential, user(), 12), /different location/i);
  await assert.rejects(wrongLocation.service.requireCashierSession((wrongLocation.service as any).dataSource.manager, credential, user({ accessScope: 'LOCATION', assignedLocationIds: [12] }), 11), /access/i);

  const missing = fixture(PosRegisterMode.TERMINAL_REGISTER);
  (missing.state as any).config = { ...missing.state.config, tenantId: 99 };
  await assert.rejects(missing.service.openTerminal({ openingBalance: 0 }, credential, user()), /configuration/i);

  const unopened = fixture(PosRegisterMode.MASTER_REGISTER);
  await assert.rejects(unopened.service.startCashier(credential, user()), /not open/i);
});

test('context clearly reports configuration, pairing, open-register and cashier-session blockers', async () => {
  const f = fixture(PosRegisterMode.MASTER_REGISTER);
  const before = await f.service.context(11, credential, user());
  assert.equal(before.action, 'OPEN_MASTER_REGISTER');
  await f.service.openMaster({ locationId: 11, openingBalance: 0 }, user({ userId: 99 }));
  const needsCashier = await f.service.context(11, credential, user());
  assert.equal(needsCashier.action, 'START_CASHIER_SESSION');
  await f.service.startCashier(credential, user());
  const ready = await f.service.context(11, credential, user());
  assert.equal(ready.canBill, true);
  assert.equal(ready.action, null);
});

test('pending verification blocks checkout and reopening, while a closed shift is never resumed', async () => {
  const f = fixture(PosRegisterMode.TERMINAL_REGISTER);
  await f.service.openTerminal({ openingBalance: 100 }, credential, user());
  f.state.registerSessions[0].status = PosRegisterSessionStatus.PENDING_VERIFICATION;
  f.state.cashierSessions[0].status = PosCashierSessionStatus.PENDING_VERIFICATION;
  await assert.rejects(f.service.requireCashierSession((f.service as any).dataSource.manager, credential, user(), 11), /active cashier session/i);
  await assert.rejects(f.service.openTerminal({ openingBalance: 200 }, credential, user()), /awaiting verification/i);
  f.state.registerSessions[0].status = PosRegisterSessionStatus.CLOSED;
  f.state.cashierSessions[0].status = PosCashierSessionStatus.ENDED;
  const next = await f.service.openTerminal({ openingBalance: 200 }, credential, user());
  assert.equal(next.resumed, false);
  assert.equal(f.state.registerSessions.length, 2);
  assert.equal(f.state.registerSessions[1].openingBalance, '200.00');
});
