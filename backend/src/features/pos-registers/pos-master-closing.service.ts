import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { Location } from '../locations/locations.entity';
import { SubmitMasterRegisterCountDto, VerifyMasterRegisterCountDto } from './dto/master-closing.dto';
import { PosCashMovement, PosCashMovementDirection, PosCashFundingSource } from './pos-cash-movement.entity';
import { PosCashReconciliationPayment, PosReconciliationCoverageStatus } from './pos-cash-reconciliation-payment.entity';
import { PosCashReconciliation, PosCashReconciliationStatus, PosCashReconciliationType } from './pos-cash-reconciliation.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosLocationConfig, PosRegisterMode } from './pos-location-config.entity';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { PosListQueryDto } from './dto/pos-list-query.dto';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class PosMasterClosingService {
  constructor(private readonly dataSource: DataSource) {}

  async locations(user: TenantPrincipal) {
    const configs = await this.dataSource.getRepository(PosLocationConfig).find({
      where: { tenantId: user.tenantId, registerMode: PosRegisterMode.MASTER_REGISTER, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) },
      order: { locationId: 'ASC' },
    });
    if (!configs.length) return [];
    const locations = await this.dataSource.getRepository(Location).find({ where: { tenantId: user.tenantId, locationId: In(configs.map((config) => config.locationId)), isActive: true }, order: { name: 'ASC' } });
    return locations.map((location) => ({ locationId: location.locationId, code: location.code, name: location.name }));
  }

  async summary(locationId: number, user: TenantPrincipal) {
    this.assertLocationAccess(locationId, user);
    const registerSession = await this.dataSource.getRepository(PosRegisterSession).findOne({
      where: { tenantId: user.tenantId, locationId, status: In([PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.PENDING_VERIFICATION, PosRegisterSessionStatus.RECOUNT_REQUIRED]) },
      relations: { register: true },
    });
    if (!registerSession || registerSession.register.registerMode !== PosRegisterMode.MASTER_REGISTER) throw new NotFoundException('No current master register session was found for this location.');
    return this.buildSummary(this.dataSource.manager, registerSession);
  }

  async history(locationId: number, query: PosListQueryDto, user: TenantPrincipal) {
    this.assertLocationAccess(locationId, user);
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = query.pageSize ?? query.limit;
    const limit = [20, 50, 100].includes(Number(requestedLimit)) ? Number(requestedLimit) : 20;
    const search = query.search?.trim();
    const builder = this.dataSource.getRepository(PosMasterReconciliation).createQueryBuilder('row')
      .leftJoinAndSelect('row.location', 'location').leftJoinAndSelect('row.registerSession', 'registerSession')
      .leftJoinAndSelect('registerSession.register', 'register').leftJoinAndSelect('row.submittedByUser', 'submittedByUser')
      .leftJoinAndSelect('row.verifiedByUser', 'verifiedByUser')
      .where('row.tenant_id = :tenantId AND row.location_id = :locationId', { tenantId: user.tenantId, locationId });
    if (query.status && query.status !== 'ALL') builder.andWhere('row.status = :status', { status: query.status });
    if (query.dateFrom) builder.andWhere('row.submitted_at >= :dateFrom', { dateFrom: `${query.dateFrom} 00:00:00` });
    if (query.dateTo) builder.andWhere('row.submitted_at < DATE_ADD(:dateTo, INTERVAL 1 DAY)', { dateTo: query.dateTo });
    if (search) builder.andWhere('(row.master_cashier_identity LIKE :search OR register.display_name LIKE :search OR submittedByUser.username LIKE :search)', { search: `%${search}%` });
    const [rows, total] = await builder.orderBy('row.submittedAt', 'DESC').addOrderBy('row.posMasterReconciliationId', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: rows.map((row) => this.view(row)), page, limit, total };
  }

  async submit(dto: SubmitMasterRegisterCountDto, user: TenantPrincipal) {
    this.assertAmount(dto.countedCash, 'Counted cash');
    const identity = dto.masterCashierIdentity?.trim();
    if (!identity) throw new BadRequestException('Master cashier identity is required.');
    // READ COMMITTED is intentional: a checkout or payout that acquired the
    // register-session lock first must be visible after this transaction waits
    // for that lock, before the closing snapshot is calculated.
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const prior = await manager.getRepository(PosMasterReconciliation).findOneBy({ tenantId: user.tenantId, submissionKey: dto.submissionKey });
      const fingerprint = this.submissionFingerprint(dto);
      if (prior) {
        if (Number(prior.submittedByUserId) !== Number(user.userId) || prior.submissionFingerprint !== fingerprint) throw new ConflictException('This master count submission key was already used for different data.');
        return this.detailView(manager, prior);
      }
      this.assertLocationAccess(dto.locationId, user);
      const registerSession = await manager.getRepository(PosRegisterSession).findOne({
        where: { posRegisterSessionId: dto.posRegisterSessionId, tenantId: user.tenantId, locationId: dto.locationId, status: In([PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.RECOUNT_REQUIRED]) },
        relations: { register: true }, lock: { mode: 'pessimistic_write' },
      });
      if (!registerSession || registerSession.register.registerMode !== PosRegisterMode.MASTER_REGISTER) throw new ConflictException('The selected master register session is not available for count submission.');
      const previousRows = await manager.getRepository(PosMasterReconciliation).find({ where: { tenantId: user.tenantId, posRegisterSessionId: registerSession.posRegisterSessionId }, order: { attemptNumber: 'DESC' }, take: 1 });
      const previous = previousRows[0];
      if (registerSession.status === PosRegisterSessionStatus.RECOUNT_REQUIRED && previous?.status !== PosCashReconciliationStatus.REJECTED) throw new ConflictException('A rejected master count is required before a recount can be submitted.');
      const snapshot = await this.buildSummary(manager, registerSession);
      if (snapshot.blockers.length) throw new ConflictException({ message: 'The master register cannot be counted until all closing blockers are resolved.', blockers: snapshot.blockers });
      const systemExpected = Number(snapshot.systemExpectedMasterCash);
      const confirmedBasis = Number(snapshot.confirmedBatchCashBasis);
      const row = await manager.getRepository(PosMasterReconciliation).save(manager.getRepository(PosMasterReconciliation).create({
        tenantId: user.tenantId, locationId: dto.locationId, posRegisterSessionId: registerSession.posRegisterSessionId,
        attemptNumber: (previous?.attemptNumber ?? 0) + 1, submissionKey: dto.submissionKey, submissionFingerprint: fingerprint,
        openingBalance: Number(snapshot.openingBalance).toFixed(2), systemExpectedCash: systemExpected.toFixed(2), confirmedBatchCashBasis: confirmedBasis.toFixed(2),
        batchConfirmationDifference: Number(snapshot.batchConfirmationDifference).toFixed(2), countedCash: dto.countedCash.toFixed(2),
        countVsConfirmedBasis: money(dto.countedCash - confirmedBasis).toFixed(2), countVsSystemExpected: money(dto.countedCash - systemExpected).toFixed(2),
        summarySnapshot: snapshot, masterCashierIdentity: identity, submittedByUserId: user.userId, submittedAt: new Date(), status: PosCashReconciliationStatus.PENDING_VERIFICATION,
        verifiedCountedCash: null, verifiedVsConfirmedBasis: null, verifiedVsSystemExpected: null, verifiedByUserId: null, verifiedAt: null,
        verificationKey: null, verificationFingerprint: null, rejectionReason: null,
      }));
      registerSession.status = PosRegisterSessionStatus.PENDING_VERIFICATION;
      await manager.getRepository(PosRegisterSession).save(registerSession);
      return this.detailView(manager, row);
    });
  }

  async queue(query: PosListQueryDto, user: TenantPrincipal) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = query.pageSize ?? query.limit;
    const limit = [20, 50, 100].includes(Number(requestedLimit)) ? Number(requestedLimit) : 20;
    const search = query.search?.trim();
    const builder = this.dataSource.getRepository(PosMasterReconciliation).createQueryBuilder('reconciliation')
      .leftJoinAndSelect('reconciliation.location', 'location')
      .leftJoinAndSelect('reconciliation.registerSession', 'registerSession')
      .leftJoinAndSelect('registerSession.register', 'register')
      .leftJoinAndSelect('reconciliation.submittedByUser', 'submittedByUser')
      .where('reconciliation.tenant_id = :tenantId AND reconciliation.status = :status', { tenantId: user.tenantId, status: PosCashReconciliationStatus.PENDING_VERIFICATION });
    if (user.accessScope === 'LOCATION') builder.andWhere('reconciliation.location_id IN (:...locationIds)', { locationIds: user.assignedLocationIds.length ? user.assignedLocationIds : [-1] });
    if (query.locationId) builder.andWhere('reconciliation.location_id = :locationId', { locationId: query.locationId });
    if (query.dateFrom) builder.andWhere('reconciliation.submitted_at >= :dateFrom', { dateFrom: `${query.dateFrom} 00:00:00` });
    if (query.dateTo) builder.andWhere('reconciliation.submitted_at < DATE_ADD(:dateTo, INTERVAL 1 DAY)', { dateTo: query.dateTo });
    if (search) builder.andWhere('(location.name LIKE :search OR location.code LIKE :search OR register.display_name LIKE :search OR reconciliation.master_cashier_identity LIKE :search OR submittedByUser.username LIKE :search)', { search: `%${search}%` });
    const [rows, total] = await builder.orderBy('reconciliation.submittedAt', 'ASC').addOrderBy('reconciliation.posMasterReconciliationId', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: rows.map((row) => this.view(row)), page, limit, total };
  }

  async get(id: number, user: TenantPrincipal) { return this.view(await this.load(id, user)); }

  async verify(id: number, dto: VerifyMasterRegisterCountDto, user: TenantPrincipal) {
    this.assertAmount(dto.verifiedCountedCash, 'Verified cash');
    return this.dataSource.transaction(async (manager) => {
      const keyUse = await manager.getRepository(PosMasterReconciliation).findOneBy({ tenantId: user.tenantId, verificationKey: dto.verificationKey });
      if (keyUse && Number(keyUse.posMasterReconciliationId) !== Number(id)) throw new ConflictException('This verification key was already used for another master count.');
      const row = await manager.getRepository(PosMasterReconciliation).findOne({
        where: { posMasterReconciliationId: id, tenantId: user.tenantId }, relations: { registerSession: { register: true } }, lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Master register reconciliation not found.');
      this.assertLocationAccess(row.locationId, user);
      const fingerprint = this.verificationFingerprint(dto);
      if (row.verificationKey === dto.verificationKey && row.status !== PosCashReconciliationStatus.PENDING_VERIFICATION) {
        if (row.verificationFingerprint !== fingerprint) throw new ConflictException('This verification key was already used for different data.');
        return this.detailView(manager, row);
      }
      if (row.status !== PosCashReconciliationStatus.PENDING_VERIFICATION) throw new ConflictException('This master count has already been reviewed.');
      if (Number(row.submittedByUserId) === Number(user.userId)) throw new ForbiddenException('The user who submitted the master count cannot verify it.');
      const registerSession = await manager.getRepository(PosRegisterSession).findOne({
        where: { posRegisterSessionId: row.posRegisterSessionId, tenantId: user.tenantId, status: PosRegisterSessionStatus.PENDING_VERIFICATION }, lock: { mode: 'pessimistic_write' },
      });
      if (!registerSession) throw new ConflictException('The master register is not awaiting verification.');
      const now = new Date();
      row.verifiedCountedCash = dto.verifiedCountedCash.toFixed(2);
      row.verifiedVsConfirmedBasis = money(dto.verifiedCountedCash - Number(row.confirmedBatchCashBasis)).toFixed(2);
      row.verifiedVsSystemExpected = money(dto.verifiedCountedCash - Number(row.systemExpectedCash)).toFixed(2);
      row.verifiedByUserId = user.userId; row.verifiedAt = now; row.verificationKey = dto.verificationKey; row.verificationFingerprint = fingerprint;
      if (dto.decision === 'REJECT') {
        const reason = dto.rejectionReason?.trim();
        if (!reason) throw new BadRequestException('A recount reason is required.');
        row.status = PosCashReconciliationStatus.REJECTED; row.rejectionReason = reason;
        registerSession.status = PosRegisterSessionStatus.RECOUNT_REQUIRED;
      } else {
        row.status = PosCashReconciliationStatus.APPROVED; row.rejectionReason = null;
        registerSession.status = PosRegisterSessionStatus.CLOSED; registerSession.closedAt = now; registerSession.closedByUserId = user.userId;
      }
      await manager.getRepository(PosMasterReconciliation).save(row);
      await manager.getRepository(PosRegisterSession).save(registerSession);
      return this.detailView(manager, row);
    });
  }

  async buildSummary(manager: EntityManager, registerSession: PosRegisterSession) {
    const [cashierSessions, payments, movements, batches, coverage] = await Promise.all([
      manager.getRepository(PosCashierSession).find({ where: { tenantId: registerSession.tenantId, posRegisterSessionId: registerSession.posRegisterSessionId }, order: { posCashierSessionId: 'ASC' } }),
      manager.getRepository(InvoicePayment).find({
        where: { posRegisterSessionId: registerSession.posRegisterSessionId },
        relations: { paymentMethod: true },
        order: { invoicePaymentId: 'ASC' },
      }),
      manager.getRepository(PosCashMovement).find({ where: { posRegisterSessionId: registerSession.posRegisterSessionId }, order: { posCashMovementId: 'ASC' } }),
      manager.getRepository(PosCashReconciliation).find({ where: { tenantId: registerSession.tenantId, posRegisterSessionId: registerSession.posRegisterSessionId, reconciliationType: PosCashReconciliationType.MASTER_CASH_BATCH }, order: { attemptNumber: 'ASC' } }),
      manager.getRepository(PosCashReconciliationPayment).find({ where: { tenantId: registerSession.tenantId, posRegisterSessionId: registerSession.posRegisterSessionId, coverageStatus: PosReconciliationCoverageStatus.ACTIVE }, relations: { reconciliation: true } }),
    ]);
    const approvedBatches = batches.filter((batch) => batch.status === PosCashReconciliationStatus.APPROVED);
    const latestByCashier = new Map<number, PosCashReconciliation>();
    for (const batch of batches) latestByCashier.set(Number(batch.posCashierSessionId), batch);
    const cashPayments = payments.filter(
      (payment) =>
        (payment.paymentMethodTypeSnapshot ?? payment.paymentMethod?.paymentMethodType) === PaymentMethodType.CASH,
    );
    const tendered = money(cashPayments.reduce((sum, payment) => sum + Number(payment.tenderedAmount), 0));
    const applied = money(cashPayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
    const change = money(cashPayments.reduce((sum, payment) => sum + Number(payment.changeAmount), 0));
    const netReceipts = money(tendered - change);
    const movementIn = money(movements.filter((movement) => movement.direction === PosCashMovementDirection.IN).reduce((sum, movement) => sum + Number(movement.amount), 0));
    const movementOut = money(movements.filter((movement) => movement.direction === PosCashMovementDirection.OUT).reduce((sum, movement) => sum + Number(movement.amount), 0));
    const directMasterMovements = movements.filter((movement) => movement.fundingSource === PosCashFundingSource.MASTER_REGISTER || movement.posCashierSessionId === null);
    const directMasterIn = money(directMasterMovements.filter((movement) => movement.direction === PosCashMovementDirection.IN).reduce((sum, movement) => sum + Number(movement.amount), 0));
    const directMasterOut = money(directMasterMovements.filter((movement) => movement.direction === PosCashMovementDirection.OUT).reduce((sum, movement) => sum + Number(movement.amount), 0));
    const openingBalance = money(Number(registerSession.openingBalance));
    const confirmedBatchContributions = money(approvedBatches.reduce((sum, batch) => sum + Number(batch.confirmedNetCash), 0));
    const batchConfirmationDifference = money(approvedBatches.reduce((sum, batch) => sum + Number(batch.confirmationVariance), 0));
    const systemExpectedMasterCash = money(openingBalance + netReceipts + movementIn - movementOut);
    const confirmedBatchCashBasis = money(openingBalance + confirmedBatchContributions + directMasterIn - directMasterOut);

    const approvedPaymentIds = new Set(coverage.filter((item) => item.reconciliation?.status === PosCashReconciliationStatus.APPROVED).map((item) => Number(item.invoicePaymentId)));
    const coveredMovementIds = new Set<number>();
    for (const batch of approvedBatches) {
      const snapshot: any = batch.summarySnapshot;
      for (const movement of snapshot?.cash?.movements ?? []) coveredMovementIds.add(Number(movement.id));
    }
    const unresolvedCashierSessions = cashierSessions.filter((session) => session.status !== PosCashierSessionStatus.ENDED);
    const unresolvedBatches = cashierSessions.filter((session) => latestByCashier.get(Number(session.posCashierSessionId))?.status !== PosCashReconciliationStatus.APPROVED);
    const uncoveredPayments = payments.filter((payment) => !approvedPaymentIds.has(Number(payment.invoicePaymentId)));
    const uncoveredCashierMovements = movements.filter((movement) => movement.posCashierSessionId !== null && !coveredMovementIds.has(Number(movement.posCashMovementId)));
    const blockers: Array<{ code: string; message: string; ids: number[] }> = [];
    if (unresolvedCashierSessions.length) blockers.push({ code: 'CASHIER_SESSIONS_NOT_ENDED', message: `${unresolvedCashierSessions.length} cashier session(s) are still active or awaiting resolution.`, ids: unresolvedCashierSessions.map((session) => Number(session.posCashierSessionId)) });
    if (unresolvedBatches.length) blockers.push({ code: 'BATCHES_NOT_APPROVED', message: `${unresolvedBatches.length} cashier session(s) do not have an approved final batch.`, ids: unresolvedBatches.map((session) => Number(session.posCashierSessionId)) });
    if (uncoveredPayments.length) blockers.push({ code: 'UNCOVERED_RECEIPTS', message: `${uncoveredPayments.length} attributed payment(s) are not covered by approved batches.`, ids: uncoveredPayments.map((payment) => Number(payment.invoicePaymentId)) });
    if (uncoveredCashierMovements.length) blockers.push({ code: 'UNRESOLVED_CASHIER_PAYOUTS', message: `${uncoveredCashierMovements.length} cashier-funded cash movement(s) are not covered by approved batches.`, ids: uncoveredCashierMovements.map((movement) => Number(movement.posCashMovementId)) });
    return {
      locationId: registerSession.locationId, posRegisterSessionId: registerSession.posRegisterSessionId, businessDate: registerSession.businessDate, registerStatus: registerSession.status,
      openingBalance, cashReceipts: { tendered, applied, change, net: netReceipts }, movements: { in: movementIn, out: movementOut, directMasterIn, directMasterOut, rows: movements.map((movement) => ({ id: movement.posCashMovementId, fundingSource: movement.fundingSource, cashierSessionId: movement.posCashierSessionId, type: movement.movementType, direction: movement.direction, amount: Number(movement.amount), sourceType: movement.sourceType, sourceId: movement.sourceId, reason: movement.reason, physicalPayerIdentity: movement.physicalPayerIdentity, occurredAt: movement.occurredAt })) },
      approvedBatches: approvedBatches.map((batch) => ({ posCashReconciliationId: batch.posCashReconciliationId, posCashierSessionId: batch.posCashierSessionId, expectedContribution: Number(batch.expectedCash), confirmedContribution: Number(batch.confirmedNetCash), confirmationDifference: Number(batch.confirmationVariance), recipientIdentity: batch.physicalRecipientIdentity, verifiedAt: batch.verifiedAt })),
      confirmedBatchContributions, batchConfirmationDifference, systemExpectedMasterCash, confirmedBatchCashBasis,
      systemVsConfirmedBasis: money(confirmedBatchCashBasis - systemExpectedMasterCash), blockers, canSubmitCount: blockers.length === 0 && [PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.RECOUNT_REQUIRED].includes(registerSession.status),
      formulas: {
        systemExpected: 'opening balance + all attributed cash tender - all change + all physical cash-in movements - all physical cash-out movements',
        confirmedBasis: 'opening balance + approved batch confirmed contributions + direct master cash-in movements - direct master cash-out movements',
      },
    };
  }

  private async load(id: number, user: TenantPrincipal) {
    const row = await this.dataSource.getRepository(PosMasterReconciliation).findOne({ where: { posMasterReconciliationId: id, tenantId: user.tenantId }, relations: { location: true, registerSession: { register: true }, submittedByUser: true, verifiedByUser: true } });
    if (!row) throw new NotFoundException('Master register reconciliation not found.');
    this.assertLocationAccess(row.locationId, user); return row;
  }
  private async detailView(manager: EntityManager, row: PosMasterReconciliation) {
    const loaded = await manager.getRepository(PosMasterReconciliation).findOneOrFail({ where: { posMasterReconciliationId: row.posMasterReconciliationId }, relations: { location: true, registerSession: { register: true }, submittedByUser: true, verifiedByUser: true } });
    return this.view(loaded);
  }
  private view(row: PosMasterReconciliation) {
    return {
      posMasterReconciliationId: row.posMasterReconciliationId, locationId: row.locationId, location: row.location ? { locationId: row.location.locationId, code: row.location.code, name: row.location.name } : undefined,
      posRegisterSessionId: row.posRegisterSessionId, businessDate: row.registerSession?.businessDate, registerStatus: row.registerSession?.status, attemptNumber: row.attemptNumber,
      openingBalance: Number(row.openingBalance), systemExpectedMasterCash: Number(row.systemExpectedCash), confirmedBatchCashBasis: Number(row.confirmedBatchCashBasis), batchConfirmationDifference: Number(row.batchConfirmationDifference),
      countedCash: Number(row.countedCash), countVsConfirmedBasis: Number(row.countVsConfirmedBasis), countVsSystemExpected: Number(row.countVsSystemExpected), summary: row.summarySnapshot,
      masterCashierIdentity: row.masterCashierIdentity, submittedByUserId: row.submittedByUserId, submittedByUsername: row.submittedByUser?.username, submittedAt: row.submittedAt, status: row.status,
      verifiedCountedCash: row.verifiedCountedCash === null ? null : Number(row.verifiedCountedCash), verifiedVsConfirmedBasis: row.verifiedVsConfirmedBasis === null ? null : Number(row.verifiedVsConfirmedBasis),
      verifiedVsSystemExpected: row.verifiedVsSystemExpected === null ? null : Number(row.verifiedVsSystemExpected), verifiedByUserId: row.verifiedByUserId, verifiedByUsername: row.verifiedByUser?.username, verifiedAt: row.verifiedAt, rejectionReason: row.rejectionReason,
    };
  }
  private submissionFingerprint(dto: SubmitMasterRegisterCountDto) { return this.hash({ locationId: dto.locationId, posRegisterSessionId: dto.posRegisterSessionId, countedCash: money(dto.countedCash), masterCashierIdentity: dto.masterCashierIdentity.trim() }); }
  private verificationFingerprint(dto: VerifyMasterRegisterCountDto) { return this.hash({ decision: dto.decision, verifiedCountedCash: money(dto.verifiedCountedCash), rejectionReason: dto.rejectionReason?.trim() || null }); }
  private hash(value: object) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
  private assertAmount(value: number, label: string) { if (!Number.isFinite(value) || value < 0 || money(value) !== value) throw new BadRequestException(`${label} must be nonnegative with at most two decimal places.`); }
  private assertLocationAccess(locationId: number, user: TenantPrincipal) { if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) throw new ForbiddenException('You do not have access to this location.'); }
}
