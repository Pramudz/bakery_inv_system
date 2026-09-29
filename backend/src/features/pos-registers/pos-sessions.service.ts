import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { OpenMasterRegisterDto, OpenTerminalRegisterDto } from './dto/open-register.dto';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosLocationConfig, PosRegisterMode } from './pos-location-config.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';
import { PosTerminal } from './pos-terminal.entity';

export type ActivePosSession = {
  terminal: PosTerminal;
  pairing: PosTerminalPairing;
  config: PosLocationConfig;
  register: PosCashRegister;
  registerSession: PosRegisterSession;
  cashierSession: PosCashierSession;
};

@Injectable()
export class PosSessionsService {
  constructor(private readonly dataSource: DataSource) {}

  async context(locationId: number, credential: string | undefined, user: TenantPrincipal) {
    const location = await this.location(this.dataSource.manager, locationId, user, false);
    const config = await this.dataSource.getRepository(PosLocationConfig).findOneBy({ tenantId: user.tenantId, locationId });
    let pairing: PosTerminalPairing | null = null;
    let terminal: PosTerminal | null = null;
    let pairingIssue: string | null = null;
    if (credential?.trim()) {
      try {
        const resolved = await this.pairing(this.dataSource.manager, credential, user, false);
        pairing = resolved.pairing;
        terminal = resolved.terminal;
      } catch (error) {
        pairingIssue = error instanceof Error ? error.message : 'Terminal pairing is invalid.';
      }
    }

    let register: PosCashRegister | null = null;
    let registerSession: PosRegisterSession | null = null;
    let cashierSession: PosCashierSession | null = null;
    if (config?.registerMode === PosRegisterMode.MASTER_REGISTER) {
      register = await this.dataSource.getRepository(PosCashRegister).findOneBy({ tenantId: user.tenantId, registerKey: this.masterKey(locationId), isActive: true });
    } else if (config?.registerMode === PosRegisterMode.TERMINAL_REGISTER && terminal && Number(terminal.locationId) === Number(locationId)) {
      register = await this.dataSource.getRepository(PosCashRegister).findOneBy({ tenantId: user.tenantId, registerKey: this.terminalKey(terminal.posTerminalId), isActive: true });
    }
    if (register) {
      registerSession = await this.dataSource.getRepository(PosRegisterSession).findOneBy({ tenantId: user.tenantId, posCashRegisterId: register.posCashRegisterId, status: In(this.ongoingRegisterStatuses()) });
    }
    if (registerSession && terminal) {
      cashierSession = await this.dataSource.getRepository(PosCashierSession).findOneBy({
        tenantId: user.tenantId,
        posRegisterSessionId: registerSession.posRegisterSessionId,
        cashierUserId: user.userId,
        posTerminalId: terminal.posTerminalId,
        status: In(this.ongoingCashierStatuses()),
      });
    }

    let action: 'CONFIGURE_LOCATION' | 'PAIR_TERMINAL' | 'OPEN_TERMINAL_REGISTER' | 'OPEN_MASTER_REGISTER' | 'START_CASHIER_SESSION' | 'RECOUNT_CASH' | null = null;
    let blockedReason: string | null = null;
    if (!config) {
      action = 'CONFIGURE_LOCATION';
      blockedReason = 'This location has no POS register mode configuration.';
    } else if (terminal && Number(terminal.locationId) !== Number(locationId)) {
      blockedReason = `This browser is paired to ${terminal.location?.name ?? 'another location'}, not ${location.name}.`;
    } else if (pairingIssue) {
      action = 'PAIR_TERMINAL';
      blockedReason = pairingIssue;
    } else if (config.registerMode === PosRegisterMode.TERMINAL_REGISTER && !terminal) {
      action = 'PAIR_TERMINAL';
      blockedReason = 'Pair this browser to an active terminal before opening its register.';
    } else if (config.registerMode === PosRegisterMode.TERMINAL_REGISTER && !registerSession) {
      action = 'OPEN_TERMINAL_REGISTER';
      blockedReason = 'Open this terminal register before billing.';
    } else if (config.registerMode === PosRegisterMode.MASTER_REGISTER && !registerSession) {
      action = 'OPEN_MASTER_REGISTER';
      blockedReason = 'An authorized manager must open the location master register.';
    } else if (!terminal) {
      action = 'PAIR_TERMINAL';
      blockedReason = 'Pair this billing browser to a terminal at this location.';
    } else if (cashierSession?.status === PosCashierSessionStatus.PENDING_VERIFICATION) {
      blockedReason = 'Cash count submitted. Billing remains blocked until an independent verifier approves it or requests a recount.';
    } else if (cashierSession?.status === PosCashierSessionStatus.RECOUNT_REQUIRED) {
      action = 'RECOUNT_CASH';
      blockedReason = 'The verifier rejected the prior count. Submit an audited recount before billing can continue.';
    } else if (!cashierSession) {
      action = config.registerMode === PosRegisterMode.MASTER_REGISTER ? 'START_CASHIER_SESSION' : 'OPEN_TERMINAL_REGISTER';
      blockedReason = config.registerMode === PosRegisterMode.MASTER_REGISTER
        ? 'Start your cashier session on the open master register.'
        : 'The open terminal register belongs to another active cashier session.';
    }

    return {
      location: this.locationView(location),
      config: config ? { posLocationConfigId: config.posLocationConfigId, registerMode: config.registerMode } : null,
      pairingValid: Boolean(pairing && terminal && Number(terminal.locationId) === Number(locationId)),
      terminal: terminal ? this.terminalView(terminal) : null,
      register: register ? this.registerView(register) : null,
      registerSession: registerSession ? this.registerSessionView(registerSession) : null,
      cashierSession: cashierSession ? this.cashierSessionView(cashierSession) : null,
      canBill: Boolean(config && pairing && terminal && cashierSession?.status === PosCashierSessionStatus.ACTIVE && registerSession?.status === PosRegisterSessionStatus.OPEN),
      action,
      blockedReason,
    };
  }

  async openTerminal(dto: OpenTerminalRegisterDto, credential: string | undefined, user: TenantPrincipal) {
    this.assertOpeningBalance(dto.openingBalance);
    return this.dataSource.transaction(async (manager) => {
      const { pairing, terminal } = await this.pairing(manager, credential, user, true);
      const config = await this.config(manager, terminal.locationId, user, true);
      if (config.registerMode !== PosRegisterMode.TERMINAL_REGISTER) throw new BadRequestException('This location uses a master register. Start a cashier session after the master register is opened.');
      const register = await this.findOrCreateRegister(manager, config, terminal, user);
      let registerSession = await this.openRegisterSession(manager, register, true);
      const active = await this.activeConflict(manager, user, terminal.posTerminalId);
      if (registerSession) {
        if (registerSession.status === PosRegisterSessionStatus.OPEN && active?.status === PosCashierSessionStatus.ACTIVE && Number(active.cashierUserId) === Number(user.userId) && Number(active.posTerminalId) === Number(terminal.posTerminalId) && Number(active.posRegisterSessionId) === Number(registerSession.posRegisterSessionId)) {
          return this.sessionResult(register, registerSession, active, terminal, true);
        }
        if (registerSession.status !== PosRegisterSessionStatus.OPEN) throw new ConflictException('This terminal register is awaiting verification or recount and cannot be reopened.');
        throw new ConflictException('This terminal register is already open for another cashier session.');
      }
      if (active) throw new ConflictException(this.conflictMessage(active, user, terminal.posTerminalId));
      const clock = await tenantBusinessClock(manager, user.tenantId);
      registerSession = await manager.getRepository(PosRegisterSession).save(manager.getRepository(PosRegisterSession).create({
        posCashRegisterId: register.posCashRegisterId,
        tenantId: user.tenantId,
        locationId: terminal.locationId,
        businessDate: clock.businessDate,
        openingBalance: dto.openingBalance.toFixed(2),
        openedByUserId: user.userId,
        openedAt: clock.now,
        status: PosRegisterSessionStatus.OPEN,
      }));
      const cashier = await this.createCashierSession(manager, registerSession, terminal, user, clock.now);
      pairing.lastSeenAt = clock.now;
      await manager.getRepository(PosTerminalPairing).save(pairing);
      return this.sessionResult(register, registerSession, cashier, terminal, false);
    });
  }

  async openMaster(dto: OpenMasterRegisterDto, user: TenantPrincipal) {
    this.assertOpeningBalance(dto.openingBalance);
    return this.dataSource.transaction(async (manager) => {
      const config = await this.config(manager, dto.locationId, user, true);
      if (config.registerMode !== PosRegisterMode.MASTER_REGISTER) throw new BadRequestException('This location does not use a master register.');
      const register = await this.findOrCreateRegister(manager, config, null, user);
      const existing = await this.openRegisterSession(manager, register, true);
      if (existing) {
        if (existing.status !== PosRegisterSessionStatus.OPEN) throw new ConflictException('This master register is awaiting completion and cannot be reopened.');
        return { register: this.registerView(register), registerSession: this.registerSessionView(existing), cashierSession: null, terminal: null, resumed: true };
      }
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const registerSession = await manager.getRepository(PosRegisterSession).save(manager.getRepository(PosRegisterSession).create({
        posCashRegisterId: register.posCashRegisterId,
        tenantId: user.tenantId,
        locationId: dto.locationId,
        businessDate: clock.businessDate,
        openingBalance: dto.openingBalance.toFixed(2),
        openedByUserId: user.userId,
        openedAt: clock.now,
        status: PosRegisterSessionStatus.OPEN,
      }));
      return { register: this.registerView(register), registerSession: this.registerSessionView(registerSession), cashierSession: null, terminal: null, resumed: false };
    });
  }

  async startCashier(credential: string | undefined, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const { pairing, terminal } = await this.pairing(manager, credential, user, true);
      const config = await this.config(manager, terminal.locationId, user, true);
      if (config.registerMode !== PosRegisterMode.MASTER_REGISTER) throw new BadRequestException('This location uses a terminal register. Open the terminal register instead.');
      const register = await manager.getRepository(PosCashRegister).findOne({ where: { tenantId: user.tenantId, registerKey: this.masterKey(terminal.locationId), isActive: true }, lock: { mode: 'pessimistic_write' } });
      if (!register) throw new BadRequestException('The master register is not open.');
      const registerSession = await this.openRegisterSession(manager, register, true);
      if (!registerSession) throw new BadRequestException('The master register is not open.');
      const active = await this.activeConflict(manager, user, terminal.posTerminalId);
      if (active) {
        if (Number(active.cashierUserId) === Number(user.userId) && Number(active.posTerminalId) === Number(terminal.posTerminalId) && Number(active.posRegisterSessionId) === Number(registerSession.posRegisterSessionId)) {
          return this.sessionResult(register, registerSession, active, terminal, true);
        }
        throw new ConflictException(this.conflictMessage(active, user, terminal.posTerminalId));
      }
      const now = new Date();
      const cashier = await this.createCashierSession(manager, registerSession, terminal, user, now);
      pairing.lastSeenAt = now;
      await manager.getRepository(PosTerminalPairing).save(pairing);
      return this.sessionResult(register, registerSession, cashier, terminal, false);
    });
  }

  async requireCashierSession(manager: EntityManager, credential: string | undefined, user: TenantPrincipal, locationId: number, lock = true): Promise<ActivePosSession> {
    const { pairing, terminal } = await this.pairing(manager, credential, user, lock);
    if (Number(terminal.locationId) !== Number(locationId)) throw new ForbiddenException('The paired terminal belongs to a different location.');
    const config = await this.config(manager, locationId, user, lock);
    const cashierSession = await manager.getRepository(PosCashierSession).findOne({
      where: { tenantId: user.tenantId, locationId, cashierUserId: user.userId, posTerminalId: terminal.posTerminalId, status: PosCashierSessionStatus.ACTIVE },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!cashierSession) throw new ForbiddenException('An active cashier session for this user and paired terminal is required.');
    const registerSession = await manager.getRepository(PosRegisterSession).findOne({
      where: { posRegisterSessionId: cashierSession.posRegisterSessionId, tenantId: user.tenantId, locationId, status: PosRegisterSessionStatus.OPEN },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!registerSession) throw new ForbiddenException('The linked register session is not open.');
    const register = await manager.getRepository(PosCashRegister).findOne({
      where: { posCashRegisterId: registerSession.posCashRegisterId, tenantId: user.tenantId, locationId, isActive: true },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!register) throw new ForbiddenException('The linked cash register is inactive or unavailable.');
    const expectedTerminal = config.registerMode === PosRegisterMode.TERMINAL_REGISTER ? Number(terminal.posTerminalId) : null;
    if (register.registerMode !== config.registerMode || Number(register.posTerminalId ?? 0) !== Number(expectedTerminal ?? 0)) {
      throw new ForbiddenException('The cashier session does not match the configured register mode.');
    }
    return { terminal, pairing, config, register, registerSession, cashierSession };
  }

  async requireTerminalClosingSession(manager: EntityManager, credential: string | undefined, user: TenantPrincipal): Promise<ActivePosSession> {
    const { pairing, terminal } = await this.pairing(manager, credential, user, true);
    const config = await this.config(manager, terminal.locationId, user, true);
    if (config.registerMode !== PosRegisterMode.TERMINAL_REGISTER) throw new BadRequestException('Cashier sign-off in this step is available only for terminal-register locations.');
    const cashierSession = await manager.getRepository(PosCashierSession).findOne({
      where: {
        tenantId: user.tenantId,
        locationId: terminal.locationId,
        cashierUserId: user.userId,
        posTerminalId: terminal.posTerminalId,
        status: In([PosCashierSessionStatus.ACTIVE, PosCashierSessionStatus.RECOUNT_REQUIRED]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cashierSession) throw new ForbiddenException('An active cashier session or requested recount for this user and paired terminal is required.');
    const registerSession = await manager.getRepository(PosRegisterSession).findOne({
      where: {
        posRegisterSessionId: cashierSession.posRegisterSessionId,
        tenantId: user.tenantId,
        locationId: terminal.locationId,
        status: In([PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.RECOUNT_REQUIRED]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!registerSession) throw new ConflictException('The register session is not available for cash count submission.');
    const register = await manager.getRepository(PosCashRegister).findOne({
      where: { posCashRegisterId: registerSession.posCashRegisterId, tenantId: user.tenantId, locationId: terminal.locationId, isActive: true, registerMode: PosRegisterMode.TERMINAL_REGISTER, posTerminalId: terminal.posTerminalId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!register) throw new ForbiddenException('The linked terminal register is inactive or unavailable.');
    return { terminal, pairing, config, register, registerSession, cashierSession };
  }

  private async pairing(manager: EntityManager, credential: string | undefined, user: TenantPrincipal, lock: boolean) {
    if (!credential?.trim()) throw new ForbiddenException('This browser is not paired to a POS terminal.');
    const pairing = await manager.getRepository(PosTerminalPairing).findOne({
      where: { tenantId: user.tenantId, pairingSecretHash: this.hash(credential.trim()) },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!pairing || pairing.revokedAt) throw new ForbiddenException('Terminal pairing is invalid or has been revoked.');
    const terminal = await manager.getRepository(PosTerminal).findOne({
      where: { posTerminalId: pairing.posTerminalId, tenantId: user.tenantId, isActive: true },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!terminal) throw new ForbiddenException('The paired terminal or its location is inactive.');
    const location = await this.location(manager, terminal.locationId, user, true);
    terminal.location = location;
    return { pairing, terminal };
  }

  private async config(manager: EntityManager, locationId: number, user: TenantPrincipal, lock: boolean) {
    await this.location(manager, locationId, user, true);
    const config = await manager.getRepository(PosLocationConfig).findOne({
      where: { tenantId: user.tenantId, locationId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!config) throw new BadRequestException('This location has no POS register mode configuration.');
    return config;
  }

  private async location(manager: EntityManager, locationId: number, user: TenantPrincipal, activeRequired: boolean) {
    this.assertLocationAccess(locationId, user);
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, ...(activeRequired ? { isActive: true } : {}) });
    if (!location) throw new NotFoundException(activeRequired ? 'Active location not found.' : 'Location not found.');
    return location;
  }

  private async findOrCreateRegister(manager: EntityManager, config: PosLocationConfig, terminal: PosTerminal | null, user: TenantPrincipal) {
    const registerKey = terminal ? this.terminalKey(terminal.posTerminalId) : this.masterKey(config.locationId);
    const repo = manager.getRepository(PosCashRegister);
    let register = await repo.findOne({ where: { tenantId: user.tenantId, registerKey }, lock: { mode: 'pessimistic_write' } });
    if (!register) {
      register = await repo.save(repo.create({
        tenantId: user.tenantId,
        locationId: config.locationId,
        posTerminalId: terminal?.posTerminalId ?? null,
        registerMode: config.registerMode,
        registerKey,
        displayName: terminal ? terminal.displayName : 'Master Register',
        isActive: true,
      }));
    }
    if (!register.isActive || register.registerMode !== config.registerMode || Number(register.locationId) !== Number(config.locationId) || Number(register.posTerminalId ?? 0) !== Number(terminal?.posTerminalId ?? 0)) {
      throw new ConflictException('The existing cash register does not match the current location configuration.');
    }
    return register;
  }

  private openRegisterSession(manager: EntityManager, register: PosCashRegister, lock: boolean) {
    return manager.getRepository(PosRegisterSession).findOne({
      where: { tenantId: register.tenantId, posCashRegisterId: register.posCashRegisterId, status: In(this.ongoingRegisterStatuses()) },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  }

  private activeConflict(manager: EntityManager, user: TenantPrincipal, terminalId: number) {
    return manager.getRepository(PosCashierSession).findOne({
      where: [
        { tenantId: user.tenantId, cashierUserId: user.userId, status: In(this.ongoingCashierStatuses()) },
        { tenantId: user.tenantId, posTerminalId: terminalId, status: In(this.ongoingCashierStatuses()) },
      ],
      lock: { mode: 'pessimistic_write' },
    });
  }

  private createCashierSession(manager: EntityManager, registerSession: PosRegisterSession, terminal: PosTerminal, user: TenantPrincipal, now: Date) {
    const repo = manager.getRepository(PosCashierSession);
    return repo.save(repo.create({
      posRegisterSessionId: registerSession.posRegisterSessionId,
      tenantId: user.tenantId,
      locationId: terminal.locationId,
      cashierUserId: user.userId,
      posTerminalId: terminal.posTerminalId,
      startedAt: now,
      endedAt: null,
      endedByUserId: null,
      status: PosCashierSessionStatus.ACTIVE,
    }));
  }

  private conflictMessage(active: PosCashierSession, user: TenantPrincipal, terminalId: number) {
    if (Number(active.cashierUserId) === Number(user.userId)) return 'This cashier already has an active session on another terminal or register.';
    if (Number(active.posTerminalId) === Number(terminalId)) return 'This terminal is already assigned to another active cashier session.';
    return 'A conflicting cashier session is already active.';
  }

  private sessionResult(register: PosCashRegister, registerSession: PosRegisterSession, cashierSession: PosCashierSession, terminal: PosTerminal, resumed: boolean) {
    return { register: this.registerView(register), registerSession: this.registerSessionView(registerSession), cashierSession: this.cashierSessionView(cashierSession), terminal: this.terminalView(terminal), resumed };
  }

  private registerView(register: PosCashRegister) {
    return { posCashRegisterId: register.posCashRegisterId, locationId: register.locationId, posTerminalId: register.posTerminalId, registerMode: register.registerMode, displayName: register.displayName, isActive: register.isActive };
  }
  private registerSessionView(session: PosRegisterSession) {
    return { posRegisterSessionId: session.posRegisterSessionId, posCashRegisterId: session.posCashRegisterId, businessDate: session.businessDate, openingBalance: session.openingBalance, openedByUserId: session.openedByUserId, openedAt: session.openedAt, status: session.status };
  }
  private cashierSessionView(session: PosCashierSession) {
    return { posCashierSessionId: session.posCashierSessionId, posRegisterSessionId: session.posRegisterSessionId, cashierUserId: session.cashierUserId, posTerminalId: session.posTerminalId, startedAt: session.startedAt, status: session.status };
  }

  private ongoingRegisterStatuses() {
    return [PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.PENDING_VERIFICATION, PosRegisterSessionStatus.RECOUNT_REQUIRED];
  }

  private ongoingCashierStatuses() {
    return [PosCashierSessionStatus.ACTIVE, PosCashierSessionStatus.PENDING_VERIFICATION, PosCashierSessionStatus.RECOUNT_REQUIRED];
  }
  private terminalView(terminal: PosTerminal) {
    return { posTerminalId: terminal.posTerminalId, locationId: terminal.locationId, terminalCode: terminal.terminalCode, displayName: terminal.displayName, isActive: terminal.isActive, location: terminal.location ? this.locationView(terminal.location) : undefined };
  }
  private locationView(location: Location) { return { locationId: location.locationId, code: location.code, name: location.name, isActive: location.isActive }; }
  private masterKey(locationId: number) { return `MASTER:${locationId}`; }
  private terminalKey(terminalId: number) { return `TERMINAL:${terminalId}`; }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private assertOpeningBalance(value: number) {
    if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) / 100 !== value) throw new BadRequestException('Opening balance must be nonnegative with at most two decimal places.');
  }
  private assertLocationAccess(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) throw new ForbiddenException('You do not have access to this location.');
  }
}
