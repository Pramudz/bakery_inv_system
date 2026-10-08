import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Brackets, DataSource, EntityManager, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { PosTerminal } from '../pos-registers/pos-terminal.entity';
import { PosPrintJob } from './pos-print-job.entity';
import { PosPrintProfile } from './pos-print-profile.entity';
import { Invoice } from '../invoices/invoice.entity';
import { InvoiceRefund } from '../invoice-refunds/invoice-refund.entity';
import { Tenant } from '../tenants/tenant.entity';

type ProfileInput = { locationId: number; posTerminalId?: number | null; displayName: string; transport: 'TCP' | 'WINDOWS_QUEUE'; target: string; port?: number | null; paperWidth: 58 | 80; encoding: 'CP437' | 'CP850' | 'UTF8'; cutEnabled: boolean; isActive: boolean };

@Injectable()
export class PosPrintService {
  constructor(private readonly dataSource: DataSource) {}

  private assertLocation(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) throw new ForbiddenException('You do not have access to this location.');
  }

  private publicProfile(profile: PosPrintProfile) {
    const { agentTokenHash: _secret, ...publicFields } = profile;
    return publicFields;
  }

  async profiles(locationId: number, user: TenantPrincipal) {
    this.assertLocation(locationId, user);
    return (await this.dataSource.getRepository(PosPrintProfile).find({ where: { tenantId: user.tenantId, locationId }, order: { posPrintProfileId: 'ASC' } })).map((row) => this.publicProfile(row));
  }

  async receiptReadiness(locationId: number, user: TenantPrincipal) {
    this.assertLocation(locationId, user);
    const location = await this.dataSource.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId });
    if (!location) throw new NotFoundException('Location not found.');
    const tenant = await this.dataSource.getRepository(Tenant).findOneBy({ tenantId: user.tenantId });
    const address = [location.addressLine1, location.addressLine2, location.city, location.stateProvince, location.postalCode]
      .map((part) => part?.trim()).filter(Boolean);
    return { companyName: tenant?.name ?? '', locationName: location.name, address, warnings: address.length ? [] : ['Location address is missing. Complete it before issuing customer receipts.'] };
  }

  async configure(input: ProfileInput, user: TenantPrincipal) {
    if (!Number.isSafeInteger(input.locationId) || input.locationId < 1 || (input.posTerminalId != null && (!Number.isSafeInteger(input.posTerminalId) || input.posTerminalId < 1))) throw new BadRequestException('A valid location and optional terminal are required.');
    this.assertLocation(input.locationId, user);
    const location = await this.dataSource.getRepository(Location).findOneBy({ tenantId: user.tenantId, locationId: input.locationId });
    if (!location) throw new NotFoundException('Location not found.');
    if (input.posTerminalId != null && !(await this.dataSource.getRepository(PosTerminal).findOneBy({ tenantId: user.tenantId, locationId: input.locationId, posTerminalId: input.posTerminalId }))) throw new BadRequestException('Printer terminal belongs to another location.');
    if (![58, 80].includes(input.paperWidth) || !['CP437', 'CP850', 'UTF8'].includes(input.encoding) || typeof input.cutEnabled !== 'boolean' || typeof input.isActive !== 'boolean' || !input.displayName?.trim()) throw new BadRequestException('Printer width, encoding, cut option, active status and display name are required.');
    const target = input.target?.trim() ?? '';
    if (input.transport === 'TCP') {
      const octets = target.split('.').map(Number);
      const privateAddress = octets.length === 4 && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
      if (!privateAddress || !Number.isInteger(input.port) || Number(input.port) < 1 || Number(input.port) > 65535) throw new BadRequestException('TCP printers require a private IPv4 address and valid port.');
    } else if (input.transport === 'WINDOWS_QUEUE') {
      if (!/^[A-Za-z0-9 _.-]{1,255}$/.test(target)) throw new BadRequestException('Select a valid local Windows printer queue name.');
    } else throw new BadRequestException('Unsupported printer transport.');
    const scopeKey = input.posTerminalId == null ? 'LOCATION' : String(input.posTerminalId);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PosPrintProfile);
      let profile = await repo.findOne({ where: { tenantId: user.tenantId, locationId: input.locationId, scopeKey }, lock: { mode: 'pessimistic_write' } });
      const agentToken = profile ? null : randomBytes(32).toString('hex');
      if (!profile) profile = repo.create({ tenantId: user.tenantId, locationId: input.locationId, posTerminalId: input.posTerminalId ?? null, scopeKey, agentTokenHash: createHash('sha256').update(agentToken!).digest('hex') });
      Object.assign(profile, { displayName: input.displayName.trim(), transport: input.transport, target, port: input.transport === 'TCP' ? input.port! : null, paperWidth: input.paperWidth, encoding: input.encoding, cutEnabled: input.cutEnabled, isActive: input.isActive });
      const saved = await repo.save(profile);
      return { profile: this.publicProfile(saved), agentToken };
    });
  }

  async rotateToken(id: number, user: TenantPrincipal) {
    const profile = await this.authorizedProfile(id, user);
    const agentToken = randomBytes(32).toString('hex');
    profile.agentTokenHash = createHash('sha256').update(agentToken).digest('hex');
    await this.dataSource.getRepository(PosPrintProfile).save(profile);
    return { profile: this.publicProfile(profile), agentToken };
  }

  async enqueue(manager: EntityManager, documentType: 'SALE' | 'REFUND', sourceId: number, tenantId: number, locationId: number, terminalId: number | null, receiptSnapshot: Record<string, any>) {
    const repo = manager.getRepository(PosPrintProfile);
    const profile = (terminalId ? await repo.findOneBy({ tenantId, locationId, scopeKey: String(terminalId), isActive: true }) : null)
      ?? await repo.findOneBy({ tenantId, locationId, scopeKey: 'LOCATION', isActive: true });
    if (!profile) return null;
    return manager.getRepository(PosPrintJob).save(manager.getRepository(PosPrintJob).create({
      tenantId, locationId, posTerminalId: terminalId, posPrintProfileId: profile.posPrintProfileId,
      documentType, sourceId, receiptSnapshot, status: 'PENDING', attempts: 0, leaseUntil: null, lastError: null,
    }));
  }

  async test(id: number, user: TenantPrincipal) {
    const profile = await this.authorizedProfile(id, user);
    return this.dataSource.getRepository(PosPrintJob).save(this.dataSource.getRepository(PosPrintJob).create({
      tenantId: user.tenantId, locationId: profile.locationId, posTerminalId: profile.posTerminalId, posPrintProfileId: id,
      documentType: 'TEST', sourceId: null, receiptSnapshot: { documentType: 'TEST', header: { companyName: 'POS TEST PRINT' }, issuedAt: new Date(), details: [], message: `Printer profile ${profile.displayName}` },
      status: 'PENDING', attempts: 0, leaseUntil: null, lastError: null,
    }));
  }

  async jobs(locationId: number, user: TenantPrincipal, page = 1, pageSize = 20, profileId?: number) {
    this.assertLocation(locationId, user);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (profileId !== undefined && (!Number.isSafeInteger(profileId) || profileId < 1))) throw new BadRequestException('Invalid print queue page or profile.');
    const [items, total] = await this.dataSource.getRepository(PosPrintJob).findAndCount({
      where: { tenantId: user.tenantId, locationId, status: In(['PENDING', 'CLAIMED', 'FAILED']), ...(profileId === undefined ? {} : { posPrintProfileId: profileId }) },
      select: ['posPrintJobId', 'posPrintProfileId', 'posTerminalId', 'documentType', 'sourceId', 'status', 'attempts', 'lastError', 'createdAt', 'updatedAt'],
      order: { createdAt: 'ASC', posPrintJobId: 'ASC' }, skip: (page - 1) * pageSize, take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async documentStatus(documentType: 'SALE' | 'REFUND', sourceId: number, user: TenantPrincipal) {
    const document = documentType === 'SALE'
      ? await this.dataSource.getRepository(Invoice).findOneBy({ invoiceId: sourceId, tenantId: user.tenantId })
      : await this.dataSource.getRepository(InvoiceRefund).findOneBy({ invoiceRefundId: sourceId, tenantId: user.tenantId });
    if (!document) throw new NotFoundException('Receipt document not found.');
    this.assertLocation(document.locationId, user);
    const job = await this.dataSource.getRepository(PosPrintJob).findOne({
      where: { tenantId: user.tenantId, documentType, sourceId },
      order: { posPrintJobId: 'DESC' },
    });
    return job ? { jobId: job.posPrintJobId, status: job.status, attempts: job.attempts, lastError: job.lastError, updatedAt: job.updatedAt } : { jobId: null, status: 'NOT_REQUESTED', attempts: 0, lastError: null, updatedAt: null };
  }

  async requestPrint(documentType: 'SALE' | 'REFUND', sourceId: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const document = documentType === 'SALE'
        ? await manager.getRepository(Invoice).findOne({ where: { invoiceId: sourceId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } })
        : await manager.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: sourceId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!document) throw new NotFoundException('Receipt document not found.');
      this.assertLocation(document.locationId, user);
      if (!document.receiptSnapshot) throw new BadRequestException('No archived receipt exists for this document.');
      const repo = manager.getRepository(PosPrintJob);
      const existing = await repo.findOne({ where: { tenantId: user.tenantId, documentType, sourceId }, order: { posPrintJobId: 'DESC' } });
      if (existing && (existing.status === 'PENDING' || existing.status === 'CLAIMED'))
        return { jobId: existing.posPrintJobId, status: existing.status, reprint: existing.receiptSnapshot?.printCopy === true };
      if (existing) {
        const reprint = existing.status === 'PRINTED' || existing.receiptSnapshot?.printCopy === true;
        if (reprint) await this.auditReprint(manager, documentType, sourceId, user, document.locationId, existing.posPrintJobId);
        existing.receiptSnapshot = { ...document.receiptSnapshot, printCopy: reprint };
        existing.status = 'PENDING'; existing.leaseUntil = null; existing.lastError = null;
        await repo.save(existing);
        return { jobId: existing.posPrintJobId, status: 'PENDING', reprint };
      }
      const job = await this.enqueue(manager, documentType, sourceId, user.tenantId, document.locationId,
        document.posTerminalId ?? null, document.receiptSnapshot);
      if (!job) throw new BadRequestException('No active receipt printer is configured for this location.');
      return { jobId: job.posPrintJobId, status: 'PENDING', reprint: false };
    });
  }

  async retry(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PosPrintJob);
      const job = await repo.findOne({ where: { posPrintJobId: id, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!job) throw new NotFoundException('Print job not found.');
      this.assertLocation(job.locationId, user);
      if (job.status === 'CLAIMED' && job.leaseUntil && job.leaseUntil.getTime() > Date.now()) throw new ConflictException('The print agent is still processing this job.');
      if (job.status === 'PRINTED' && job.sourceId && job.documentType !== 'TEST') {
        await this.auditReprint(manager, job.documentType, job.sourceId, user, job.locationId, job.posPrintJobId);
        job.receiptSnapshot = { ...job.receiptSnapshot, printCopy: true };
      }
      job.status = 'PENDING'; job.leaseUntil = null; job.lastError = null;
      return repo.save(job);
    });
  }

  async auditReprint(manager: EntityManager, documentType: 'SALE' | 'REFUND', sourceId: number, user: TenantPrincipal, locationId: number, printJobId: number | null = null) {
    this.assertLocation(locationId, user);
    await manager.query(`INSERT INTO tbl_pos_receipt_reprint
      (tenant_id, location_id, document_type, source_id, requested_by_user_id, requested_at, print_job_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [user.tenantId, locationId, documentType, sourceId, user.userId, new Date(), printJobId]);
    return { documentType, sourceId, copy: true };
  }

  async claim(profileId: number, token: string | undefined) {
    const profile = await this.agentProfile(profileId, token);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PosPrintJob);
      const job = await repo.createQueryBuilder('job')
        .where('job.posPrintProfileId = :profileId', { profileId })
        .andWhere(new Brackets((query) => query.where('job.status = :pending', { pending: 'PENDING' })
          .orWhere('job.status = :claimed AND job.leaseUntil < :now', { claimed: 'CLAIMED', now: new Date() })))
        .orderBy('job.posPrintJobId', 'ASC').setLock('pessimistic_write').getOne();
      if (!job) return null;
      job.status = 'CLAIMED'; job.attempts += 1; job.leaseUntil = new Date(Date.now() + 120000);
      await repo.save(job);
      return { jobId: job.posPrintJobId, attempt: job.attempts, copy: job.receiptSnapshot?.printCopy === true, receipt: job.receiptSnapshot,
        printer: { transport: profile.transport, target: profile.target, port: profile.port, paperWidth: profile.paperWidth, encoding: profile.encoding, cutEnabled: profile.cutEnabled } };
    });
  }

  async complete(profileId: number, jobId: number, token: string | undefined, attempt: number, success: boolean, error?: string) {
    await this.agentProfile(profileId, token);
    if (!Number.isSafeInteger(attempt) || attempt < 1 || typeof success !== 'boolean') throw new BadRequestException('A valid print attempt and result are required.');
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PosPrintJob);
      const job = await repo.findOne({ where: { posPrintProfileId: profileId, posPrintJobId: jobId }, lock: { mode: 'pessimistic_write' } });
      if (!job) throw new NotFoundException('Print job not found.');
      if (job.status === 'PRINTED' && success && job.attempts === attempt) return { status: 'PRINTED' };
      if (job.status !== 'CLAIMED' || job.attempts !== attempt) throw new ConflictException('Stale print acknowledgment.');
      job.status = success ? 'PRINTED' : 'FAILED'; job.lastError = success ? null : String(error ?? 'Printer did not confirm output.').slice(0, 500); job.leaseUntil = null;
      await repo.save(job);
      return { status: job.status };
    });
  }

  private async authorizedProfile(id: number, user: TenantPrincipal) {
    const profile = await this.dataSource.getRepository(PosPrintProfile).findOneBy({ posPrintProfileId: id, tenantId: user.tenantId });
    if (!profile) throw new NotFoundException('Printer profile not found.');
    this.assertLocation(profile.locationId, user);
    return profile;
  }

  private async agentProfile(id: number, token: string | undefined) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('Invalid print agent token.');
    const profile = await this.dataSource.getRepository(PosPrintProfile).findOneBy({ posPrintProfileId: id, isActive: true });
    if (!profile) throw new UnauthorizedException('Print agent profile is unavailable.');
    const hash = createHash('sha256').update(token).digest('hex');
    if (!timingSafeEqual(Buffer.from(hash), Buffer.from(profile.agentTokenHash))) throw new UnauthorizedException('Invalid print agent token.');
    return profile;
  }
}
