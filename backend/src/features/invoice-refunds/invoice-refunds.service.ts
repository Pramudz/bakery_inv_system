import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoiceDetail } from '../invoices/invoice-detail.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Invoice } from '../invoices/invoice.entity';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PaymentProcessingService } from '../payment-methods/payment-processing.service';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Product } from '../products/products.entity';
import { CreateInvoiceRefundDto } from './dto/create-invoice-refund.dto';
import { ReverseInvoicePaymentDto } from './dto/reverse-invoice-payment.dto';
import { MasterRefundPayoutDto, MasterReversalPayoutDto } from './dto/master-payout.dto';
import { InvoicePaymentReversal } from './invoice-payment-reversal.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceAdjustment } from './invoice-adjustment.entity';
import { CreateInvoiceAdjustmentDto } from './dto/create-invoice-adjustment.dto';
import { createHash, randomUUID } from 'node:crypto';
import { ActivePosSession, PosSessionsService } from '../pos-registers/pos-sessions.service';
import { PosCashFundingSource, PosCashMovement, PosCashMovementDirection, PosCashMovementType } from '../pos-registers/pos-cash-movement.entity';
import { tenantBusinessClock } from '../../common/business-date';
import { nextPosReceiptNumber } from '../invoices/pos-receipt-number';
import { posReceiptHeader } from '../invoices/pos-receipt-header';
import { PosRegisterMode } from '../pos-registers/pos-location-config.entity';
import { snapshotRefundReceipt } from './invoice-refund-receipt';
import { PosPrintService } from '../pos-print/pos-print.service';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { checked, multiply, units } from '../../common/inventory-decimal';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class InvoiceRefundsService {
  private readonly inventoryBalances = new InventoryBalanceService();
  constructor(private readonly dataSource: DataSource, private readonly posSessions: PosSessionsService, private readonly paymentProcessing: PaymentProcessingService = new PaymentProcessingService(), @Optional() private readonly posPrint?: PosPrintService) {}

  list(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoiceRefund).find({ where: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) }, relations: { invoice: { customer: true }, location: true }, order: { invoiceRefundId: 'DESC' } });
  }
  async page(user: TenantPrincipal, requestedPage: number, requestedLimit: number, search = '') {
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
    const query = this.dataSource.getRepository(InvoiceRefund).createQueryBuilder('refund')
      .leftJoinAndSelect('refund.invoice', 'invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('refund.location', 'location')
      .where('refund.tenantId = :tenantId', { tenantId: user.tenantId });
    if (user.accessScope === 'LOCATION') query.andWhere('refund.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.length ? user.assignedLocationIds : [-1] });
    const term = search.trim().slice(0, 100);
    if (term) query.andWhere('(CAST(refund.refundNo AS CHAR) LIKE :term OR refund.refundNumber LIKE :term OR refund.printedLocationCode LIKE :term OR refund.businessDate LIKE :term OR invoice.printedLocationCode LIKE :term OR invoice.printedRegisterCode LIKE :term OR invoice.businessDate LIKE :term OR customer.customerName LIKE :term)', { term: `%${term}%` });
    const [items, total] = await query.orderBy('refund.invoiceRefundId', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit };
  }
  async get(id: number, user: TenantPrincipal) {
    const row = await this.dataSource.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: id, tenantId: user.tenantId }, relations: { invoice: { customer: true }, location: true, details: { product: true, invoiceDetail: true }, payments: { paymentMethod: true, paymentChannel: true } } });
    if (!row) throw new NotFoundException('Invoice refund not found.');
    this.assertLocationAccess(row.locationId, user);
    return row;
  }

  async outcomeByKey(invoiceId: number, refundKey: string, user: TenantPrincipal) {
    const invoice = await this.dataSource.getRepository(Invoice).findOneBy({ invoiceId, tenantId: user.tenantId });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    this.assertLocationAccess(invoice.locationId, user);
    const refund = await this.dataSource.getRepository(InvoiceRefund).findOneBy({ tenantId: user.tenantId, refundKey });
    if (!refund) throw new NotFoundException('Refund outcome not found.');
    if (Number(refund.invoiceId) !== Number(invoiceId)) throw new ConflictException('This refund key belongs to another invoice.');
    return this.get(refund.invoiceRefundId, user);
  }

  listAdjustments(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoiceAdjustment).find({ where: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { invoice: { locationId: In(user.assignedLocationIds) } } : {}) }, relations: { invoice: { customer: true }, invoiceDetail: { product: true }, paymentMethod: true }, order: { invoiceAdjustmentId: 'DESC' } });
  }

  async createAdjustment(dto: CreateInvoiceAdjustmentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOneBy({ invoiceId: dto.invoiceId, tenantId: user.tenantId });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      this.assertLocationAccess(invoice.locationId, user);
      const line = await manager.getRepository(InvoiceDetail).findOne({ where: { invoiceDetailId: dto.invoiceDetailId, invoiceId: invoice.invoiceId }, relations: { product: true } });
      if (!line) throw new NotFoundException('Invoice line not found.');
      const previous = await manager.getRepository(InvoiceAdjustment).findOne({ where: { invoiceDetailId: line.invoiceDetailId, status: 'SETTLED' }, order: { invoiceAdjustmentId: 'DESC' } });
      const gross = Number(line.grossTotal);
      const originalPercentage = previous ? Number(previous.correctedDiscountPercentage) : Number(line.discountPercentage);
      const originalAmount = previous ? Number(previous.correctedDiscountAmount) : Number(line.discountAmount);
      const correctedAmount = money(dto.correctedDiscountPercentage !== undefined ? gross * dto.correctedDiscountPercentage / 100 : Number(dto.correctedDiscountAmount));
      if (correctedAmount > gross) throw new BadRequestException('Corrected discount cannot exceed the line gross total.');
      if (correctedAmount === money(originalAmount)) throw new BadRequestException('Corrected discount is the same as the current discount.');
      const correctedPercentage = gross > 0 ? correctedAmount / gross * 100 : 0;
      const adjustmentAmount = money(Math.abs(correctedAmount - originalAmount));
      const adjustmentType: 'CREDIT' | 'DEBIT' = correctedAmount > originalAmount ? 'CREDIT' : 'DEBIT';
      if (dto.paymentMethodId && !(await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: dto.paymentMethodId, tenantId: user.tenantId, isActive: true }))) throw new NotFoundException('Settlement payment method not found.');
      const repo = manager.getRepository(InvoiceAdjustment);
      const adjustment = await repo.save(repo.create({ tenantId: user.tenantId, invoiceId: invoice.invoiceId, invoiceDetailId: line.invoiceDetailId, adjustmentNumber: `PENDING-${Date.now()}-${user.userId}`, adjustmentDate: new Date(), adjustmentType, reason: dto.reason.trim(), originalDiscountPercentage: originalPercentage.toFixed(4), originalDiscountAmount: money(originalAmount).toFixed(2), correctedDiscountPercentage: correctedPercentage.toFixed(4), correctedDiscountAmount: correctedAmount.toFixed(2), adjustmentAmount: adjustmentAmount.toFixed(2), paymentMethodId: dto.paymentMethodId ?? null, status: dto.paymentMethodId ? 'SETTLED' : 'PENDING', createdByUserId: user.userId }));
      adjustment.adjustmentNumber = `ADJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(adjustment.invoiceAdjustmentId).padStart(6, '0')}`;
      return repo.save(adjustment);
    });
  }

  async refundableInvoice(id: number, user: TenantPrincipal) {
    const invoice = await this.dataSource.getRepository(Invoice).findOne({ where: { invoiceId: id, tenantId: user.tenantId }, relations: { customer: true, location: true, details: { product: true }, payments: { paymentMethod: true, paymentChannel: true } } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    this.assertLocationAccess(invoice.locationId, user);
    const sums = await this.refundedQuantities(invoice.details.map((x) => x.invoiceDetailId));
    const refundedAmounts = await this.refundedAmounts(invoice.details.map((x) => x.invoiceDetailId));
    const previousRefunds = await this.dataSource.getRepository(InvoiceRefund).find({ where: { invoiceId: id, tenantId: user.tenantId, status: 'COMPLETED' }, relations: { payments: true }, order: { invoiceRefundId: 'ASC' } });
    return { ...invoice, previousRefunds, originalPaymentPosition: { paidAmount: invoice.receiptSnapshot?.paidAmount ?? invoice.paidAmount, balanceAmount: invoice.receiptSnapshot?.balanceAmount ?? invoice.balanceAmount }, refundablePaymentAmount: await this.remainingPayment(invoice), details: invoice.details.map((line) => ({ ...line, refundedQuantity: sums.get(Number(line.invoiceDetailId)) ?? 0, refundableQuantity: Math.max(0, Number(line.quantity) - (sums.get(Number(line.invoiceDetailId)) ?? 0)), refundableAmount: money(Math.max(0, Number(line.netTotal) - (refundedAmounts.get(Number(line.invoiceDetailId)) ?? 0))) })) };
  }

  async reprint(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const refund = await manager.getRepository(InvoiceRefund).findOneBy({ invoiceRefundId: id, tenantId: user.tenantId });
      if (!refund) throw new NotFoundException('Refund not found.');
      this.assertLocationAccess(refund.locationId, user);
      if (!refund.receiptSnapshot) throw new BadRequestException('No archived refund receipt exists for this legacy record.');
      return this.posPrint!.auditReprint(manager, 'REFUND', id, user, refund.locationId);
    });
  }

  async lookupSale(businessDate: string, locationCode: string, registerCode: string, billNo: number, user: TenantPrincipal) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !Number.isSafeInteger(billNo) || billNo < 1 || !locationCode?.trim() || !registerCode?.trim()) {
      throw new BadRequestException('Enter the Date, Location, POS/Register, and Bill No exactly as printed on the sale receipt.');
    }
    const rows = await this.dataSource.getRepository(Invoice).find({ where: {
      tenantId: user.tenantId, businessDate, printedLocationCode: locationCode.trim().toUpperCase(),
      printedRegisterCode: registerCode.trim().toUpperCase(), billNo,
    }, take: 2 });
    if (!rows.length) throw new NotFoundException('No sale matches those printed receipt fields. Check all four fields.');
    if (rows.length > 1) throw new ConflictException('The printed reference is ambiguous. Contact an administrator.');
    this.assertLocationAccess(rows[0].locationId, user);
    return this.refundableInvoice(rows[0].invoiceId, user);
  }

  async create(dto: CreateInvoiceRefundDto, user: TenantPrincipal, credential?: string) {
    if (!dto.refundKey) throw new BadRequestException('A refund key is required for retry-safe posting.');
    const refundFingerprint = this.fingerprint({ invoiceId: dto.invoiceId, reason: dto.reason.trim(), details: dto.details, payments: dto.payments ?? [] });
    // Each read after the invoice row lock must see the latest committed refund.
    try {
      return await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const refundKey = dto.refundKey;
      const prior = await manager.getRepository(InvoiceRefund).findOneBy({ tenantId: user.tenantId, refundKey });
      if (prior) {
        this.assertLocationAccess(prior.locationId, user);
        if (prior.refundFingerprint !== refundFingerprint) throw new ConflictException('This refund key was already used for different refund data.');
        return this.getWithManager(manager, prior.invoiceRefundId, user.tenantId);
      }
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId: dto.invoiceId, tenantId: user.tenantId }, relations: { details: { product: true } }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      this.assertLocationAccess(invoice.locationId, user);
      const committed = await manager.getRepository(InvoiceRefund).findOneBy({ tenantId: user.tenantId, refundKey });
      if (committed) {
        if (committed.refundFingerprint !== refundFingerprint) throw new ConflictException('This refund key was already used for different refund data.');
        return this.getWithManager(manager, committed.invoiceRefundId, user.tenantId);
      }
      if (invoice.invoiceStatus === 'FULLY_REFUNDED') throw new BadRequestException('Invoice is already fully refunded.');
      const requestedIds = dto.details.map((x) => x.invoiceDetailId);
      if (new Set(requestedIds).size !== requestedIds.length) throw new BadRequestException('A refund line cannot be selected more than once.');
      const originalLines = invoice.details.filter((x) => requestedIds.includes(Number(x.invoiceDetailId)));
      if (originalLines.length !== requestedIds.length) throw new BadRequestException('One or more invoice lines are invalid.');
      const saleLedgers = await manager.getRepository(InventoryLedger).find({ where: {
        tenantId: user.tenantId, sourceDocumentType: 'INVOICE', sourceDocumentId: invoice.invoiceId,
        sourceDocumentLineId: In(requestedIds), movementType: 'SALE',
      } });
      const saleCostByLine = new Map(saleLedgers.map(row => [Number(row.sourceDocumentLineId), row.unitCost]));
      const previous = await this.refundedQuantities(invoice.details.map((line) => line.invoiceDetailId), manager);
      const previousAmounts = await this.refundedAmounts(invoice.details.map((line) => line.invoiceDetailId), manager);
      const prepared = dto.details.map((request) => {
        const line = originalLines.find((x) => Number(x.invoiceDetailId) === request.invoiceDetailId)!;
        const stockItem = line.product.isStockItem;
        const returnToStock = stockItem && request.returnToStock !== false;
        const originalUnitCost = stockItem ? line.unitCostSnapshot ?? saleCostByLine.get(Number(line.invoiceDetailId)) ?? null : '0.0000';
        if (returnToStock && originalUnitCost === null) {
          throw new ConflictException(`Original sale cost is unavailable for ${line.product.productName}; stock cannot be returned at an invented cost.`);
        }
        const cogsReversal = returnToStock
          ? checked(multiply(units(String(request.quantity)), units(originalUnitCost!))) : '0.0000';
        const refundable = Number(line.quantity) - (previous.get(Number(line.invoiceDetailId)) ?? 0);
        if (request.quantity > refundable) throw new BadRequestException(`Refund quantity exceeds the available quantity for ${line.product.productName}.`);
        const ratio = request.quantity / Number(line.quantity);
        let gross = money(Number(line.grossTotal) * ratio);
        let discount = money(Number(line.discountAmount) * ratio);
        const remainingAmount = money(Math.max(0, Number(line.netTotal) - (previousAmounts.get(Number(line.invoiceDetailId)) ?? 0)));
        const total = request.quantity === refundable ? remainingAmount : money(gross - discount);
        if (total > remainingAmount) throw new BadRequestException(`Refund amount exceeds the remaining value for ${line.product.productName}.`);
        if (request.quantity === refundable) {
          gross = Math.max(gross, total);
          discount = money(gross - total);
        }
        return { request, line, gross, discount, total, originalUnitCost, cogsReversal, returnToStock };
      });
      const subtotal = money(prepared.reduce((sum, x) => sum + x.gross, 0));
      const discountTotal = money(prepared.reduce((sum, x) => sum + x.discount, 0));
      const refundTotal = money(prepared.reduce((sum, x) => sum + x.total, 0));
      for (const payment of dto.payments ?? []) {
        if (!Number.isFinite(payment.amount) || payment.amount <= 0 || money(payment.amount) !== payment.amount) {
          throw new BadRequestException('Refund payment amounts must be positive with at most two decimal places.');
        }
      }
      const paymentTotal = money((dto.payments ?? []).reduce((sum, x) => sum + Number(x.amount), 0));
      if (paymentTotal > refundTotal) throw new BadRequestException('Refund payments cannot exceed the refund total.');
      const remainingPayment = await this.remainingPayment(invoice, manager);
      if (paymentTotal > remainingPayment) throw new BadRequestException(`Refund payment exceeds the remaining paid amount of ${remainingPayment.toFixed(2)}.`);

      const preparedPayments = [];
      for (const payment of dto.payments ?? []) {
        const configuration = await this.paymentProcessing.configuration(manager, user.tenantId, payment);
        preparedPayments.push({ payment, ...configuration });
      }
      let activeSession: ActivePosSession | null = null;
      if (preparedPayments.some(({ method }) => method.paymentMethodType === PaymentMethodType.CASH) || (preparedPayments.length > 0 && Boolean(credential?.trim()))) {
        activeSession = await this.posSessions.requireCashierSession(manager, credential, user, invoice.locationId, true);
      }

      const repo = manager.getRepository(InvoiceRefund);
      const refund = await repo.save(repo.create({ tenantId: user.tenantId, locationId: invoice.locationId, refundKey, refundFingerprint, posTerminalId: activeSession?.terminal?.posTerminalId ?? null, posRegisterSessionId: activeSession?.registerSession.posRegisterSessionId ?? null, posCashierSessionId: activeSession?.cashierSession.posCashierSessionId ?? null, invoiceId: invoice.invoiceId, refundNumber: `PENDING-${Date.now()}-${user.userId}`, refundDate: new Date(), reason: dto.reason.trim(), subtotal: subtotal.toFixed(2), discountTotal: discountTotal.toFixed(2), refundTotal: refundTotal.toFixed(2), status: 'COMPLETED', createdByUserId: user.userId, approvedByUserId: null }));
      refund.refundNumber = this.refundNumber(refund.invoiceRefundId);
      await repo.save(refund);
      const stockReturns: InvoiceRefundDetail[] = [];
      for (const [index, item] of prepared.entries()) {
        const detail = await manager.getRepository(InvoiceRefundDetail).save(manager.getRepository(InvoiceRefundDetail).create({
          invoiceRefundId: refund.invoiceRefundId, lineNumber: index + 1, invoiceDetailId: item.line.invoiceDetailId,
          productId: item.line.productId, quantity: String(item.request.quantity), unitPrice: item.line.unitPrice,
          discountPercentage: item.line.discountPercentage, discountAmount: item.discount.toFixed(2),
          refundAmount: item.total.toFixed(2), returnToStock: item.returnToStock,
          originalUnitCostSnapshot: item.originalUnitCost, cogsReversalAmount: item.cogsReversal,
          refundTaxableAmount: item.total.toFixed(2), taxRefundAmount: '0.00', taxRateSnapshot: '0.0000',
        }));
        if (detail.returnToStock) stockReturns.push(detail);
      }
      for (const detail of stockReturns.sort((a, b) => Number(a.productId) - Number(b.productId))) {
        await this.restoreStock(manager, invoice, detail, user);
      }
      for (const { payment, method, channel, referenceNumber } of preparedPayments) {
        const refundPayment = await manager.getRepository(InvoiceRefundPayment).save(manager.getRepository(InvoiceRefundPayment).create({
          invoiceRefundId: refund.invoiceRefundId, paymentMethodId: method.paymentMethodId, paymentMethodTypeSnapshot: method.paymentMethodType,
          paymentChannelId: channel?.paymentChannelId ?? null, paymentChannelCodeSnapshot: channel?.code ?? null,
          paymentChannelNameSnapshot: channel?.name ?? null,
          amount: money(payment.amount).toFixed(2), referenceNumber, refundedAt: new Date(), createdByUserId: user.userId,
          posTerminalId: activeSession?.terminal?.posTerminalId ?? null,
          posRegisterSessionId: activeSession?.registerSession.posRegisterSessionId ?? null,
          posCashierSessionId: activeSession?.cashierSession.posCashierSessionId ?? null,
        }));
        if (method.paymentMethodType === PaymentMethodType.CASH) {
          await manager.getRepository(PosCashMovement).save(manager.getRepository(PosCashMovement).create({
            tenantId: user.tenantId,
            locationId: invoice.locationId,
            posRegisterSessionId: activeSession!.registerSession.posRegisterSessionId,
            posCashierSessionId: activeSession!.cashierSession.posCashierSessionId,
            fundingSource: PosCashFundingSource.CASHIER_SESSION,
            movementType: PosCashMovementType.REFUND_PAYOUT,
            direction: PosCashMovementDirection.OUT,
            amount: money(payment.amount).toFixed(2),
            sourceType: 'INVOICE_REFUND_PAYMENT',
            sourceId: refundPayment.invoiceRefundPaymentId,
            reason: dto.reason.trim(),
            physicalPayerIdentity: null,
            payoutKey: null,
            payoutFingerprint: null,
            occurredAt: refundPayment.refundedAt,
            createdByUserId: user.userId,
          }));
        }
      }
      const fullyReturned = invoice.details.every((line) => (previous.get(Number(line.invoiceDetailId)) ?? 0) + (dto.details.find((item) => item.invoiceDetailId === Number(line.invoiceDetailId))?.quantity ?? 0) >= Number(line.quantity));
      invoice.invoiceStatus = fullyReturned ? 'FULLY_REFUNDED' : 'PARTIALLY_REFUNDED';
      await this.recalculateInvoicePayments(manager, invoice);
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const header = await posReceiptHeader(manager, user.tenantId, invoice.locationId,
        activeSession?.cashierSession.cashierUserId ?? refund.createdByUserId);
      refund.businessDate = clock.businessDate;
      refund.printedLocationCode = header.locationCode;
      refund.printedRegisterCode = activeSession
        ? activeSession.config.registerMode === PosRegisterMode.MASTER_REGISTER ? activeSession.register.receiptCode || 'MASTER' : activeSession.terminal!.terminalCode.trim().toUpperCase()
        : null;
      refund.refundNo = await nextPosReceiptNumber(manager, 'REFUND', user.tenantId, clock.businessDate, header.locationCode);
      refund.issuedAt = clock.now;
      const completed = (await this.getWithManager(manager, refund.invoiceRefundId, user.tenantId))!;
      Object.assign(completed, { businessDate: refund.businessDate, printedLocationCode: refund.printedLocationCode, printedRegisterCode: refund.printedRegisterCode, refundNo: refund.refundNo, issuedAt: refund.issuedAt });
      refund.receiptSnapshot = snapshotRefundReceipt(completed, invoice, header);
      await repo.save(refund);
      completed.receiptSnapshot = refund.receiptSnapshot;
      return completed;
      });
    } catch (error) {
      if (!this.isRefundKeyConflict(error)) throw error;
      const committed = await this.dataSource.getRepository(InvoiceRefund).findOneBy({ tenantId: user.tenantId, refundKey: dto.refundKey });
      if (!committed) throw error;
      this.assertLocationAccess(committed.locationId, user);
      if (committed.refundFingerprint !== refundFingerprint) throw new ConflictException('This refund key was already used for different refund data.');
      return this.getWithManager(this.dataSource.manager, committed.invoiceRefundId, user.tenantId);
    }
  }

  async reversePayment(invoiceId: number, paymentId: number, dto: ReverseInvoicePaymentDto, user: TenantPrincipal, credential?: string) {
    return this.dataSource.transaction(async (manager) => {
      const reversalKey = dto.reversalKey ?? randomUUID();
      const reversalFingerprint = this.fingerprint({ invoiceId, paymentId, reason: dto.reason.trim(), replacementPaymentMethodId: dto.replacementPaymentMethodId ?? null, replacementPaymentChannelId: dto.replacementPaymentChannelId ?? null, replacementAmount: dto.replacementAmount ?? null, referenceNumber: dto.referenceNumber?.trim() || null, cashPayout: dto.cashPayout === true });
      const prior = await manager.getRepository(InvoicePaymentReversal).findOne({ where: { reversalKey }, relations: { invoicePayment: { invoice: true } } });
      if (prior) {
        if (Number(prior.invoicePayment.invoice.tenantId) !== Number(user.tenantId)) throw new NotFoundException('Invoice payment not found.');
        this.assertLocationAccess(prior.invoicePayment.invoice.locationId, user);
        if (Number(prior.invoicePaymentId) !== Number(paymentId) || Number(prior.invoicePayment.invoiceId) !== Number(invoiceId)) throw new ConflictException('This reversal key was already used for another payment.');
        if (prior.reversalFingerprint && prior.reversalFingerprint !== reversalFingerprint) throw new ConflictException('This reversal key was already used for different reversal data.');
        return manager.getRepository(Invoice).findOne({ where: { invoiceId, tenantId: user.tenantId }, relations: { payments: { paymentMethod: true, paymentChannel: true } } });
      }
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      this.assertLocationAccess(invoice.locationId, user);
      const payment = await manager.getRepository(InvoicePayment).findOne({ where: { invoicePaymentId: paymentId, invoiceId }, relations: { paymentChannel: true, paymentMethod: true }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Invoice payment not found.');
      if (payment.isReversed) throw new BadRequestException('Payment is already reversed.');
      const paymentType = payment.paymentMethodTypeSnapshot ?? payment.paymentMethod.paymentMethodType;
      if (dto.cashPayout && paymentType !== PaymentMethodType.CASH) throw new BadRequestException('A physical cash payout can be recorded only when reversing a cash payment.');
      let activeSession: ActivePosSession | null = null;
      if ((dto.replacementPaymentMethodId && dto.replacementAmount) || dto.cashPayout) activeSession = await this.posSessions.requireCashierSession(manager, credential, user, invoice.locationId, true);
      const reversal = await manager.getRepository(InvoicePaymentReversal).save(manager.getRepository(InvoicePaymentReversal).create({ invoicePaymentId: payment.invoicePaymentId, reversalKey, reversalFingerprint, reversalAmount: payment.amount, reason: dto.reason.trim(), reversedAt: new Date(), reversedByUserId: user.userId }));
      payment.isReversed = true; payment.reversedAt = new Date(); await manager.getRepository(InvoicePayment).save(payment);
      if (dto.cashPayout) {
        const payout = money(Number(payment.tenderedAmount) - Number(payment.changeAmount));
        if (payout <= 0) throw new BadRequestException('The reversed payment has no net cash receipt to pay out.');
        await manager.getRepository(PosCashMovement).save(manager.getRepository(PosCashMovement).create({
          tenantId: user.tenantId,
          locationId: invoice.locationId,
          posRegisterSessionId: activeSession!.registerSession.posRegisterSessionId,
          posCashierSessionId: activeSession!.cashierSession.posCashierSessionId,
          fundingSource: PosCashFundingSource.CASHIER_SESSION,
          movementType: PosCashMovementType.PAYMENT_REVERSAL_PAYOUT,
          direction: PosCashMovementDirection.OUT,
          amount: payout.toFixed(2),
          sourceType: 'INVOICE_PAYMENT_REVERSAL',
          sourceId: reversal.paymentReversalId,
          reason: dto.reason.trim(),
          physicalPayerIdentity: null,
          payoutKey: null,
          payoutFingerprint: null,
          occurredAt: reversal.reversedAt,
          createdByUserId: user.userId,
        }));
      }
      if (dto.replacementPaymentMethodId && dto.replacementAmount) {
        const beforeReplacement = await this.invoicePaymentState(manager, invoice);
        const remaining = beforeReplacement.balance;
        const [replacement] = await this.paymentProcessing.prepare(manager, user.tenantId, [{ paymentMethodId: dto.replacementPaymentMethodId, paymentChannelId: dto.replacementPaymentChannelId, amount: dto.replacementAmount, referenceNumber: dto.referenceNumber }], remaining);
        const replacementBalance = money(remaining - replacement.applied);
        await manager.getRepository(InvoicePayment).save(manager.getRepository(InvoicePayment).create({
          invoiceId, paymentMethodId: replacement.method.paymentMethodId, paymentMethodTypeSnapshot: replacement.method.paymentMethodType,
          paymentChannelId: replacement.channel?.paymentChannelId ?? null, paymentChannelCodeSnapshot: replacement.channel?.code ?? null,
          paymentChannelNameSnapshot: replacement.channel?.name ?? null,
          amount: replacement.applied.toFixed(2), tenderedAmount: replacement.tendered.toFixed(2), changeAmount: replacement.change.toFixed(2),
          referenceNumber: replacement.referenceNumber, paidAt: new Date(), createdByUserId: user.userId, isReversed: false, reversedAt: null,
          collectionKey: payment.collectionKey ? randomUUID() : null,
          balanceBefore: payment.collectionKey ? remaining.toFixed(2) : null,
          balanceAfter: payment.collectionKey ? replacementBalance.toFixed(2) : null,
          posTerminalId: activeSession!.terminal?.posTerminalId ?? null,
          posRegisterSessionId: activeSession!.registerSession.posRegisterSessionId,
          posCashierSessionId: activeSession!.cashierSession.posCashierSessionId,
        }));
      }
      await this.recalculateInvoicePayments(manager, invoice);
      return manager.getRepository(Invoice).findOne({ where: { invoiceId }, relations: { payments: { paymentMethod: true, paymentChannel: true } } });
    });
  }

  async recordMasterRefundPayout(refundId: number, dto: MasterRefundPayoutDto, user: TenantPrincipal) {
    this.assertPayoutDto(dto.amount, dto.reason, dto.physicalPayerIdentity);
    const fingerprint = this.fingerprint({ type: 'MASTER_REFUND_PAYOUT', refundId, locationId: dto.locationId, posRegisterSessionId: dto.posRegisterSessionId, paymentMethodId: dto.paymentMethodId, amount: money(dto.amount), reason: dto.reason.trim(), physicalPayerIdentity: dto.physicalPayerIdentity.trim() });
    return this.dataSource.transaction(async (manager) => {
      const prior = await manager.getRepository(PosCashMovement).findOneBy({ tenantId: user.tenantId, payoutKey: dto.payoutKey });
      if (prior) {
        if (prior.payoutFingerprint !== fingerprint) throw new ConflictException('This payout key was already used for different data.');
        this.assertLocationAccess(prior.locationId, user);
        return prior;
      }
      const refund = await manager.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: refundId, tenantId: user.tenantId, status: 'COMPLETED' }, relations: { payments: true }, lock: { mode: 'pessimistic_write' } });
      if (!refund) throw new NotFoundException('Completed invoice refund not found.');
      this.assertLocationAccess(refund.locationId, user);
      if (Number(refund.locationId) !== Number(dto.locationId)) throw new BadRequestException('The selected master register belongs to a different location.');
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId: refund.invoiceId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      const active = await this.posSessions.requireOpenMasterRegisterSession(manager, dto.posRegisterSessionId, dto.locationId, user, true);
      const method = await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: dto.paymentMethodId, tenantId: user.tenantId, isActive: true });
      if (!method || method.paymentMethodType !== PaymentMethodType.CASH) throw new BadRequestException('An active CASH payment method is required for a master-funded refund payout.');
      const alreadyPaid = money(refund.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const remaining = money(Math.max(0, Number(refund.refundTotal) - alreadyPaid));
      if (dto.amount > remaining) throw new BadRequestException(`Master payout exceeds the refund's remaining payable amount of ${remaining.toFixed(2)}.`);
      const refundedAt = new Date();
      const refundPayment = await manager.getRepository(InvoiceRefundPayment).save(manager.getRepository(InvoiceRefundPayment).create({
        invoiceRefundId: refund.invoiceRefundId, paymentMethodId: method.paymentMethodId, paymentMethodTypeSnapshot: PaymentMethodType.CASH,
        paymentChannelId: null, paymentChannelCodeSnapshot: null, paymentChannelNameSnapshot: null, amount: money(dto.amount).toFixed(2), referenceNumber: null,
        refundedAt, createdByUserId: user.userId, posTerminalId: null, posRegisterSessionId: active.registerSession.posRegisterSessionId, posCashierSessionId: null,
      }));
      const movement = await manager.getRepository(PosCashMovement).save(manager.getRepository(PosCashMovement).create({
        tenantId: user.tenantId, locationId: dto.locationId, posRegisterSessionId: active.registerSession.posRegisterSessionId, posCashierSessionId: null,
        fundingSource: PosCashFundingSource.MASTER_REGISTER, movementType: PosCashMovementType.REFUND_PAYOUT, direction: PosCashMovementDirection.OUT,
        amount: money(dto.amount).toFixed(2), sourceType: 'INVOICE_REFUND_PAYMENT', sourceId: refundPayment.invoiceRefundPaymentId,
        reason: dto.reason.trim(), physicalPayerIdentity: dto.physicalPayerIdentity.trim(), payoutKey: dto.payoutKey, payoutFingerprint: fingerprint,
        occurredAt: refundedAt, createdByUserId: user.userId,
      }));
      await this.recalculateInvoicePayments(manager, invoice);
      return movement;
    });
  }

  async recordMasterReversalPayout(reversalId: number, dto: MasterReversalPayoutDto, user: TenantPrincipal) {
    this.assertPayoutDto(dto.amount, dto.reason, dto.physicalPayerIdentity);
    const fingerprint = this.fingerprint({ type: 'MASTER_REVERSAL_PAYOUT', reversalId, locationId: dto.locationId, posRegisterSessionId: dto.posRegisterSessionId, amount: money(dto.amount), reason: dto.reason.trim(), physicalPayerIdentity: dto.physicalPayerIdentity.trim() });
    return this.dataSource.transaction(async (manager) => {
      const prior = await manager.getRepository(PosCashMovement).findOneBy({ tenantId: user.tenantId, payoutKey: dto.payoutKey });
      if (prior) {
        if (prior.payoutFingerprint !== fingerprint) throw new ConflictException('This payout key was already used for different data.');
        this.assertLocationAccess(prior.locationId, user);
        return prior;
      }
      const reversal = await manager.getRepository(InvoicePaymentReversal).findOne({ where: { paymentReversalId: reversalId }, relations: { invoicePayment: { invoice: true, paymentMethod: true } }, lock: { mode: 'pessimistic_write' } });
      if (!reversal || Number(reversal.invoicePayment.invoice.tenantId) !== Number(user.tenantId)) throw new NotFoundException('Payment reversal not found.');
      const invoice = reversal.invoicePayment.invoice;
      this.assertLocationAccess(invoice.locationId, user);
      if (Number(invoice.locationId) !== Number(dto.locationId)) throw new BadRequestException('The selected master register belongs to a different location.');
      const paymentType = reversal.invoicePayment.paymentMethodTypeSnapshot ?? reversal.invoicePayment.paymentMethod.paymentMethodType;
      if (paymentType !== PaymentMethodType.CASH) throw new BadRequestException('Only a reversed CASH payment can be paid from the master drawer.');
      const authorizedAmount = money(Number(reversal.invoicePayment.tenderedAmount) - Number(reversal.invoicePayment.changeAmount));
      if (money(dto.amount) !== authorizedAmount) throw new BadRequestException(`The physical payout must equal the reversed net cash receipt of ${authorizedAmount.toFixed(2)}.`);
      const existing = await manager.getRepository(PosCashMovement).findOneBy({ tenantId: user.tenantId, sourceType: 'INVOICE_PAYMENT_REVERSAL', sourceId: reversal.paymentReversalId });
      if (existing) throw new ConflictException('This payment reversal already has a physical cash payout.');
      const active = await this.posSessions.requireOpenMasterRegisterSession(manager, dto.posRegisterSessionId, dto.locationId, user, true);
      return manager.getRepository(PosCashMovement).save(manager.getRepository(PosCashMovement).create({
        tenantId: user.tenantId, locationId: dto.locationId, posRegisterSessionId: active.registerSession.posRegisterSessionId, posCashierSessionId: null,
        fundingSource: PosCashFundingSource.MASTER_REGISTER, movementType: PosCashMovementType.PAYMENT_REVERSAL_PAYOUT, direction: PosCashMovementDirection.OUT,
        amount: authorizedAmount.toFixed(2), sourceType: 'INVOICE_PAYMENT_REVERSAL', sourceId: reversal.paymentReversalId,
        reason: dto.reason.trim(), physicalPayerIdentity: dto.physicalPayerIdentity.trim(), payoutKey: dto.payoutKey, payoutFingerprint: fingerprint,
        occurredAt: new Date(), createdByUserId: user.userId,
      }));
    });
  }

  private async remainingPayment(invoice: Invoice, manager = this.dataSource.manager) {
    const refunds = await manager.getRepository(InvoiceRefund).find({
      where: { invoiceId: invoice.invoiceId, tenantId: invoice.tenantId, status: 'COMPLETED' },
      relations: { payments: true },
    });
    const adjustments = await manager.getRepository(InvoiceAdjustment).find({
      where: { invoiceId: invoice.invoiceId, tenantId: invoice.tenantId, status: 'SETTLED' },
    });
    const paidBack = refunds.reduce((sum, refund) => sum + refund.payments.reduce((total, payment) => total + Number(payment.amount), 0), 0);
    const adjusted = adjustments.reduce((sum, adjustment) => sum + (adjustment.adjustmentType === 'DEBIT' ? 1 : -1) * Number(adjustment.adjustmentAmount), 0);
    return Math.max(0, money(Number(invoice.paidAmount) + adjusted - paidBack));
  }

  private async refundedQuantities(ids: number[], manager?: EntityManager) {
    const repo = (manager ?? this.dataSource.manager).getRepository(InvoiceRefundDetail);
    if (!ids.length) return new Map<number, number>();
    const rows = await repo.createQueryBuilder('detail').innerJoin('detail.invoiceRefund', 'refund', 'refund.status = :status', { status: 'COMPLETED' }).select('detail.invoiceDetailId', 'invoiceDetailId').addSelect('SUM(detail.quantity)', 'quantity').where({ invoiceDetailId: In(ids) }).groupBy('detail.invoiceDetailId').getRawMany();
    return new Map(rows.map((x) => [Number(x.invoiceDetailId), Number(x.quantity)]));
  }
  private async refundedAmounts(ids: number[], manager?: EntityManager) {
    if (!ids.length) return new Map<number, number>();
    const rows = await (manager ?? this.dataSource.manager).getRepository(InvoiceRefundDetail)
      .createQueryBuilder('detail')
      .innerJoin('detail.invoiceRefund', 'refund', 'refund.status = :status', { status: 'COMPLETED' })
      .select('detail.invoiceDetailId', 'invoiceDetailId')
      .addSelect('SUM(detail.refundAmount)', 'amount')
      .where({ invoiceDetailId: In(ids) })
      .groupBy('detail.invoiceDetailId')
      .getRawMany();
    return new Map(rows.map((row) => [Number(row.invoiceDetailId), money(Number(row.amount ?? 0))]));
  }
  private async restoreStock(manager: EntityManager, invoice: Invoice, detail: InvoiceRefundDetail, user: TenantPrincipal) {
    const repo = manager.getRepository(InventoryBalance);
    let balance = await repo.findOne({ where: { tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId }, lock: { mode: 'pessimistic_write' } });
    if (!balance) balance = repo.create({ tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId, quantityOnHand: '0', averageCost: '0', lastMovementAt: null });
    const movementValue = detail.cogsReversalAmount;
    if (movementValue === null || detail.originalUnitCostSnapshot === null) throw new ConflictException('Original sale cost is required for a stock return.');
    const snapshot = this.inventoryBalances.inboundValueSnapshot(balance, detail.quantity, movementValue);
    balance.quantityOnHand = snapshot.quantityAfter;
    balance.averageCost = snapshot.averageCostAfter;
    balance.lastMovementAt = new Date();
    await repo.save(balance);
    await manager.getRepository(InventoryLedger).save(manager.getRepository(InventoryLedger).create({
      tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId,
      movementDate: new Date(), movementType: 'SALE_RETURN', sourceDocumentType: 'INVOICE_REFUND',
      sourceDocumentId: detail.invoiceRefundId, sourceDocumentLineId: detail.invoiceRefundDetailId,
      quantityIn: detail.quantity, quantityOut: '0', unitCost: detail.originalUnitCostSnapshot, movementValue,
      quantityBefore: snapshot.quantityBefore, quantityAfter: snapshot.quantityAfter,
      averageCostBefore: snapshot.averageCostBefore, averageCostAfter: snapshot.averageCostAfter,
      createdByUserId: user.userId,
    }));
  }
  private async recalculateInvoicePayments(manager: EntityManager, invoice: Invoice) {
    const state = await this.invoicePaymentState(manager, invoice);
    invoice.tenderedAmount = state.tendered.toFixed(2);
    invoice.paidAmount = state.paid.toFixed(2);
    invoice.changeAmount = state.change.toFixed(2);
    invoice.balanceAmount = state.balance.toFixed(2);
    invoice.paymentStatus = state.balance === 0 ? 'PAID' : state.netPaid === 0 ? 'UNPAID' : 'PARTIALLY_PAID';
    await manager.getRepository(Invoice).save(invoice);
  }
  private async invoicePaymentState(manager: EntityManager, invoice: Invoice) {
    const payments = await manager.getRepository(InvoicePayment).findBy({ invoiceId: invoice.invoiceId, isReversed: false });
    const tendered = money(payments.reduce((sum, x) => sum + Number(x.tenderedAmount), 0));
    const paid = money(payments.reduce((sum, x) => sum + Number(x.amount), 0));
    const change = money(payments.reduce((sum, x) => sum + Number(x.changeAmount), 0));
    const refunds = await manager.getRepository(InvoiceRefund).find({
      where: { invoiceId: invoice.invoiceId, tenantId: invoice.tenantId, status: 'COMPLETED' },
      relations: { payments: true },
    });
    const refundedTotal = money(refunds.reduce((sum, refund) => sum + Number(refund.refundTotal), 0));
    const refundedPayment = money(refunds.reduce((sum, refund) => sum + refund.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0), 0));
    const effectiveTotal = money(Math.max(0, Number(invoice.grandTotal) - refundedTotal));
    const netPaid = money(Math.max(0, paid - refundedPayment));
    return { tendered, paid, change, netPaid, balance: money(Math.max(0, effectiveTotal - netPaid)) };
  }
  private assertLocationAccess(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) {
      throw new ForbiddenException('You do not have access to this location.');
    }
  }
  private refundNumber(id: number) { return `REF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(id).padStart(6, '0')}`; }
  private fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
  private isRefundKeyConflict(error: unknown) {
    const candidate = error as { code?: string; message?: string; driverError?: { code?: string; sqlMessage?: string } };
    return (candidate.driverError?.code ?? candidate.code) === 'ER_DUP_ENTRY'
      && `${candidate.driverError?.sqlMessage ?? ''} ${candidate.message ?? ''}`.includes('uq_invoice_refund_tenant_key');
  }
  private assertPayoutDto(amount: number, reason: string, payer: string) {
    if (!Number.isFinite(amount) || amount <= 0 || money(amount) !== amount) throw new BadRequestException('Payout amount must be positive with at most two decimal places.');
    if (!reason?.trim()) throw new BadRequestException('Payout reason is required.');
    if (!payer?.trim()) throw new BadRequestException('Physical payer identity is required.');
  }
  private getWithManager(manager: EntityManager, id: number, tenantId: number) { return manager.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: id, tenantId }, relations: { invoice: true, location: true, details: { product: true }, payments: { paymentMethod: true, paymentChannel: true } } }); }
}
