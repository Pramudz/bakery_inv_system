import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoiceRefund } from '../invoice-refunds/invoice-refund.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Invoice } from '../invoices/invoice.entity';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { SubmitCashCountDto, VerifyCashCountDto } from './dto/cash-reconciliation.dto';
import { PosCashMovement, PosCashMovementDirection } from './pos-cash-movement.entity';
import { PosCashReconciliation, PosCashReconciliationStatus } from './pos-cash-reconciliation.entity';
import { PosCashierSession, PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosRegisterMode } from './pos-location-config.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from './pos-register-session.entity';
import { PosSessionsService } from './pos-sessions.service';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class PosCashReconciliationService {
  constructor(private readonly dataSource: DataSource, private readonly posSessions: PosSessionsService) {}

  async current(credential: string | undefined, user: TenantPrincipal) {
    const paired = await this.dataSource.transaction((manager) => this.posSessions.requireTerminalClosingSession(manager, credential, user));
    return this.summary(this.dataSource.manager, paired.registerSession, paired.cashierSession);
  }

  async submit(dto: SubmitCashCountDto, credential: string | undefined, user: TenantPrincipal) {
    this.assertAmount(dto.countedCash, 'Counted cash');
    return this.dataSource.transaction(async (manager) => {
      const prior = await manager.getRepository(PosCashReconciliation).findOneBy({ tenantId: user.tenantId, submissionKey: dto.submissionKey });
      if (prior) {
        if (Number(prior.submittedByUserId) !== Number(user.userId) || money(Number(prior.countedCash)) !== money(dto.countedCash)) throw new ConflictException('This count submission key was already used for different data.');
        return this.detailView(manager, prior);
      }
      const active = await this.posSessions.requireTerminalClosingSession(manager, credential, user);
      const existing = await manager.getRepository(PosCashReconciliation).findOne({
        where: { tenantId: user.tenantId, submissionKey: dto.submissionKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) return this.detailView(manager, existing);
      const previous = await manager.getRepository(PosCashReconciliation).find({
        where: { tenantId: user.tenantId, posCashierSessionId: active.cashierSession.posCashierSessionId },
        order: { attemptNumber: 'DESC' },
        take: 1,
      });
      if (active.cashierSession.status === PosCashierSessionStatus.RECOUNT_REQUIRED && previous[0]?.status !== PosCashReconciliationStatus.REJECTED) throw new ConflictException('A rejected count is required before a recount can be submitted.');
      const snapshot = await this.summary(manager, active.registerSession, active.cashierSession);
      const expected = Number(snapshot.expectedCash);
      const reconciliation = await manager.getRepository(PosCashReconciliation).save(manager.getRepository(PosCashReconciliation).create({
        tenantId: user.tenantId,
        locationId: active.registerSession.locationId,
        posRegisterSessionId: active.registerSession.posRegisterSessionId,
        posCashierSessionId: active.cashierSession.posCashierSessionId,
        attemptNumber: (previous[0]?.attemptNumber ?? 0) + 1,
        submissionKey: dto.submissionKey,
        openingBalance: Number(snapshot.openingBalance).toFixed(2),
        cashReceived: Number(snapshot.cash.received.net).toFixed(2),
        cashPaidOut: Number(snapshot.cash.paidOut).toFixed(2),
        expectedCash: expected.toFixed(2),
        countedCash: dto.countedCash.toFixed(2),
        cashierVariance: money(dto.countedCash - expected).toFixed(2),
        summarySnapshot: snapshot,
        submittedByUserId: user.userId,
        submittedAt: new Date(),
        status: PosCashReconciliationStatus.PENDING_VERIFICATION,
        verifiedCountedCash: null,
        verifiedVariance: null,
        verifiedByUserId: null,
        verifiedAt: null,
        verificationKey: null,
        rejectionReason: null,
      }));
      active.cashierSession.status = PosCashierSessionStatus.PENDING_VERIFICATION;
      active.registerSession.status = PosRegisterSessionStatus.PENDING_VERIFICATION;
      await manager.getRepository(PosCashierSession).save(active.cashierSession);
      await manager.getRepository(PosRegisterSession).save(active.registerSession);
      return this.detailView(manager, reconciliation);
    });
  }

  async queue(user: TenantPrincipal) {
    const rows = await this.dataSource.getRepository(PosCashReconciliation).find({
      where: { tenantId: user.tenantId, status: PosCashReconciliationStatus.PENDING_VERIFICATION, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) },
      relations: { location: true, cashierSession: { cashier: true, terminal: true }, registerSession: { register: true } },
      order: { submittedAt: 'ASC' },
    });
    return rows.map((row) => this.view(row));
  }

  async get(id: number, user: TenantPrincipal) {
    const row = await this.load(id, user);
    return this.view(row);
  }

  async verify(id: number, dto: VerifyCashCountDto, user: TenantPrincipal) {
    this.assertAmount(dto.verifiedCountedCash, 'Verified cash');
    return this.dataSource.transaction(async (manager) => {
      const keyUse = await manager.getRepository(PosCashReconciliation).findOneBy({ tenantId: user.tenantId, verificationKey: dto.verificationKey });
      if (keyUse && Number(keyUse.posCashReconciliationId) !== Number(id)) throw new ConflictException('This verification key was already used for another count.');
      const row = await manager.getRepository(PosCashReconciliation).findOne({
        where: { posCashReconciliationId: id, tenantId: user.tenantId },
        relations: { cashierSession: true, registerSession: { register: true } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Cash reconciliation not found.');
      this.assertLocationAccess(row.locationId, user);
      if (row.verificationKey === dto.verificationKey && row.status !== PosCashReconciliationStatus.PENDING_VERIFICATION) return this.view(row);
      if (row.status !== PosCashReconciliationStatus.PENDING_VERIFICATION) throw new ConflictException('This cash count has already been reviewed.');
      if (Number(row.cashierSession.cashierUserId) === Number(user.userId) || Number(row.submittedByUserId) === Number(user.userId)) throw new ForbiddenException('A cashier cannot verify their own cash count.');
      if (row.registerSession.register.registerMode !== PosRegisterMode.TERMINAL_REGISTER) throw new BadRequestException('Only terminal-register counts can be verified in this step.');
      const cashierSession = await manager.getRepository(PosCashierSession).findOne({ where: { posCashierSessionId: row.posCashierSessionId, tenantId: user.tenantId, status: PosCashierSessionStatus.PENDING_VERIFICATION }, lock: { mode: 'pessimistic_write' } });
      const registerSession = await manager.getRepository(PosRegisterSession).findOne({ where: { posRegisterSessionId: row.posRegisterSessionId, tenantId: user.tenantId, status: PosRegisterSessionStatus.PENDING_VERIFICATION }, lock: { mode: 'pessimistic_write' } });
      if (!registerSession || !cashierSession) throw new ConflictException('The linked cashier and register sessions are not awaiting verification.');
      const now = new Date();
      row.verifiedCountedCash = dto.verifiedCountedCash.toFixed(2);
      row.verifiedVariance = money(dto.verifiedCountedCash - Number(row.expectedCash)).toFixed(2);
      row.verifiedByUserId = user.userId;
      row.verifiedAt = now;
      row.verificationKey = dto.verificationKey;
      if (dto.decision === 'REJECT') {
        row.status = PosCashReconciliationStatus.REJECTED;
        row.rejectionReason = dto.rejectionReason!.trim();
        registerSession.status = PosRegisterSessionStatus.RECOUNT_REQUIRED;
        cashierSession.status = PosCashierSessionStatus.RECOUNT_REQUIRED;
      } else {
        row.status = PosCashReconciliationStatus.APPROVED;
        row.rejectionReason = null;
        registerSession.status = PosRegisterSessionStatus.CLOSED;
        registerSession.closedAt = now;
        registerSession.closedByUserId = user.userId;
        cashierSession.status = PosCashierSessionStatus.ENDED;
        cashierSession.endedAt = now;
        cashierSession.endedByUserId = user.userId;
      }
      await manager.getRepository(PosCashReconciliation).save(row);
      await manager.getRepository(PosCashierSession).save(cashierSession);
      await manager.getRepository(PosRegisterSession).save(registerSession);
      return this.view(await manager.getRepository(PosCashReconciliation).findOneOrFail({ where: { posCashReconciliationId: id }, relations: { location: true, cashierSession: { cashier: true, terminal: true }, registerSession: { register: true }, verifiedByUser: true } }));
    });
  }

  async summary(manager: EntityManager, registerSession: PosRegisterSession, cashierSession: PosCashierSession) {
    const payments = await manager.getRepository(InvoicePayment).find({
      where: { posRegisterSessionId: registerSession.posRegisterSessionId, posCashierSessionId: cashierSession.posCashierSessionId },
      relations: { invoice: true },
      order: { invoicePaymentId: 'ASC' },
    });
    const movements = await manager.getRepository(PosCashMovement).find({ where: { posRegisterSessionId: registerSession.posRegisterSessionId, posCashierSessionId: cashierSession.posCashierSessionId }, order: { posCashMovementId: 'ASC' } });
    const refunds = await manager.getRepository(InvoiceRefund).find({
      where: { posRegisterSessionId: registerSession.posRegisterSessionId, posCashierSessionId: cashierSession.posCashierSessionId },
      relations: { payments: true },
    });
    const invoices = await manager.getRepository(Invoice).find({
      where: { posRegisterSessionId: registerSession.posRegisterSessionId, posCashierSessionId: cashierSession.posCashierSessionId },
      relations: { payments: true },
    });
    const cashRows = payments.filter((payment) => payment.paymentMethodTypeSnapshot === PaymentMethodType.CASH);
    const receiptTotals = (rows: InvoicePayment[]) => ({
      tendered: money(rows.reduce((sum, row) => sum + Number(row.tenderedAmount), 0)),
      applied: money(rows.reduce((sum, row) => sum + Number(row.amount), 0)),
      change: money(rows.reduce((sum, row) => sum + Number(row.changeAmount), 0)),
      net: money(rows.reduce((sum, row) => sum + Number(row.tenderedAmount) - Number(row.changeAmount), 0)),
    });
    const saleCash = receiptTotals(cashRows.filter((row) => !row.collectionKey));
    const collectionCash = receiptTotals(cashRows.filter((row) => Boolean(row.collectionKey)));
    const allCash = receiptTotals(cashRows);
    const cardChannels = new Map<string, number>();
    for (const payment of payments.filter((row) => !row.isReversed && row.paymentMethodTypeSnapshot === PaymentMethodType.CARD)) {
      const channel = payment.paymentChannelNameSnapshot || payment.paymentChannelCodeSnapshot || 'Unspecified';
      cardChannels.set(channel, money((cardChannels.get(channel) ?? 0) + Number(payment.amount)));
    }
    const movementIn = money(movements.filter((row) => row.direction === PosCashMovementDirection.IN).reduce((sum, row) => sum + Number(row.amount), 0));
    const movementOut = money(movements.filter((row) => row.direction === PosCashMovementDirection.OUT).reduce((sum, row) => sum + Number(row.amount), 0));
    const openingBalance = money(Number(registerSession.openingBalance));
    const expectedCash = money(openingBalance + allCash.net + movementIn - movementOut);
    const creditInvoices = invoices.filter((invoice) => invoice.isCreditSale);
    const originalCreditExtended = money(creditInvoices.reduce((sum, invoice) => {
      const initialPaid = invoice.payments.filter((payment) => !payment.collectionKey).reduce((total, payment) => total + Number(payment.amount), 0);
      return sum + Math.max(0, Number(invoice.grandTotal) - initialPaid);
    }, 0));
    return {
      posRegisterSessionId: registerSession.posRegisterSessionId,
      posCashierSessionId: cashierSession.posCashierSessionId,
      businessDate: registerSession.businessDate,
      openingBalance,
      cash: {
        sales: saleCash,
        collections: collectionCash,
        received: allCash,
        movementIn,
        paidOut: movementOut,
        movements: movements.map((row) => ({ id: row.posCashMovementId, type: row.movementType, direction: row.direction, amount: Number(row.amount), sourceType: row.sourceType, sourceId: row.sourceId, reason: row.reason, occurredAt: row.occurredAt })),
      },
      cardsByChannel: Array.from(cardChannels, ([channel, amount]) => ({ channel, amount })),
      chequeTotal: money(payments.filter((row) => !row.isReversed && row.paymentMethodTypeSnapshot === PaymentMethodType.CHEQUE).reduce((sum, row) => sum + Number(row.amount), 0)),
      reversedPayments: { count: payments.filter((row) => row.isReversed).length, amount: money(payments.filter((row) => row.isReversed).reduce((sum, row) => sum + Number(row.amount), 0)) },
      creditSales: { count: creditInvoices.length, originalTotal: money(creditInvoices.reduce((sum, invoice) => sum + Number(invoice.grandTotal), 0)), originalCreditExtended, outstanding: money(creditInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount), 0)) },
      refunds: { count: refunds.length, total: money(refunds.reduce((sum, refund) => sum + Number(refund.refundTotal), 0)), paid: money(refunds.reduce((sum, refund) => sum + refund.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0), 0)) },
      historicalUnattributedExcluded: true,
      expectedCash,
      formula: 'opening balance + cash receipts (tendered - change) + explicit cash-in movements - explicit cash-out movements',
    };
  }

  private async load(id: number, user: TenantPrincipal) {
    const row = await this.dataSource.getRepository(PosCashReconciliation).findOne({ where: { posCashReconciliationId: id, tenantId: user.tenantId }, relations: { location: true, cashierSession: { cashier: true, terminal: true }, registerSession: { register: true }, verifiedByUser: true } });
    if (!row) throw new NotFoundException('Cash reconciliation not found.');
    this.assertLocationAccess(row.locationId, user);
    return row;
  }

  private async detailView(manager: EntityManager, row: PosCashReconciliation) {
    const loaded = await manager.getRepository(PosCashReconciliation).findOneOrFail({ where: { posCashReconciliationId: row.posCashReconciliationId }, relations: { location: true, cashierSession: { cashier: true, terminal: true }, registerSession: { register: true }, verifiedByUser: true } });
    return this.view(loaded);
  }

  private view(row: PosCashReconciliation) {
    return {
      posCashReconciliationId: row.posCashReconciliationId,
      locationId: row.locationId,
      location: row.location ? { locationId: row.location.locationId, code: row.location.code, name: row.location.name } : undefined,
      registerSession: row.registerSession ? { posRegisterSessionId: row.registerSession.posRegisterSessionId, businessDate: row.registerSession.businessDate, openingBalance: row.registerSession.openingBalance, status: row.registerSession.status, register: row.registerSession.register ? { displayName: row.registerSession.register.displayName, registerMode: row.registerSession.register.registerMode } : undefined } : undefined,
      cashierSession: row.cashierSession ? { posCashierSessionId: row.cashierSession.posCashierSessionId, cashierUserId: row.cashierSession.cashierUserId, cashierName: row.cashierSession.cashier ? [row.cashierSession.cashier.firstName, row.cashierSession.cashier.lastName].filter(Boolean).join(' ') || row.cashierSession.cashier.username : undefined, terminal: row.cashierSession.terminal ? { terminalCode: row.cashierSession.terminal.terminalCode, displayName: row.cashierSession.terminal.displayName } : undefined, status: row.cashierSession.status } : undefined,
      attemptNumber: row.attemptNumber,
      openingBalance: Number(row.openingBalance),
      cashReceived: Number(row.cashReceived),
      cashPaidOut: Number(row.cashPaidOut),
      expectedCash: Number(row.expectedCash),
      countedCash: Number(row.countedCash),
      cashierVariance: Number(row.cashierVariance),
      summary: row.summarySnapshot,
      submittedByUserId: row.submittedByUserId,
      submittedAt: row.submittedAt,
      status: row.status,
      verifiedCountedCash: row.verifiedCountedCash === null ? null : Number(row.verifiedCountedCash),
      verifiedVariance: row.verifiedVariance === null ? null : Number(row.verifiedVariance),
      verifiedByUserId: row.verifiedByUserId,
      verifiedByUsername: row.verifiedByUser?.username,
      verifiedAt: row.verifiedAt,
      rejectionReason: row.rejectionReason,
    };
  }

  private assertAmount(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0 || money(value) !== value) throw new BadRequestException(`${label} must be nonnegative with at most two decimal places.`);
  }

  private assertLocationAccess(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) throw new ForbiddenException('You do not have access to this location.');
  }
}
