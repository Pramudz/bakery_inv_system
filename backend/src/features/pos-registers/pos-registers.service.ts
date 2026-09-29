import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { ActivatePosTerminalDto } from './dto/activate-pos-terminal.dto';
import { ConfigurePosLocationDto } from './dto/configure-pos-location.dto';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import { ReassignPosTerminalDto } from './dto/reassign-pos-terminal.dto';
import { UpdatePosTerminalDto } from './dto/update-pos-terminal.dto';
import { PosLocationConfig } from './pos-location-config.entity';
import { PosTerminalActivation } from './pos-terminal-activation.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';
import { PosTerminal } from './pos-terminal.entity';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';

const ACTIVATION_MINUTES = 10;
const ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class PosRegistersService {
  constructor(private readonly dataSource: DataSource) {}

  async locationConfigs(user: TenantPrincipal) {
    const locations = await this.dataSource.getRepository(Location).find({
      where: {
        tenantId: user.tenantId,
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      order: { name: 'ASC', locationId: 'ASC' },
    });
    const configs = locations.length ? await this.dataSource.getRepository(PosLocationConfig).findBy({
      tenantId: user.tenantId,
      locationId: In(locations.map((location) => location.locationId)),
    }) : [];
    const byLocation = new Map(configs.map((config) => [Number(config.locationId), config]));
    return locations.map((location) => ({ location, config: byLocation.get(Number(location.locationId)) ?? null }));
  }

  async configureLocation(locationId: number, dto: ConfigurePosLocationDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      await this.location(manager, locationId, user, true);
      const repo = manager.getRepository(PosLocationConfig);
      let config = await repo.findOne({ where: { tenantId: user.tenantId, locationId }, lock: { mode: 'pessimistic_write' } });
      if (config && config.registerMode !== dto.registerMode) await this.assertNoOpenLocationSession(manager, locationId, user.tenantId);
      if (!config) config = repo.create({ tenantId: user.tenantId, locationId, registerMode: dto.registerMode });
      else config.registerMode = dto.registerMode;
      return repo.save(config);
    });
  }

  async terminals(user: TenantPrincipal) {
    const terminals = await this.dataSource.getRepository(PosTerminal).find({
      where: {
        tenantId: user.tenantId,
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      relations: { location: true },
      order: { terminalCode: 'ASC', posTerminalId: 'ASC' },
    });
    const activePairings = terminals.length ? await this.dataSource.getRepository(PosTerminalPairing).findBy({
      tenantId: user.tenantId,
      posTerminalId: In(terminals.map((terminal) => terminal.posTerminalId)),
      revokedAt: IsNull(),
    }) : [];
    const pairingCounts = activePairings.reduce((counts, pairing) => counts.set(Number(pairing.posTerminalId), (counts.get(Number(pairing.posTerminalId)) ?? 0) + 1), new Map<number, number>());
    return terminals.map((terminal) => this.terminalView(terminal, pairingCounts.get(Number(terminal.posTerminalId)) ?? 0));
  }

  async createTerminal(dto: CreatePosTerminalDto, user: TenantPrincipal) {
    await this.location(this.dataSource.manager, dto.locationId, user, true);
    const repo = this.dataSource.getRepository(PosTerminal);
    const terminalCode = dto.terminalCode.trim().toUpperCase();
    if (await repo.findOneBy({ tenantId: user.tenantId, terminalCode })) throw new ConflictException('Terminal code already exists for this tenant.');
    try {
      const terminal = await repo.save(repo.create({
        tenantId: user.tenantId,
        locationId: dto.locationId,
        terminalCode,
        displayName: dto.displayName.trim(),
        isActive: true,
      }));
      return this.getTerminalView(Number(terminal.posTerminalId), user);
    } catch (error) {
      if (this.isDuplicate(error)) throw new ConflictException('Terminal code already exists for this tenant.');
      throw error;
    }
  }

  async updateTerminal(id: number, dto: UpdatePosTerminalDto, user: TenantPrincipal) {
    const terminal = await this.terminal(this.dataSource.manager, id, user);
    terminal.displayName = dto.displayName.trim();
    await this.dataSource.getRepository(PosTerminal).save(terminal);
    return this.getTerminalView(id, user);
  }

  async setTerminalActive(id: number, active: boolean, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const terminal = await this.terminal(manager, id, user, true);
      if (active) {
        await this.location(manager, terminal.locationId, user, true);
        terminal.isActive = true;
      } else {
        await this.assertNoOpenTerminalSession(manager, id, user.tenantId);
        terminal.isActive = false;
        const now = new Date();
        await manager.getRepository(PosTerminalActivation).update({ posTerminalId: id, tenantId: user.tenantId, consumedAt: IsNull(), revokedAt: IsNull() }, { revokedAt: now, revokedByUserId: user.userId });
        await manager.getRepository(PosTerminalPairing).update({ posTerminalId: id, tenantId: user.tenantId, revokedAt: IsNull() }, { revokedAt: now, revokedByUserId: user.userId, revocationReason: 'Terminal deactivated.' });
      }
      await manager.getRepository(PosTerminal).save(terminal);
      return this.terminalView(terminal, 0);
    });
  }

  async reassignTerminal(id: number, dto: ReassignPosTerminalDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const terminal = await this.terminal(manager, id, user, true);
      const destination = await this.location(manager, dto.locationId, user, true);
      if (Number(terminal.locationId) === Number(dto.locationId)) return this.terminalView(terminal, await this.activePairingCount(manager, id));
      await this.assertNoOpenTerminalSession(manager, id, user.tenantId);
      const activePairings = await this.activePairingCount(manager, id);
      if (activePairings) throw new ConflictException('Revoke the terminal pairing before moving the terminal to another location. Reactivation will be required.');
      await manager.getRepository(PosTerminalActivation).update({ posTerminalId: id, tenantId: user.tenantId, consumedAt: IsNull(), revokedAt: IsNull() }, { revokedAt: new Date(), revokedByUserId: user.userId });
      terminal.locationId = dto.locationId;
      terminal.location = destination;
      await manager.getRepository(PosTerminal).save(terminal);
      return this.terminalView(terminal, 0);
    });
  }

  async issueActivation(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const terminal = await this.terminal(manager, id, user, true);
      if (!terminal.isActive) throw new BadRequestException('Only an active terminal can receive an activation code.');
      await this.location(manager, terminal.locationId, user, true);
      const now = new Date();
      await manager.getRepository(PosTerminalActivation).update({ posTerminalId: id, tenantId: user.tenantId, consumedAt: IsNull(), revokedAt: IsNull() }, { revokedAt: now, revokedByUserId: user.userId });
      const plain = this.activationCode();
      const expiresAt = new Date(now.getTime() + ACTIVATION_MINUTES * 60_000);
      const activation = await manager.getRepository(PosTerminalActivation).save(manager.getRepository(PosTerminalActivation).create({
        tenantId: user.tenantId,
        posTerminalId: id,
        activationSecretHash: this.hash(this.normalizeActivationCode(plain)),
        expiresAt,
        consumedAt: null,
        consumedByUserId: null,
        issuedByUserId: user.userId,
        revokedAt: null,
        revokedByUserId: null,
      }));
      return {
        posTerminalActivationId: activation.posTerminalActivationId,
        posTerminalId: id,
        activationCode: plain,
        expiresAt,
      };
    });
  }

  async activateBrowser(dto: ActivatePosTerminalDto, user: TenantPrincipal) {
    const codeHash = this.hash(this.normalizeActivationCode(dto.activationCode));
    return this.dataSource.transaction(async (manager) => {
      const activation = await manager.getRepository(PosTerminalActivation).findOne({
        where: { activationSecretHash: codeHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!activation || Number(activation.tenantId) !== Number(user.tenantId)) throw new BadRequestException('Activation code is invalid.');
      if (activation.revokedAt) throw new BadRequestException('Activation code has been revoked.');
      if (activation.consumedAt) throw new BadRequestException('Activation code has already been used.');
      if (activation.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Activation code has expired.');
      const terminal = await this.terminal(manager, Number(activation.posTerminalId), user, true);
      if (!terminal.isActive) throw new BadRequestException('Terminal is inactive.');
      const location = await this.location(manager, terminal.locationId, user, true);
      const now = new Date();
      const pairingCredential = randomBytes(32).toString('base64url');
      await manager.getRepository(PosTerminalPairing).update({ posTerminalId: terminal.posTerminalId, tenantId: user.tenantId, revokedAt: IsNull() }, {
        revokedAt: now,
        revokedByUserId: user.userId,
        revocationReason: 'Replaced by a new browser activation.',
      });
      const pairing = await manager.getRepository(PosTerminalPairing).save(manager.getRepository(PosTerminalPairing).create({
        tenantId: user.tenantId,
        posTerminalId: terminal.posTerminalId,
        pairingSecretHash: this.hash(pairingCredential),
        pairedAt: now,
        pairedByUserId: user.userId,
        lastSeenAt: now,
        revokedAt: null,
        revokedByUserId: null,
        revocationReason: null,
      }));
      activation.consumedAt = now;
      activation.consumedByUserId = user.userId;
      await manager.getRepository(PosTerminalActivation).save(activation);
      return {
        pairingCredential,
        pairing: this.pairingView(pairing),
        terminal: this.terminalView({ ...terminal, location } as PosTerminal, 1),
      };
    });
  }

  async currentPairing(credential: string | undefined, user: TenantPrincipal) {
    if (!credential?.trim()) return { paired: false };
    const repo = this.dataSource.getRepository(PosTerminalPairing);
    const pairing = await repo.findOne({
      where: { tenantId: user.tenantId, pairingSecretHash: this.hash(credential.trim()) },
      relations: { terminal: { location: true } },
    });
    if (!pairing || pairing.revokedAt || !pairing.terminal?.isActive || !pairing.terminal.location?.isActive) {
      throw new ForbiddenException('Terminal pairing is invalid or has been revoked.');
    }
    this.assertLocationAccess(pairing.terminal.locationId, user);
    pairing.lastSeenAt = new Date();
    await repo.save(pairing);
    return { paired: true, pairing: this.pairingView(pairing), terminal: this.terminalView(pairing.terminal, 1) };
  }

  async pairings(terminalId: number, user: TenantPrincipal) {
    await this.terminal(this.dataSource.manager, terminalId, user);
    const rows = await this.dataSource.getRepository(PosTerminalPairing).find({
      where: { tenantId: user.tenantId, posTerminalId: terminalId },
      relations: { pairedByUser: true, revokedByUser: true },
      order: { posTerminalPairingId: 'DESC' },
    });
    return rows.map((pairing) => this.pairingView(pairing));
  }

  async revokePairing(terminalId: number, pairingId: number, reason: string | undefined, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      await this.terminal(manager, terminalId, user, true);
      const pairing = await manager.getRepository(PosTerminalPairing).findOne({
        where: { posTerminalPairingId: pairingId, posTerminalId: terminalId, tenantId: user.tenantId },
        relations: { pairedByUser: true, revokedByUser: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pairing) throw new NotFoundException('Terminal pairing not found.');
      if (!pairing.revokedAt) {
        pairing.revokedAt = new Date();
        pairing.revokedByUserId = user.userId;
        pairing.revocationReason = reason?.trim() || 'Revoked by administrator.';
        await manager.getRepository(PosTerminalPairing).save(pairing);
      }
      return this.pairingView(pairing);
    });
  }

  private async getTerminalView(id: number, user: TenantPrincipal) {
    const terminal = await this.terminal(this.dataSource.manager, id, user);
    return this.terminalView(terminal, await this.activePairingCount(this.dataSource.manager, id));
  }

  private async terminal(manager: EntityManager, id: number, user: TenantPrincipal, lock = false) {
    const terminal = await manager.getRepository(PosTerminal).findOne({
      where: { posTerminalId: id, tenantId: user.tenantId },
      relations: { location: true },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!terminal) throw new NotFoundException('POS terminal not found.');
    this.assertLocationAccess(terminal.locationId, user);
    return terminal;
  }

  private async location(manager: EntityManager, id: number, user: TenantPrincipal, activeRequired: boolean) {
    this.assertLocationAccess(id, user);
    const location = await manager.getRepository(Location).findOneBy({
      locationId: id,
      tenantId: user.tenantId,
      ...(activeRequired ? { isActive: true } : {}),
    });
    if (!location) throw new NotFoundException(activeRequired ? 'Active location not found.' : 'Location not found.');
    return location;
  }

  private assertLocationAccess(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) {
      throw new ForbiddenException('You do not have access to this location.');
    }
  }

  private activePairingCount(manager: EntityManager, terminalId: number) {
    return manager.getRepository(PosTerminalPairing).countBy({ posTerminalId: terminalId, revokedAt: IsNull() });
  }

  private terminalView(terminal: PosTerminal, activePairingCount: number) {
    return {
      posTerminalId: terminal.posTerminalId,
      locationId: terminal.locationId,
      terminalCode: terminal.terminalCode,
      displayName: terminal.displayName,
      isActive: terminal.isActive,
      createdAt: terminal.createdAt,
      updatedAt: terminal.updatedAt,
      location: terminal.location ? { locationId: terminal.location.locationId, code: terminal.location.code, name: terminal.location.name, isActive: terminal.location.isActive } : undefined,
      activePairingCount,
    };
  }

  private pairingView(pairing: PosTerminalPairing) {
    return {
      posTerminalPairingId: pairing.posTerminalPairingId,
      posTerminalId: pairing.posTerminalId,
      pairedAt: pairing.pairedAt,
      pairedByUserId: pairing.pairedByUserId,
      pairedByUsername: pairing.pairedByUser?.username,
      lastSeenAt: pairing.lastSeenAt,
      revokedAt: pairing.revokedAt,
      revokedByUserId: pairing.revokedByUserId,
      revokedByUsername: pairing.revokedByUser?.username,
      revocationReason: pairing.revocationReason,
    };
  }

  private activationCode() {
    const bytes = randomBytes(12);
    const raw = Array.from(bytes, (byte) => ACTIVATION_ALPHABET[byte % ACTIVATION_ALPHABET.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  }

  private normalizeActivationCode(value: string) {
    return value.replace(/-/g, '').trim().toUpperCase();
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private isDuplicate(error: unknown) {
    const candidate = error as { code?: string; driverError?: { code?: string } };
    return (candidate.driverError?.code ?? candidate.code) === 'ER_DUP_ENTRY';
  }

  private async assertNoOpenLocationSession(manager: EntityManager, locationId: number, tenantId: number) {
    const open = await manager.getRepository(PosRegisterSession).findOneBy({ tenantId, locationId, status: In([PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.PENDING_VERIFICATION, PosRegisterSessionStatus.RECOUNT_REQUIRED]) });
    if (open) throw new ConflictException('Register mode cannot change while this location has an open register session.');
  }

  private async assertNoOpenTerminalSession(manager: EntityManager, terminalId: number, tenantId: number) {
    const cashier = await manager.getRepository(PosCashierSession).findOneBy({ tenantId, posTerminalId: terminalId, status: In([PosCashierSessionStatus.ACTIVE, PosCashierSessionStatus.PENDING_VERIFICATION, PosCashierSessionStatus.RECOUNT_REQUIRED]) });
    if (cashier) throw new ConflictException('This terminal has an active cashier session and cannot be deactivated or moved.');
    const register = await manager.getRepository(PosCashRegister).findOneBy({ tenantId, posTerminalId: terminalId });
    if (register && await manager.getRepository(PosRegisterSession).findOneBy({ tenantId, posCashRegisterId: register.posCashRegisterId, status: In([PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.PENDING_VERIFICATION, PosRegisterSessionStatus.RECOUNT_REQUIRED]) })) {
      throw new ConflictException('This terminal register is open and cannot be deactivated or moved.');
    }
  }
}
