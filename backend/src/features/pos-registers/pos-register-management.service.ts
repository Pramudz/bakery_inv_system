import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { PosCashMovement } from './pos-cash-movement.entity';
import { PosCashReconciliation, PosCashReconciliationStatus } from './pos-cash-reconciliation.entity';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosLocationConfig, PosRegisterMode } from './pos-location-config.entity';
import { PosMasterClosingService } from './pos-master-closing.service';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { cashierNextAction, registerNextAction } from './pos-register-management-status';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';
import { PosSessionsService } from './pos-sessions.service';
import { PosTerminal } from './pos-terminal.entity';
import { PosListQueryDto } from './dto/pos-list-query.dto';

@Injectable()
export class PosRegisterManagementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sessions: PosSessionsService,
    private readonly masterClosing: PosMasterClosingService,
  ) {}

  async locations(user: TenantPrincipal) {
    const locations = await this.dataSource.getRepository(Location).find({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      order: { name: 'ASC' },
    });
    const configs = locations.length
      ? await this.dataSource.getRepository(PosLocationConfig).find({ where: { tenantId: user.tenantId, locationId: In(locations.map((row) => row.locationId)) } })
      : [];
    const byLocation = new Map(configs.map((row) => [Number(row.locationId), row]));
    return locations.map((location) => ({
      locationId: location.locationId,
      code: location.code,
      name: location.name,
      registerMode: byLocation.get(Number(location.locationId))?.registerMode ?? null,
    }));
  }

  async overview(locationId: number, credential: string | undefined, user: TenantPrincipal) {
    await this.location(locationId, user);
    const context = await this.sessions.context(locationId, credential, user);
    const currentStatuses = [PosCashierSessionStatus.ACTIVE, PosCashierSessionStatus.PENDING_VERIFICATION, PosCashierSessionStatus.RECOUNT_REQUIRED];
    const [registers, registerSessions, cashierPreview, terminalPreview, currentCashierCount, activeTerminalCount, pendingCashCounts, pendingMasterCounts] = await Promise.all([
      this.dataSource.getRepository(PosCashRegister).find({ where: { tenantId: user.tenantId, locationId, ...(context.config ? { registerMode: context.config.registerMode } : {}) }, relations: { terminal: true }, order: { displayName: 'ASC', posCashRegisterId: 'ASC' }, take: 5 }),
      this.dataSource.getRepository(PosRegisterSession).find({ where: { tenantId: user.tenantId, locationId, status: In([PosRegisterSessionStatus.OPEN, PosRegisterSessionStatus.PENDING_VERIFICATION, PosRegisterSessionStatus.RECOUNT_REQUIRED]) }, relations: { register: { terminal: true }, openedByUser: true, closedByUser: true }, order: { openedAt: 'DESC', posRegisterSessionId: 'DESC' }, take: 50 }),
      this.dataSource.getRepository(PosCashierSession).find({ where: { tenantId: user.tenantId, locationId, status: In(currentStatuses) }, relations: { cashier: true, terminal: true, registerSession: { register: true } }, order: { startedAt: 'DESC', posCashierSessionId: 'DESC' }, take: 5 }),
      this.dataSource.getRepository(PosTerminal).find({ where: { tenantId: user.tenantId, locationId, isActive: true }, order: { displayName: 'ASC', posTerminalId: 'ASC' }, take: 5 }),
      this.dataSource.getRepository(PosCashierSession).count({ where: { tenantId: user.tenantId, locationId, status: In(currentStatuses) } }),
      this.dataSource.getRepository(PosTerminal).count({ where: { tenantId: user.tenantId, locationId, isActive: true } }),
      this.dataSource.getRepository(PosCashReconciliation).count({ where: { tenantId: user.tenantId, locationId, status: PosCashReconciliationStatus.PENDING_VERIFICATION } }),
      this.dataSource.getRepository(PosMasterReconciliation).count({ where: { tenantId: user.tenantId, locationId, status: PosCashReconciliationStatus.PENDING_VERIFICATION } }),
    ]);
    const [previewReconciliations, occupiedPreviewTerminals] = await Promise.all([
      Promise.all(cashierPreview.map((row) => this.dataSource.getRepository(PosCashReconciliation).findOne({ where: { tenantId: user.tenantId, posCashierSessionId: row.posCashierSessionId }, order: { posCashReconciliationId: 'DESC' } }))),
      terminalPreview.length ? this.dataSource.getRepository(PosCashierSession).find({ where: { tenantId: user.tenantId, locationId, posTerminalId: In(terminalPreview.map((row) => row.posTerminalId)), status: In(currentStatuses) } }) : Promise.resolve([]),
    ]);
    const latestReconciliation = new Map<number, PosCashReconciliation>();
    previewReconciliations.forEach((row, index) => { if (row) latestReconciliation.set(Number(cashierPreview[index].posCashierSessionId), row); });
    const ongoingRegisterIds = new Set(
      registerSessions.filter((row) => row.status !== PosRegisterSessionStatus.CLOSED).map((row) => Number(row.posRegisterSessionId)),
    );
    let masterReadiness: any = null;
    const activeMaster = registerSessions.find((row) => row.register?.registerMode === PosRegisterMode.MASTER_REGISTER && ongoingRegisterIds.has(Number(row.posRegisterSessionId)));
    if (activeMaster) masterReadiness = await this.masterClosing.buildSummary(this.dataSource.manager, activeMaster);

    return {
      context,
      registers: registers.map((register) => {
        const session = registerSessions.find((row) => Number(row.posCashRegisterId) === Number(register.posCashRegisterId) && ongoingRegisterIds.has(Number(row.posRegisterSessionId))) ?? null;
        return {
          posCashRegisterId: register.posCashRegisterId,
          displayName: register.displayName,
          registerMode: register.registerMode,
          isActive: register.isActive,
          terminal: register.terminal ? this.terminalView(register.terminal) : null,
          session: session ? this.registerSessionView(session) : null,
          nextAction: registerNextAction(session?.status ?? null),
        };
      }),
      cashierSessions: cashierPreview.map((row) => {
        const reconciliation = latestReconciliation.get(Number(row.posCashierSessionId));
        return {
          posCashierSessionId: row.posCashierSessionId,
          posRegisterSessionId: row.posRegisterSessionId,
          cashierUserId: row.cashierUserId,
          cashierName: this.userName(row.cashier),
          terminal: this.terminalView(row.terminal),
          registerName: row.registerSession?.register?.displayName,
          registerMode: row.registerSession?.register?.registerMode,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          status: row.status,
          reconciliation: reconciliation ? { id: reconciliation.posCashReconciliationId, type: reconciliation.reconciliationType, status: reconciliation.status, attemptNumber: reconciliation.attemptNumber } : null,
          nextAction: cashierNextAction(row.status, row.registerSession.register.registerMode, reconciliation ?? null),
          isCurrentUser: Number(row.cashierUserId) === Number(user.userId),
          isCurrentDevice: Number(context.terminal?.posTerminalId) === Number(row.posTerminalId),
        };
      }),
      terminals: terminalPreview.map((terminal) => ({
        ...this.terminalView(terminal),
        isCurrentDevice: Number(context.terminal?.posTerminalId) === Number(terminal.posTerminalId),
        available: terminal.isActive && !occupiedPreviewTerminals.some((session) => Number(session.posTerminalId) === Number(terminal.posTerminalId)),
      })),
      sessionSummary: {
        currentCashiers: currentCashierCount,
        activeTerminals: activeTerminalCount,
        availableTerminals: Math.max(0, activeTerminalCount - currentCashierCount),
      },
      masterReadiness,
      verificationSummary: { cashierReconciliations: pendingCashCounts, masterReconciliations: pendingMasterCounts, total: pendingCashCounts + pendingMasterCounts },
    };
  }

  async history(locationId: number, query: PosListQueryDto, kindValue: string | undefined, user: TenantPrincipal) {
    await this.location(locationId, user);
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = query.pageSize ?? query.limit;
    const limit = [20, 50, 100].includes(Number(requestedLimit)) ? Number(requestedLimit) : 20;
    const search = query.search?.trim();
    const kinds = ['REGISTERS', 'CASHIERS', 'CASHIER_RECONCILIATIONS', 'MASTER_RECONCILIATIONS', 'PAYOUTS'];
    const kind = kinds.includes(kindValue ?? '') ? kindValue! : 'REGISTERS';
    let builder: any;
    if (kind === 'REGISTERS') {
      builder = this.dataSource.getRepository(PosRegisterSession).createQueryBuilder('row')
        .leftJoinAndSelect('row.register', 'register').leftJoinAndSelect('register.terminal', 'terminal')
        .leftJoinAndSelect('row.openedByUser', 'openedByUser').leftJoinAndSelect('row.closedByUser', 'closedByUser')
        .where('row.tenant_id = :tenantId AND row.location_id = :locationId', { tenantId: user.tenantId, locationId });
      if (query.status && query.status !== 'ALL') builder.andWhere('row.status = :status', { status: query.status });
      if (query.mode && query.mode !== 'ALL') builder.andWhere('register.register_mode = :mode', { mode: query.mode });
      if (search) builder.andWhere('(register.display_name LIKE :search OR terminal.terminal_code LIKE :search OR terminal.display_name LIKE :search OR CAST(row.pos_register_session_id AS CHAR) LIKE :search)', { search: `%${search}%` });
      this.dateFilters(builder, query, 'row.opened_at');
      builder.orderBy('row.openedAt', 'DESC').addOrderBy('row.posRegisterSessionId', 'DESC');
    } else if (kind === 'CASHIERS') {
      builder = this.dataSource.getRepository(PosCashierSession).createQueryBuilder('row')
        .leftJoinAndSelect('row.cashier', 'cashier').leftJoinAndSelect('row.terminal', 'terminal')
        .leftJoinAndSelect('row.registerSession', 'registerSession').leftJoinAndSelect('registerSession.register', 'register')
        .leftJoinAndSelect('row.endedByUser', 'endedByUser')
        .where('row.tenant_id = :tenantId AND row.location_id = :locationId', { tenantId: user.tenantId, locationId });
      if (query.status === 'CURRENT') builder.andWhere('row.status IN (:...statuses)', { statuses: [PosCashierSessionStatus.ACTIVE, PosCashierSessionStatus.PENDING_VERIFICATION, PosCashierSessionStatus.RECOUNT_REQUIRED] });
      else if (query.status && query.status !== 'ALL') builder.andWhere('row.status = :status', { status: query.status });
      if (query.mode && query.mode !== 'ALL') builder.andWhere('register.register_mode = :mode', { mode: query.mode });
      if (search) builder.andWhere('(cashier.username LIKE :search OR cashier.first_name LIKE :search OR cashier.last_name LIKE :search OR terminal.terminal_code LIKE :search OR terminal.display_name LIKE :search OR register.display_name LIKE :search)', { search: `%${search}%` });
      this.dateFilters(builder, query, 'row.started_at');
      builder.orderBy('row.startedAt', 'DESC').addOrderBy('row.posCashierSessionId', 'DESC');
    } else if (kind === 'CASHIER_RECONCILIATIONS') {
      builder = this.dataSource.getRepository(PosCashReconciliation).createQueryBuilder('row')
        .leftJoinAndSelect('row.cashierSession', 'cashierSession').leftJoinAndSelect('cashierSession.cashier', 'cashier').leftJoinAndSelect('cashierSession.terminal', 'terminal')
        .leftJoinAndSelect('row.registerSession', 'registerSession').leftJoinAndSelect('registerSession.register', 'register')
        .leftJoinAndSelect('row.submittedByUser', 'submittedByUser').leftJoinAndSelect('row.verifiedByUser', 'verifiedByUser')
        .where('row.tenant_id = :tenantId AND row.location_id = :locationId', { tenantId: user.tenantId, locationId });
      if (query.status && query.status !== 'ALL') builder.andWhere('row.status = :status', { status: query.status });
      if (query.mode && query.mode !== 'ALL') builder.andWhere('register.register_mode = :mode', { mode: query.mode });
      if (search) builder.andWhere('(cashier.username LIKE :search OR cashier.first_name LIKE :search OR cashier.last_name LIKE :search OR terminal.terminal_code LIKE :search OR terminal.display_name LIKE :search OR register.display_name LIKE :search)', { search: `%${search}%` });
      this.dateFilters(builder, query, 'row.submitted_at');
      builder.orderBy('row.submittedAt', 'DESC').addOrderBy('row.posCashReconciliationId', 'DESC');
    } else if (kind === 'MASTER_RECONCILIATIONS') {
      builder = this.dataSource.getRepository(PosMasterReconciliation).createQueryBuilder('row')
        .leftJoinAndSelect('row.registerSession', 'registerSession').leftJoinAndSelect('registerSession.register', 'register')
        .leftJoinAndSelect('row.submittedByUser', 'submittedByUser').leftJoinAndSelect('row.verifiedByUser', 'verifiedByUser')
        .where('row.tenant_id = :tenantId AND row.location_id = :locationId', { tenantId: user.tenantId, locationId });
      if (query.status && query.status !== 'ALL') builder.andWhere('row.status = :status', { status: query.status });
      if (search) builder.andWhere('(row.master_cashier_identity LIKE :search OR register.display_name LIKE :search OR submittedByUser.username LIKE :search)', { search: `%${search}%` });
      this.dateFilters(builder, query, 'row.submitted_at');
      builder.orderBy('row.submittedAt', 'DESC').addOrderBy('row.posMasterReconciliationId', 'DESC');
    } else {
      builder = this.dataSource.getRepository(PosCashMovement).createQueryBuilder('row')
        .leftJoinAndSelect('row.createdByUser', 'createdByUser').leftJoinAndSelect('row.cashierSession', 'cashierSession')
        .leftJoinAndSelect('cashierSession.cashier', 'cashier').leftJoinAndSelect('cashierSession.terminal', 'terminal')
        .where('row.tenant_id = :tenantId AND row.location_id = :locationId', { tenantId: user.tenantId, locationId });
      if (query.status && query.status !== 'ALL') builder.andWhere('row.funding_source = :status', { status: query.status });
      if (search) builder.andWhere('(row.source_type LIKE :search OR CAST(row.source_id AS CHAR) LIKE :search OR row.reason LIKE :search OR row.physical_payer_identity LIKE :search OR terminal.terminal_code LIKE :search)', { search: `%${search}%` });
      this.dateFilters(builder, query, 'row.occurred_at');
      builder.orderBy('row.occurredAt', 'DESC').addOrderBy('row.posCashMovementId', 'DESC');
    }
    const [rows, total] = await builder.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { page, limit, total, items: rows.map((row: any) => this.historyView(kind, row)) };
  }

  async verificationQueue(query: PosListQueryDto, user: TenantPrincipal) {
    const type = query.type ?? 'ALL';
    if (!['ALL', 'TERMINAL_CASH_COUNT', 'MASTER_CASH_BATCH', 'MASTER_REGISTER_COUNT'].includes(type)) throw new BadRequestException('Invalid verification type.');
    const status = query.status ?? 'PENDING_VERIFICATION';
    if (!['ALL', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED'].includes(status)) throw new BadRequestException('Invalid verification status.');
    if (query.locationId && user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(query.locationId))) throw new ForbiddenException('You do not have access to this location.');
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const requestedLimit = query.pageSize ?? query.limit;
    const limit = [20, 50, 100].includes(Number(requestedLimit)) ? Number(requestedLimit) : 20;
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.length) return { items: [], page, limit, total: 0 };
    const search = query.search?.trim();
    const branches: string[] = [];
    const parameters: unknown[] = [];
    const where = (alias: string, searchColumns: string[]) => {
      const clauses = [`${alias}.tenant_id = ?`];
      const values: unknown[] = [user.tenantId];
      if (user.accessScope === 'LOCATION') {
        clauses.push(`${alias}.location_id IN (${user.assignedLocationIds.map(() => '?').join(', ')})`);
        values.push(...user.assignedLocationIds);
      }
      if (query.locationId) { clauses.push(`${alias}.location_id = ?`); values.push(query.locationId); }
      if (status !== 'ALL') { clauses.push(`${alias}.status = ?`); values.push(status); }
      if (query.dateFrom) { clauses.push(`${alias}.submitted_at >= ?`); values.push(`${query.dateFrom} 00:00:00`); }
      if (query.dateTo) { clauses.push(`${alias}.submitted_at < DATE_ADD(?, INTERVAL 1 DAY)`); values.push(query.dateTo); }
      if (search) { clauses.push(`(${searchColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`); values.push(...searchColumns.map(() => `%${search}%`)); }
      return { clauses, values };
    };
    if (type !== 'MASTER_REGISTER_COUNT') {
      const cash = where('r', ['l.name', 'l.code', 't.terminal_code', 't.display_name', 'cashier.username', 'cashier.first_name', 'cashier.last_name', 'register_row.display_name', 'CAST(r.pos_cash_reconciliation_id AS CHAR)']);
      if (type !== 'ALL') { cash.clauses.push('r.reconciliation_type = ?'); cash.values.push(type); }
      branches.push(`SELECT r.reconciliation_type AS verificationType, CASE WHEN r.reconciliation_type = 'TERMINAL_CASH_COUNT' THEN 0 ELSE 1 END AS sourceRank,
        r.pos_cash_reconciliation_id AS sourceId, r.location_id AS locationId, l.name AS locationName, l.code AS locationCode,
        t.terminal_code AS terminalCode, t.display_name AS terminalName,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', cashier.first_name, cashier.last_name)), ''), cashier.username) AS cashierName,
        register_row.display_name AS registerName, r.attempt_number AS attemptNumber, r.submitted_at AS submittedAt,
        r.expected_cash AS expectedCash, r.counted_cash AS countedCash, r.status AS status
        FROM tbl_pos_cash_reconciliation r
        JOIN tbl_location l ON l.location_id = r.location_id
        JOIN tbl_pos_cashier_session cs ON cs.pos_cashier_session_id = r.pos_cashier_session_id
        JOIN tbl_user cashier ON cashier.user_id = cs.cashier_user_id
        JOIN tbl_pos_terminal t ON t.pos_terminal_id = cs.pos_terminal_id
        JOIN tbl_pos_register_session rs ON rs.pos_register_session_id = r.pos_register_session_id
        JOIN tbl_pos_cash_register register_row ON register_row.pos_cash_register_id = rs.pos_cash_register_id
        WHERE ${cash.clauses.join(' AND ')}`);
      parameters.push(...cash.values);
    }
    if (type === 'ALL' || type === 'MASTER_REGISTER_COUNT') {
      const master = where('m', ['l.name', 'l.code', 'm.master_cashier_identity', 'register_row.display_name', 'CAST(m.pos_master_reconciliation_id AS CHAR)']);
      branches.push(`SELECT 'MASTER_REGISTER_COUNT' AS verificationType, 2 AS sourceRank,
        m.pos_master_reconciliation_id AS sourceId, m.location_id AS locationId, l.name AS locationName, l.code AS locationCode,
        NULL AS terminalCode, NULL AS terminalName, m.master_cashier_identity AS cashierName,
        register_row.display_name AS registerName, m.attempt_number AS attemptNumber, m.submitted_at AS submittedAt,
        m.system_expected_cash AS expectedCash, m.counted_cash AS countedCash, m.status AS status
        FROM tbl_pos_master_reconciliation m
        JOIN tbl_location l ON l.location_id = m.location_id
        JOIN tbl_pos_register_session rs ON rs.pos_register_session_id = m.pos_register_session_id
        JOIN tbl_pos_cash_register register_row ON register_row.pos_cash_register_id = rs.pos_cash_register_id
        WHERE ${master.clauses.join(' AND ')}`);
      parameters.push(...master.values);
    }
    const union = branches.join(' UNION ALL ');
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const counts: Array<{ total: string | number }> = await manager.query(`SELECT COUNT(*) AS total FROM (${union}) verification_rows`, parameters);
      const rows: Array<{ verificationType: 'TERMINAL_CASH_COUNT' | 'MASTER_CASH_BATCH' | 'MASTER_REGISTER_COUNT'; sourceId: string | number; locationId: string | number; attemptNumber: number; expectedCash: string | number; countedCash: string | number | null; [key: string]: unknown }> = await manager.query(`SELECT * FROM (${union}) verification_rows ORDER BY submittedAt DESC, sourceRank ASC, sourceId DESC LIMIT ? OFFSET ?`, [...parameters, limit, (page - 1) * limit]);
      return { items: rows.map((row) => ({ ...row, sourceId: Number(row.sourceId), locationId: Number(row.locationId), attemptNumber: Number(row.attemptNumber), expectedCash: Number(row.expectedCash), countedCash: row.countedCash === null ? null : Number(row.countedCash) })), page, limit, total: Number(counts[0]?.total ?? 0) };
    });
  }

  private historyView(kind: string, row: any) {
    if (kind === 'REGISTERS') return { kind, id: row.posRegisterSessionId, status: row.status, businessDate: row.businessDate, registerName: row.register?.displayName, terminalName: row.register?.terminal?.displayName ?? null, terminalCode: row.register?.terminal?.terminalCode ?? null, openingBalance: Number(row.openingBalance), startedAt: row.openedAt, endedAt: row.closedAt, actor: this.userName(row.openedByUser), closedBy: this.userName(row.closedByUser) };
    if (kind === 'CASHIERS') return { kind, id: row.posCashierSessionId, posRegisterSessionId: row.posRegisterSessionId, cashierUserId: row.cashierUserId, posTerminalId: row.posTerminalId, status: row.status, registerName: row.registerSession?.register?.displayName, registerMode: row.registerSession?.register?.registerMode, terminalName: row.terminal?.displayName, terminalCode: row.terminal?.terminalCode, cashierName: this.userName(row.cashier), startedAt: row.startedAt, endedAt: row.endedAt, endedBy: this.userName(row.endedByUser) };
    if (kind === 'PAYOUTS') return { kind, id: row.posCashMovementId, status: row.fundingSource, movementType: row.movementType, amount: Number(row.amount), sourceType: row.sourceType, sourceId: row.sourceId, reason: row.reason, physicalPayerIdentity: row.physicalPayerIdentity, terminalName: row.cashierSession?.terminal?.displayName ?? null, terminalCode: row.cashierSession?.terminal?.terminalCode ?? null, cashierName: this.userName(row.cashierSession?.cashier), actor: this.userName(row.createdByUser), occurredAt: row.occurredAt };
    if (kind === 'CASHIER_RECONCILIATIONS') return { kind: row.reconciliationType, id: row.posCashReconciliationId, submittedAt: row.submittedAt, status: row.status, attemptNumber: row.attemptNumber, expectedCash: Number(row.expectedCash), countedCash: row.countedCash === null ? null : Number(row.countedCash), variance: row.reconciliationType === 'MASTER_CASH_BATCH' ? Number(row.confirmationVariance ?? 0) : Number(row.cashierVariance ?? 0), cashierName: this.userName(row.cashierSession?.cashier), terminalName: row.cashierSession?.terminal ? `${row.cashierSession.terminal.displayName} (${row.cashierSession.terminal.terminalCode})` : null, submittedBy: this.userName(row.submittedByUser), verifiedBy: this.userName(row.verifiedByUser), snapshot: row.summarySnapshot };
    if (kind === 'MASTER_RECONCILIATIONS') return { kind: 'MASTER_REGISTER_COUNT', id: row.posMasterReconciliationId, submittedAt: row.submittedAt, status: row.status, attemptNumber: row.attemptNumber, expectedCash: Number(row.systemExpectedCash), countedCash: Number(row.countedCash), variance: Number(row.countVsSystemExpected), cashierName: row.masterCashierIdentity, terminalName: null, submittedBy: this.userName(row.submittedByUser), verifiedBy: this.userName(row.verifiedByUser), snapshot: row.summarySnapshot };
    return row;
  }

  private dateFilters(builder: any, query: PosListQueryDto, column: string) {
    if (query.dateFrom) builder.andWhere(`${column} >= :dateFrom`, { dateFrom: `${query.dateFrom} 00:00:00` });
    if (query.dateTo) builder.andWhere(`${column} < DATE_ADD(:dateTo, INTERVAL 1 DAY)`, { dateTo: query.dateTo });
  }

  private async location(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) throw new ForbiddenException('You do not have access to this location.');
    const row = await this.dataSource.getRepository(Location).findOneBy({ tenantId: user.tenantId, locationId, isActive: true });
    if (!row) throw new NotFoundException('Active location not found.');
    return row;
  }
  private terminalView(row: PosTerminal) { return { posTerminalId: row.posTerminalId, locationId: row.locationId, terminalCode: row.terminalCode, displayName: row.displayName, isActive: row.isActive }; }
  private registerSessionView(row: PosRegisterSession) { return { posRegisterSessionId: row.posRegisterSessionId, businessDate: row.businessDate, openingBalance: Number(row.openingBalance), openedAt: row.openedAt, status: row.status, closedAt: row.closedAt }; }
  private userName(row: any) { return row ? [row.firstName, row.lastName].filter(Boolean).join(' ') || row.username : null; }
}
