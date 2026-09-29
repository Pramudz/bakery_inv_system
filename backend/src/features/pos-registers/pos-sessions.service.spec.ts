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
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => value && value._type === 'in' ? value._value.includes(row[key]) : row[key] === value);
  const one = (rows: any[], where: any | any[]) => {
    const predicates = Array.isArray(where) ? where : [where];
    return rows.find((row) => predicates.some((predicate) => matches(row, predicate))) ?? null;
  };
  const repository = (entity: unknown): any => {
    if (entity === Tenant) return { findOneBy: async (where: any) => Number(where.tenantId) === 1 ? { tenantId: 1, timeZone: 'Asia/Colombo' } : null };
    if (entity === Location) return { findOneBy: async (where: any) => one(state.locations, where) };
    if (entity === PosLocationConfig) return {
      findOneBy: async (where: any) => matches(state.config, where) ? state.config : null,
      findOne: async ({ where }: any) => matches(state.config, where) ? state.config : null,
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
  return { state, service: new PosSessionsService(dataSource) };
}

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
