import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { PosTerminalActivation } from './pos-terminal-activation.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';
import { PosTerminal } from './pos-terminal.entity';
import { PosRegistersService } from './pos-registers.service';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession } from './pos-cashier-session.entity';
import { PosRegisterSession } from './pos-register-session.entity';
import { PosLocationConfig, PosRegisterMode } from './pos-location-config.entity';
import { PosCashReconciliation } from './pos-cash-reconciliation.entity';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { PosRegistersController } from './pos-registers.controller';
import { REQUIRE_PERMISSION } from '../auth/require-permission.decorator';

const tenantUser = (overrides: Partial<TenantPrincipal> = {}) => ({
  scope: 'TENANT', userId: 10, tenantId: 1, username: 'cashier.one', roleId: 2,
  roleCode: 'CASHIER', accessScope: 'TENANT', assignedLocationIds: [], ...overrides,
} as TenantPrincipal);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

test('terminal maintenance remains protected by the existing register-administration permission', () => {
  assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, PosRegistersController), 'SALES_POS_REGISTER_ADMIN');
});

function fixture() {
  const state = {
    locations: [
      { locationId: 11, tenantId: 1, code: 'MAIN', name: 'Main', isActive: true },
      { locationId: 12, tenantId: 1, code: 'WEST', name: 'West', isActive: true },
      { locationId: 21, tenantId: 2, code: 'OTHER', name: 'Other tenant', isActive: true },
    ] as any[],
    terminals: [
      { posTerminalId: 31, tenantId: 1, locationId: 11, terminalCode: 'POS-01', displayName: 'Front', isActive: true, createdAt: new Date(), updatedAt: null },
      { posTerminalId: 41, tenantId: 2, locationId: 21, terminalCode: 'POS-01', displayName: 'Other', isActive: true, createdAt: new Date(), updatedAt: null },
    ] as any[],
    activations: [] as any[],
    pairings: [] as any[],
    registers: [] as any[],
    registerSessions: [] as any[],
    cashierSessions: [] as any[],
    configs: [{ posLocationConfigId: 1, tenantId: 1, locationId: 11, registerMode: PosRegisterMode.MASTER_REGISTER }] as any[],
    cashReconciliations: [] as any[],
    masterReconciliations: [] as any[],
  };
  let failPairingSave = false;
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => value && value._type === 'in' ? value._value.includes(row[key]) : row[key] === value);

  const repository = (entity: unknown): any => {
    if (entity === Location) return {
      findOneBy: async (where: any) => state.locations.find((row) => row.locationId === Number(where.locationId) && row.tenantId === Number(where.tenantId) && (where.isActive === undefined || row.isActive === where.isActive)) ?? null,
      findOne: async ({ where }: any) => state.locations.find((row) => row.locationId === Number(where.locationId) && row.tenantId === Number(where.tenantId) && (where.isActive === undefined || row.isActive === where.isActive)) ?? null,
    };
    if (entity === PosTerminal) return {
      findOneBy: async (where: any) => state.terminals.find((row) => row.tenantId === Number(where.tenantId) && (where.locationId === undefined || row.locationId === Number(where.locationId)) && row.terminalCode === where.terminalCode) ?? null,
      findOne: async ({ where }: any) => {
        const row = state.terminals.find((candidate) => candidate.posTerminalId === Number(where.posTerminalId) && candidate.tenantId === Number(where.tenantId));
        if (!row) return null;
        return { ...row, location: state.locations.find((location) => location.locationId === row.locationId) };
      },
      create: (row: any) => row,
      save: async (row: any) => {
        const saved = { ...row, posTerminalId: row.posTerminalId ?? 100 + state.terminals.length, createdAt: row.createdAt ?? new Date(), updatedAt: row.updatedAt ?? null };
        const index = state.terminals.findIndex((candidate) => candidate.posTerminalId === saved.posTerminalId);
        if (index >= 0) state.terminals[index] = saved; else state.terminals.push(saved);
        return saved;
      },
    };
    if (entity === PosTerminalActivation) return {
      findOne: async ({ where }: any) => state.activations.find((row) => row.activationSecretHash === where.activationSecretHash) ?? null,
      create: (row: any) => row,
      save: async (row: any) => {
        const saved = { ...row, posTerminalActivationId: row.posTerminalActivationId ?? 200 + state.activations.length };
        const index = state.activations.findIndex((candidate) => candidate.posTerminalActivationId === saved.posTerminalActivationId);
        if (index >= 0) state.activations[index] = saved; else state.activations.push(saved);
        return saved;
      },
      update: async () => ({ affected: 0 }),
    };
    if (entity === PosTerminalPairing) return {
      findOne: async ({ where }: any) => {
        const row = state.pairings.find((candidate) => candidate.tenantId === Number(where.tenantId)
          && (where.pairingSecretHash === undefined || candidate.pairingSecretHash === where.pairingSecretHash)
          && (where.posTerminalPairingId === undefined || candidate.posTerminalPairingId === Number(where.posTerminalPairingId))
          && (where.posTerminalId === undefined || candidate.posTerminalId === Number(where.posTerminalId)));
        if (!row) return null;
        const terminal = state.terminals.find((candidate) => candidate.posTerminalId === row.posTerminalId);
        return { ...row, terminal: terminal ? { ...terminal, location: state.locations.find((location) => location.locationId === terminal.locationId) } : undefined };
      },
      create: (row: any) => row,
      save: async (row: any) => {
        if (failPairingSave) throw new Error('simulated pairing persistence failure');
        const saved = { ...row, posTerminalPairingId: row.posTerminalPairingId ?? 300 + state.pairings.length };
        const index = state.pairings.findIndex((candidate) => candidate.posTerminalPairingId === saved.posTerminalPairingId);
        if (index >= 0) state.pairings[index] = saved; else state.pairings.push(saved);
        return saved;
      },
      update: async (where: any, changes: any) => {
        for (const row of state.pairings) {
          if (row.posTerminalId === Number(where.posTerminalId) && row.tenantId === Number(where.tenantId) && !row.revokedAt) Object.assign(row, changes);
        }
        return { affected: 1 };
      },
      countBy: async (where: any) => state.pairings.filter((row) => row.posTerminalId === Number(where.posTerminalId) && !row.revokedAt).length,
    };
    if (entity === PosLocationConfig) return {
      findOne: async ({ where }: any) => state.configs.find((row) => matches(row, where)) ?? null,
      create: (row: any) => row,
      save: async (row: any) => { const saved = { ...row, posLocationConfigId: row.posLocationConfigId ?? state.configs.length + 1 }; const index = state.configs.findIndex((candidate) => candidate.posLocationConfigId === saved.posLocationConfigId); if (index >= 0) state.configs[index] = saved; else state.configs.push(saved); return saved; },
    };
    if (entity === PosCashierSession) return { findOneBy: async (where: any) => state.cashierSessions.find((row) => matches(row, where)) ?? null, findOne: async ({ where }: any) => state.cashierSessions.find((row) => matches(row, where)) ?? null };
    if (entity === PosCashRegister) return { findOneBy: async (where: any) => state.registers.find((row) => matches(row, where)) ?? null };
    if (entity === PosRegisterSession) return { findOneBy: async (where: any) => state.registerSessions.find((row) => matches(row, where)) ?? null, findOne: async ({ where }: any) => state.registerSessions.find((row) => matches(row, where)) ?? null };
    if (entity === PosCashReconciliation) return { findOne: async ({ where }: any) => state.cashReconciliations.find((row) => matches(row, where)) ?? null };
    if (entity === PosMasterReconciliation) return { findOne: async ({ where }: any) => state.masterReconciliations.find((row) => matches(row, where)) ?? null };
    throw new Error(`Unexpected repository: ${(entity as any)?.name}`);
  };
  const manager = { getRepository: repository } as any;
  const dataSource: any = {
    manager,
    getRepository: repository,
    transaction: async (work: any) => {
      const snapshot = structuredClone(state);
      try { return await work(manager); }
      catch (error) {
        state.locations = snapshot.locations;
        state.terminals = snapshot.terminals;
        state.activations = snapshot.activations;
        state.pairings = snapshot.pairings;
        state.registers = snapshot.registers;
        state.registerSessions = snapshot.registerSessions;
        state.cashierSessions = snapshot.cashierSessions;
        state.configs = snapshot.configs;
        state.cashReconciliations = snapshot.cashReconciliations;
        state.masterReconciliations = snapshot.masterReconciliations;
        throw error;
      }
    },
  };
  return {
    state,
    service: new PosRegistersService(dataSource),
    failPairingSave: () => { failPairingSave = true; },
    addActivation: (code: string, changes: any = {}) => state.activations.push({
      posTerminalActivationId: 201,
      tenantId: 1,
      posTerminalId: 31,
      activationSecretHash: sha256(code.replace(/-/g, '').toUpperCase()),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      consumedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      ...changes,
    }),
  };
}

test('terminal administration enforces tenant/location scope and location-specific terminal codes', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.createTerminal({ locationId: 21, terminalCode: 'POS-02', displayName: 'Wrong tenant', isActive: true }, tenantUser()),
    /not found/i,
  );
  await assert.rejects(
    f.service.createTerminal({ locationId: 12, terminalCode: 'POS-02', displayName: 'West', isActive: true }, tenantUser({ accessScope: 'LOCATION', assignedLocationIds: [11] })),
    /access/i,
  );
  await assert.rejects(
    f.service.createTerminal({ locationId: 11, terminalCode: 'pos-01', displayName: 'Duplicate', isActive: true }, tenantUser()),
    /already exists/i,
  );
  const created = await f.service.createTerminal({ locationId: 11, terminalCode: 'pos-02', displayName: 'Second', isActive: false }, tenantUser());
  assert.equal(created.terminalCode, 'POS-02');
  assert.equal(created.isActive, false);
  assert.equal(f.state.terminals.at(-1).tenantId, 1);
  const sameCodeElsewhere = await f.service.createTerminal({ locationId: 12, terminalCode: 'POS-01', displayName: 'West POS', isActive: true }, tenantUser());
  assert.equal(sameCodeElsewhere.locationId, 12);
  await assert.rejects(f.service.createTerminal({ locationId: 12, terminalCode: 'pos-01', displayName: 'West duplicate', isActive: true }, tenantUser()), /already exists at this location/i);
});

test('terminal edits and reassignment enforce destination code uniqueness and pairing safety', async () => {
  const f = fixture();
  f.state.terminals.push({ posTerminalId: 32, tenantId: 1, locationId: 11, terminalCode: 'POS-02', displayName: 'Side', isActive: true });
  f.state.terminals.push({ posTerminalId: 33, tenantId: 1, locationId: 12, terminalCode: 'POS-01', displayName: 'West', isActive: true });
  await assert.rejects(f.service.updateTerminal(32, { terminalCode: 'pos-01', displayName: 'Duplicate' }, tenantUser()), /already exists/i);
  await assert.rejects(f.service.reassignTerminal(31, { locationId: 12 }, tenantUser()), /destination location/i);
  f.state.terminals.find((row) => row.posTerminalId === 33)!.terminalCode = 'OTHER';
  f.state.pairings.push({ posTerminalPairingId: 1, tenantId: 1, posTerminalId: 31, revokedAt: null });
  await assert.rejects(f.service.reassignTerminal(31, { locationId: 12 }, tenantUser()), /revoke the terminal pairing/i);
  f.state.pairings[0].revokedAt = new Date();
  const moved = await f.service.reassignTerminal(31, { locationId: 12 }, tenantUser());
  assert.equal(moved.locationId, 12);
  assert.equal(f.state.terminals.find((row) => row.posTerminalId === 31)?.locationId, 12);
});

test('terminal with closed register history remains at its original location', async () => {
  const f = fixture();
  f.state.registers.push({ posCashRegisterId: 51, tenantId: 1, locationId: 11, posTerminalId: 31 });
  f.state.registerSessions.push({ posRegisterSessionId: 61, posCashRegisterId: 51, tenantId: 1, locationId: 11, status: 'CLOSED' });
  await assert.rejects(f.service.reassignTerminal(31, { locationId: 12 }, tenantUser()), /register history/i);
  assert.equal(f.state.terminals.find((row) => row.posTerminalId === 31)?.locationId, 11);
});

test('register mode switches in both directions after closure and keeps historical registers untouched', async () => {
  const f = fixture();
  f.state.registers.push({ posCashRegisterId: 50, tenantId: 1, locationId: 11, posTerminalId: null, registerMode: PosRegisterMode.MASTER_REGISTER });
  f.state.registerSessions.push({ posRegisterSessionId: 60, posCashRegisterId: 50, tenantId: 1, locationId: 11, status: 'CLOSED' });
  await f.service.configureLocation(11, { registerMode: PosRegisterMode.TERMINAL_REGISTER }, tenantUser());
  assert.equal(f.state.configs[0].registerMode, PosRegisterMode.TERMINAL_REGISTER);
  assert.equal(f.state.registers[0].registerMode, PosRegisterMode.MASTER_REGISTER);
  await f.service.configureLocation(11, { registerMode: PosRegisterMode.MASTER_REGISTER }, tenantUser());
  assert.equal(f.state.configs[0].registerMode, PosRegisterMode.MASTER_REGISTER);
});

test('register mode change reports open, verification, recount, and unresolved-reconciliation blockers', async () => {
  for (const [status, pattern] of [['OPEN', /open register/i], ['PENDING_VERIFICATION', /awaiting verification/i], ['RECOUNT_REQUIRED', /awaiting recount/i]] as const) {
    const f = fixture();
    f.state.registerSessions.push({ posRegisterSessionId: 60, tenantId: 1, locationId: 11, status });
    await assert.rejects(f.service.configureLocation(11, { registerMode: PosRegisterMode.TERMINAL_REGISTER }, tenantUser()), pattern);
  }
  const unresolved = fixture();
  unresolved.state.cashReconciliations.push({ posCashReconciliationId: 70, tenantId: 1, locationId: 11, status: 'PENDING_VERIFICATION' });
  await assert.rejects(unresolved.service.configureLocation(11, { registerMode: PosRegisterMode.TERMINAL_REGISTER }, tenantUser()), /cashier reconciliation/i);
});

test('activation codes reject another tenant, an expired grant, and a reused grant', async () => {
  const code = 'ABCD-EFGH-JKLM';
  const crossTenant = fixture();
  crossTenant.addActivation(code);
  await assert.rejects(crossTenant.service.activateBrowser({ activationCode: code }, tenantUser({ tenantId: 2, userId: 20 })), /invalid/i);

  const expired = fixture();
  expired.addActivation(code, { expiresAt: new Date(Date.now() - 1) });
  await assert.rejects(expired.service.activateBrowser({ activationCode: code }, tenantUser()), /expired/i);

  const reused = fixture();
  reused.addActivation(code, { consumedAt: new Date(), consumedByUserId: 10 });
  await assert.rejects(reused.service.activateBrowser({ activationCode: code }, tenantUser()), /already been used/i);
});

test('activation consumes the one-use code and stores only hashes', async () => {
  const f = fixture();
  const code = 'ABCD-EFGH-JKLM';
  f.addActivation(code);
  const result = await f.service.activateBrowser({ activationCode: code }, tenantUser());
  assert.ok(result.pairingCredential.length >= 40);
  assert.equal(f.state.activations[0].consumedByUserId, 10);
  assert.ok(f.state.activations[0].consumedAt instanceof Date);
  assert.equal(f.state.pairings[0].pairingSecretHash, sha256(result.pairingCredential));
  assert.equal('pairingSecretHash' in result.pairing, false);
  assert.equal('activationSecretHash' in result, false);
  await assert.rejects(f.service.activateBrowser({ activationCode: code }, tenantUser()), /already been used/i);
});

test('activation-code consumption and pairing creation roll back atomically', async () => {
  const f = fixture();
  const code = 'ABCD-EFGH-JKLM';
  f.addActivation(code);
  f.failPairingSave();
  await assert.rejects(f.service.activateBrowser({ activationCode: code }, tenantUser()), /persistence failure/i);
  assert.equal(f.state.activations[0].consumedAt, null);
  assert.equal(f.state.pairings.length, 0);
});

test('a pairing survives cashier sign-out/sign-in but administrative revocation and location access invalidate it', async () => {
  const f = fixture();
  const code = 'ABCD-EFGH-JKLM';
  f.addActivation(code);
  const activated = await f.service.activateBrowser({ activationCode: code }, tenantUser());

  const firstCashier = await f.service.currentPairing(activated.pairingCredential, tenantUser({ userId: 10, username: 'cashier.one' }));
  const nextCashier = await f.service.currentPairing(activated.pairingCredential, tenantUser({ userId: 11, username: 'cashier.two' }));
  assert.equal(firstCashier.paired, true);
  assert.equal(nextCashier.paired, true, 'browser pairing is independent from the cashier session');

  await assert.rejects(
    f.service.currentPairing(activated.pairingCredential, tenantUser({ userId: 11, accessScope: 'LOCATION', assignedLocationIds: [12] })),
    /access/i,
  );
  await f.service.revokePairing(31, activated.pairing.posTerminalPairingId, 'Browser retired.', tenantUser({ roleCode: 'TENANT_ADMIN' }));
  assert.equal(f.state.pairings[0].revocationReason, 'Browser retired.');
  await assert.rejects(f.service.currentPairing(activated.pairingCredential, tenantUser({ userId: 11 })), /revoked/i);
});

test('deactivating a terminal revokes its browser pairing credential', async () => {
  const f = fixture();
  const code = 'ABCD-EFGH-JKLM';
  f.addActivation(code);
  const activated = await f.service.activateBrowser({ activationCode: code }, tenantUser());
  await f.service.setTerminalActive(31, false, tenantUser({ roleCode: 'TENANT_ADMIN' }));
  assert.equal(f.state.terminals.find((terminal) => terminal.posTerminalId === 31)?.isActive, false);
  assert.ok(f.state.pairings[0].revokedAt instanceof Date);
  await assert.rejects(f.service.currentPairing(activated.pairingCredential, tenantUser()), /revoked/i);
});

test('an open register or active cashier prevents terminal deactivation and reassignment', async () => {
  const f = fixture();
  f.state.registers.push({ posCashRegisterId: 51, tenantId: 1, locationId: 11, posTerminalId: 31 });
  f.state.registerSessions.push({ posRegisterSessionId: 61, posCashRegisterId: 51, tenantId: 1, locationId: 11, status: 'OPEN' });
  await assert.rejects(f.service.setTerminalActive(31, false, tenantUser()), /open|active/i);
  await assert.rejects(f.service.reassignTerminal(31, { locationId: 12 }, tenantUser()), /open|active/i);
  assert.equal(f.state.terminals.find((terminal) => terminal.posTerminalId === 31)?.isActive, true);

  f.state.registerSessions.length = 0;
  f.state.cashierSessions.push({ posCashierSessionId: 71, tenantId: 1, posTerminalId: 31, status: 'ACTIVE' });
  await assert.rejects(f.service.setTerminalActive(31, false, tenantUser()), /active cashier/i);
});
