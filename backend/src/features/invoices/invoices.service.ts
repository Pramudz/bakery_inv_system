import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In, MoreThan, Not, IsNull } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Customer } from '../customers/customers.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Location } from '../locations/locations.entity';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PaymentProcessingService } from '../payment-methods/payment-processing.service';
import { Product } from '../products/products.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Invoice } from './invoice.entity';
import { ReceiveInvoicePaymentDto } from './dto/receive-invoice-payment.dto';
import { snapshotInvoiceReceipt } from './invoice-receipt';
import { PosPriceLine, PosPricingService, PosSaleType } from './pos-pricing.service';
import { QuoteInvoiceDto } from './dto/quote-invoice.dto';
import { createHash } from 'node:crypto';
import { Permission } from '../permissions/permissions.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { PosSessionsService } from '../pos-registers/pos-sessions.service';
import { PosRegisterMode } from '../pos-registers/pos-location-config.entity';
import { tenantBusinessClock } from '../../common/business-date';
import { nextPosReceiptNumber } from './pos-receipt-number';
import { posReceiptHeader } from './pos-receipt-header';
import { PosPrintService } from '../pos-print/pos-print.service';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class InvoicesService {
  constructor(private readonly dataSource: DataSource, private readonly pricing: PosPricingService, private readonly posSessions: PosSessionsService, private readonly paymentProcessing: PaymentProcessingService = new PaymentProcessingService(), @Optional() private readonly posPrint?: PosPrintService) {}

  async pendingPayments(user: TenantPrincipal) {
    const invoices = await this.dataSource.getRepository(Invoice).find({
      where: {
        tenantId: user.tenantId, invoiceStatus: In(['COMPLETED', 'PARTIALLY_REFUNDED']), balanceAmount: MoreThan('0'),
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      relations: { customer: true, location: true },
      order: { invoiceDate: 'ASC', invoiceId: 'ASC' },
    });
    return invoices.map((invoice) => ({ ...invoice, collectionEligible: invoice.customerId !== null }));
  }

  async pendingPaymentsPage(user: TenantPrincipal, requestedPage: number, requestedLimit: number, search = '', status = 'ALL') {
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
    const query = this.dataSource.getRepository(Invoice).createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.location', 'location')
      .where('invoice.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('invoice.invoiceStatus IN (:...statuses)', { statuses: ['COMPLETED', 'PARTIALLY_REFUNDED'] })
      .andWhere('invoice.balanceAmount > 0');
    if (user.accessScope === 'LOCATION') query.andWhere('invoice.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.length ? user.assignedLocationIds : [-1] });
    const totals = await query.clone().select('COALESCE(SUM(invoice.balanceAmount), 0)', 'outstanding')
      .addSelect("SUM(CASE WHEN invoice.paymentStatus = 'PARTIALLY_PAID' THEN 1 ELSE 0 END)", 'partiallyPaid')
      .addSelect("SUM(CASE WHEN invoice.paymentStatus = 'UNPAID' THEN 1 ELSE 0 END)", 'unpaid').getRawOne();
    if (status === 'PARTIALLY_PAID' || status === 'UNPAID') query.andWhere('invoice.paymentStatus = :paymentStatus', { paymentStatus: status });
    const term = search.trim().slice(0, 100);
    if (term) query.andWhere('(invoice.invoiceNumber LIKE :term OR invoice.businessDate LIKE :term OR invoice.printedLocationCode LIKE :term OR invoice.printedRegisterCode LIKE :term OR CAST(invoice.billNo AS CHAR) LIKE :term OR customer.customerName LIKE :term OR customer.phone LIKE :term OR customer.mobile LIKE :term)', { term: `%${term}%` });
    const [items, total] = await query.orderBy('invoice.invoiceDate', 'ASC').addOrderBy('invoice.invoiceId', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: items.map((invoice) => ({ ...invoice, collectionEligible: invoice.customerId !== null })), total, page, limit,
      stats: { outstanding: Number(totals?.outstanding ?? 0), partiallyPaid: Number(totals?.partiallyPaid ?? 0), unpaid: Number(totals?.unpaid ?? 0) } };
  }

  collectionHistory(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoicePayment).find({
      where: {
        collectionKey: Not(IsNull()),
        invoice: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) },
      },
      relations: { invoice: { customer: true, location: true }, paymentMethod: true, paymentChannel: true },
      order: { invoicePaymentId: 'DESC' },
    });
  }

  async collectionHistoryPage(user: TenantPrincipal, requestedPage: number, requestedLimit: number, search = '') {
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
    const query = this.dataSource.getRepository(InvoicePayment).createQueryBuilder('payment')
      .innerJoinAndSelect('payment.invoice', 'invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.location', 'location')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('payment.paymentChannel', 'paymentChannel')
      .where('invoice.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('payment.collectionKey IS NOT NULL');
    if (user.accessScope === 'LOCATION') query.andWhere('invoice.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.length ? user.assignedLocationIds : [-1] });
    const stats = await query.clone().select('COUNT(payment.invoicePaymentId)', 'received')
      .andWhere('payment.isReversed = false').getRawOne();
    const term = search.trim().slice(0, 100);
    if (term) query.andWhere("(invoice.invoiceNumber LIKE :term OR invoice.businessDate LIKE :term OR invoice.printedLocationCode LIKE :term OR invoice.printedRegisterCode LIKE :term OR CAST(invoice.billNo AS CHAR) LIKE :term OR customer.customerName LIKE :term OR customer.phone LIKE :term OR customer.mobile LIKE :term OR payment.referenceNumber LIKE :term OR CONCAT('PAY-', LPAD(payment.invoicePaymentId, 6, '0')) LIKE :term)", { term: `%${term}%` });
    const [items, total] = await query.orderBy('payment.invoicePaymentId', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit, stats: { received: Number(stats?.received ?? 0) } };
  }

  async receivePayment(id: number, dto: ReceiveInvoicePaymentDto, user: TenantPrincipal, credential?: string) {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0 || money(dto.amount) !== dto.amount) {
      throw new BadRequestException('Payment amount must be positive with at most two decimal places.');
    }
    return this.dataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(Invoice);
      const invoice = await invoiceRepo.findOne({ where: { invoiceId: id, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(invoice.locationId))) {
        throw new ForbiddenException('You do not have access to this location.');
      }
      const activeSession = await this.posSessions.requireCashierSession(manager, credential, user, invoice.locationId, true);
      const repo = manager.getRepository(InvoicePayment);
      const existing = await repo.findOneBy({ invoiceId: invoice.invoiceId, collectionKey: dto.collectionKey });
      if (existing) {
        if (Number(existing.posCashierSessionId ?? 0) !== Number(activeSession.cashierSession.posCashierSessionId) || Number(existing.tenderedAmount) !== dto.amount || Number(existing.paymentMethodId) !== dto.paymentMethodId || Number(existing.paymentChannelId ?? 0) !== Number(dto.paymentChannelId ?? 0) || existing.referenceNumber !== (dto.referenceNumber?.trim() || null)) {
          throw new BadRequestException('This receipt request was already used for a different payment. Refresh and try again.');
        }
        return existing;
      }
      if (!['COMPLETED', 'PARTIALLY_REFUNDED'].includes(invoice.invoiceStatus)) throw new BadRequestException('This invoice cannot receive payments.');
      if (!invoice.customerId || !(await manager.getRepository(Customer).findOneBy({ customerId: invoice.customerId, tenantId: user.tenantId }))) {
        throw new BadRequestException('A customer-owned invoice is required for a later collection. Historical anonymous balances remain read-only.');
      }
      const before = money(Number(invoice.balanceAmount));
      if (before <= 0) throw new BadRequestException('This invoice has no remaining balance.');
      const [prepared] = await this.paymentProcessing.prepare(manager, user.tenantId, [dto], before);
      const after = money(before - prepared.applied);
      const payment = await repo.save(repo.create({
        invoiceId: invoice.invoiceId, paymentMethodId: prepared.method.paymentMethodId, paymentMethodTypeSnapshot: prepared.method.paymentMethodType,
        paymentChannelId: prepared.channel?.paymentChannelId ?? null, paymentChannelCodeSnapshot: prepared.channel?.code ?? null,
        paymentChannelNameSnapshot: prepared.channel?.name ?? null,
        amount: prepared.applied.toFixed(2), tenderedAmount: prepared.tendered.toFixed(2), changeAmount: prepared.change.toFixed(2), referenceNumber: prepared.referenceNumber,
        paidAt: new Date(), createdByUserId: user.userId, isReversed: false, reversedAt: null,
        collectionKey: dto.collectionKey, balanceBefore: before.toFixed(2), balanceAfter: after.toFixed(2),
        posTerminalId: activeSession.terminal?.posTerminalId ?? null,
        posRegisterSessionId: activeSession.registerSession.posRegisterSessionId,
        posCashierSessionId: activeSession.cashierSession.posCashierSessionId,
      }));
      invoice.paidAmount = money(Number(invoice.paidAmount) + prepared.applied).toFixed(2);
      invoice.tenderedAmount = money(Number(invoice.tenderedAmount) + prepared.tendered).toFixed(2);
      invoice.changeAmount = money(Number(invoice.changeAmount) + prepared.change).toFixed(2);
      invoice.balanceAmount = after.toFixed(2);
      invoice.paymentStatus = after === 0 ? 'PAID' : 'PARTIALLY_PAID';
      await invoiceRepo.save(invoice);
      return payment;
    });
  }

  list(user: TenantPrincipal) {
    return this.dataSource.getRepository(Invoice).find({
      where: {
        tenantId: user.tenantId,
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      relations: { customer: true, location: true, creditAuthorizedByUser: true, payments: { paymentMethod: true, paymentChannel: true } },
      order: { invoiceId: 'DESC' },
    });
  }

  async get(id: number, user: TenantPrincipal) {
    const invoice = await this.dataSource.getRepository(Invoice).findOne({
      where: { invoiceId: id, tenantId: user.tenantId },
      relations: { customer: true, location: true, creditAuthorizedByUser: true, details: { product: true }, payments: { paymentMethod: true, paymentChannel: true } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    this.assertLocationAccess(invoice.locationId, user);
    return invoice;
  }

  async history(user: TenantPrincipal, requestedPage: number, requestedLimit: number, search = '', recordType = 'ALL', status = 'ALL') {
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
    const type = ['ALL', 'INVOICE', 'PAYMENT'].includes(recordType) ? recordType : 'ALL';
    const invoiceStatus = ['COMPLETED', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED'].includes(status) ? status : 'ALL';
    const term = search.trim().slice(0, 100);
    const scope = user.accessScope === 'LOCATION' ? user.assignedLocationIds.map(Number) : [];
    const locationClause = user.accessScope === 'LOCATION' ? ` AND i.location_id IN (${(scope.length ? scope : [-1]).map(() => '?').join(',')})` : '';
    const baseParams = () => [user.tenantId, ...(user.accessScope === 'LOCATION' ? (scope.length ? scope : [-1]) : [])];
    const parts: string[] = [];
    const params: Array<string | number> = [];
    const addPart = (kind: 'INVOICE' | 'PAYMENT') => {
      const isPayment = kind === 'PAYMENT';
      let where = `i.tenant_id = ?${locationClause}`;
      const values: Array<string | number> = baseParams();
      if (invoiceStatus !== 'ALL') { where += ' AND i.invoice_status = ?'; values.push(invoiceStatus); }
      if (term) {
        where += ` AND (i.invoice_number LIKE ? OR i.business_date LIKE ? OR i.printed_location_code LIKE ? OR i.printed_register_code LIKE ? OR CAST(i.bill_no AS CHAR) LIKE ? OR c.customer_name LIKE ?${isPayment ? " OR p.reference_number LIKE ? OR CONCAT('PAY-', LPAD(p.invoice_payment_id, 6, '0')) LIKE ?" : ''})`;
        values.push(...Array(isPayment ? 8 : 6).fill(`%${term}%`));
      }
      parts.push(isPayment
        ? `SELECT 'PAYMENT' AS kind, p.invoice_payment_id AS source_id, i.invoice_id, p.paid_at AS activity_at FROM tbl_invoice_payment p JOIN tbl_invoice i ON i.invoice_id = p.invoice_id LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id WHERE p.collection_key IS NOT NULL AND ${where}`
        : `SELECT 'INVOICE' AS kind, i.invoice_id AS source_id, i.invoice_id, i.invoice_date AS activity_at FROM tbl_invoice i LEFT JOIN tbl_customer c ON c.customer_id = i.customer_id WHERE ${where}`);
      params.push(...values);
    };
    if (type !== 'PAYMENT') addPart('INVOICE');
    if (type !== 'INVOICE') addPart('PAYMENT');
    const union = parts.join(' UNION ALL ');
    const [{ total }] = await this.dataSource.query(`SELECT COUNT(*) AS total FROM (${union}) history`, params);
    const rows: Array<{ kind: 'INVOICE' | 'PAYMENT'; source_id: string; invoice_id: string }> = await this.dataSource.query(
      `SELECT kind, source_id, invoice_id FROM (${union}) history ORDER BY activity_at DESC, source_id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    const invoiceIds = [...new Set(rows.map((row) => Number(row.invoice_id)))];
    const paymentIds = rows.filter((row) => row.kind === 'PAYMENT').map((row) => Number(row.source_id));
    const invoices = invoiceIds.length ? await this.dataSource.getRepository(Invoice).find({ where: { invoiceId: In(invoiceIds), tenantId: user.tenantId }, relations: { customer: true, location: true, payments: { paymentMethod: true, paymentChannel: true } } }) : [];
    const payments = paymentIds.length ? await this.dataSource.getRepository(InvoicePayment).find({ where: { invoicePaymentId: In(paymentIds) }, relations: { paymentMethod: true, paymentChannel: true } }) : [];
    const invoiceMap = new Map(invoices.map((invoice) => [Number(invoice.invoiceId), invoice]));
    const paymentMap = new Map(payments.map((payment) => [Number(payment.invoicePaymentId), payment]));
    const items = rows.flatMap((row) => {
      const invoice = invoiceMap.get(Number(row.invoice_id));
      if (!invoice) return [];
      const payment = row.kind === 'PAYMENT' ? paymentMap.get(Number(row.source_id)) : null;
      if (row.kind === 'PAYMENT' && !payment) return [];
      return [{ key: `${row.kind}-${row.source_id}`, type: row.kind, date: row.kind === 'PAYMENT' ? payment!.paidAt : invoice.invoiceDate, invoice, payment: payment ?? null }];
    });
    const clock = await tenantBusinessClock(this.dataSource.manager, user.tenantId);
    const [stats] = await this.dataSource.query(`SELECT
      COALESCE(SUM(CASE WHEN i.business_date = ? OR (i.business_date IS NULL AND DATE(i.invoice_date) = ?) THEN i.grand_total ELSE 0 END), 0) AS todaySales,
      COALESCE(SUM(CASE WHEN i.business_date = ? OR (i.business_date IS NULL AND DATE(i.invoice_date) = ?) THEN 1 ELSE 0 END), 0) AS todayCount,
      COALESCE(SUM(CASE WHEN i.payment_status = 'PAID' THEN 1 ELSE 0 END), 0) AS paidCount,
      COALESCE(SUM(CASE WHEN i.is_credit_sale = 1 THEN 1 ELSE 0 END), 0) AS creditCount,
      COALESCE(SUM(i.balance_amount), 0) AS outstanding,
      COALESCE(SUM(CASE WHEN i.invoice_status IN ('PARTIALLY_REFUNDED', 'FULLY_REFUNDED') THEN 1 ELSE 0 END), 0) AS refundedCount
      FROM tbl_invoice i WHERE i.tenant_id = ?${locationClause}`,
      [clock.businessDate, clock.businessDate, clock.businessDate, clock.businessDate, ...baseParams()],
    );
    return { items, total: Number(total), page, limit, stats: {
      todaySales: Number(stats.todaySales), todayCount: Number(stats.todayCount), paidCount: Number(stats.paidCount), creditCount: Number(stats.creditCount), outstanding: Number(stats.outstanding), refundedCount: Number(stats.refundedCount),
    } };
  }

  async reprint(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOneBy({ invoiceId: id, tenantId: user.tenantId });
      if (!invoice) throw new NotFoundException('Sale not found.');
      this.assertLocationAccess(invoice.locationId, user);
      if (!invoice.receiptSnapshot) throw new BadRequestException('No archived sale receipt exists for this legacy record.');
      return this.posPrint!.auditReprint(manager, 'SALE', id, user, invoice.locationId);
    });
  }

  async paymentBreakdown(user: TenantPrincipal) {
    const payments = await this.dataSource.getRepository(InvoicePayment).find({
      where: {
        isReversed: false,
        invoice: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) },
      },
      relations: { invoice: { location: true }, paymentMethod: true, paymentChannel: true },
    });
    const grouped = new Map<string, { locationId: number; locationName: string | null; source: 'NEW_SALE' | 'COLLECTION'; methodType: PaymentMethodType | 'UNCLASSIFIED'; paymentChannelId: number | null; paymentChannelCode: string | null; paymentChannelName: string | null; appliedAmount: number; tenderedAmount: number; changeGiven: number; netReceived: number; transactionCount: number }>();
    for (const payment of payments) {
      const source = payment.collectionKey ? 'COLLECTION' : 'NEW_SALE';
      const methodType = payment.paymentMethodTypeSnapshot ?? payment.paymentMethod.paymentMethodType ?? 'UNCLASSIFIED';
      const channelId = payment.paymentChannelId ? Number(payment.paymentChannelId) : null;
      const locationId = Number(payment.invoice.locationId);
      const key = `${locationId}|${source}|${methodType}|${channelId ?? ''}`;
      const row = grouped.get(key) ?? { locationId, locationName: payment.invoice.location?.name ?? null, source, methodType, paymentChannelId: channelId, paymentChannelCode: payment.paymentChannelCodeSnapshot ?? payment.paymentChannel?.code ?? null, paymentChannelName: payment.paymentChannelNameSnapshot ?? payment.paymentChannel?.name ?? null, appliedAmount: 0, tenderedAmount: 0, changeGiven: 0, netReceived: 0, transactionCount: 0 };
      row.appliedAmount = money(row.appliedAmount + Number(payment.amount));
      row.tenderedAmount = money(row.tenderedAmount + Number(payment.tenderedAmount));
      row.changeGiven = money(row.changeGiven + Number(payment.changeAmount));
      row.netReceived = money(row.netReceived + Number(payment.tenderedAmount) - Number(payment.changeAmount));
      row.transactionCount += 1;
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((a, b) => a.locationId - b.locationId || a.source.localeCompare(b.source) || a.methodType.localeCompare(b.methodType) || (a.paymentChannelName ?? '').localeCompare(b.paymentChannelName ?? ''));
  }

  async billingLocations(user: TenantPrincipal) {
    return this.dataSource.getRepository(Location).find({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      order: { name: 'ASC', locationId: 'ASC' },
    });
  }

  async quote(dto: QuoteInvoiceDto, user: TenantPrincipal) {
    await this.validateLocation(dto.locationId, user);
    return this.pricing.quote(user.tenantId, dto.locationId, dto.saleType, dto.details);
  }

  async create(dto: CreateInvoiceDto, user: TenantPrincipal, credential?: string, deadlockAttempt = 0): Promise<Invoice> {
    const checkoutFingerprint = this.checkoutFingerprint(dto);
    const prior = await this.checkoutResult(dto.checkoutKey, checkoutFingerprint, user);
    if (prior) return prior;
    await this.posSessions.requireCashierSession(this.dataSource.manager, credential, user, dto.locationId, false);
    await this.validateHeader(dto, user);
    try {
      return await this.dataSource.transaction(async (manager) => {
      const activeSession = await this.posSessions.requireCashierSession(manager, credential, user, dto.locationId, true);
      const quote = await this.pricing.quoteWithManager(
        manager,
        user.tenantId,
        dto.locationId,
        dto.saleType as PosSaleType,
        dto.details.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      );
      const priceChanges = dto.details.flatMap((request, index) => {
        const current = quote.lines[index];
        return this.priceChanged(request, current) ? [{ productId: request.productId, quoted: {
          priceListItemId: request.quotedPriceListItemId ?? null,
          priceListItemDiscountId: request.quotedPriceListItemDiscountId ?? null,
          unitPrice: request.quotedUnitPrice ?? null,
          discountAmount: request.quotedDiscountAmount ?? null,
        }, current }] : [];
      });
      if (priceChanges.length) {
        throw new ConflictException({
          code: 'PRICE_CHANGED',
          message: 'One or more prices changed. Review the updated totals and confirm again.',
          priceChanges,
          quote,
        });
      }
      const preparedDetails = quote.lines;
      const subtotal = quote.subtotal;
      const discountTotal = quote.discountTotal;
      const grandTotal = quote.grandTotal;
      const preparedPayments = await this.paymentProcessing.prepare(manager, user.tenantId, dto.payments ?? [], grandTotal);
      const tenderedAmount = money(preparedPayments.reduce((sum, payment) => sum + payment.tendered, 0));
      const paidAmount = money(preparedPayments.reduce((sum, payment) => sum + payment.applied, 0));
      const changeAmount = money(preparedPayments.reduce((sum, payment) => sum + payment.change, 0));
      const balanceAmount = money(grandTotal - paidAmount);
      const isCreditSale = balanceAmount > 0;
      if (isCreditSale) {
        if (!dto.sellOnCredit) throw new BadRequestException('The invoice is underpaid. Explicitly choose Sell on credit to create a customer receivable.');
        if (!dto.customerId) throw new BadRequestException('Select an existing customer before selling on credit.');
        await this.assertCreditAuthorization(manager, user);
      }

      const invoiceRepo = manager.getRepository(Invoice);
      const invoice = await invoiceRepo.save(invoiceRepo.create({
        tenantId: user.tenantId,
        checkoutKey: dto.checkoutKey,
        checkoutFingerprint,
        locationId: dto.locationId,
        posTerminalId: activeSession.terminal?.posTerminalId ?? null,
        posRegisterSessionId: activeSession.registerSession.posRegisterSessionId,
        posCashierSessionId: activeSession.cashierSession.posCashierSessionId,
        customerId: dto.customerId ?? null,
        invoiceNumber: `PENDING-${dto.checkoutKey}`,
        invoiceDate: new Date(),
        saleType: dto.saleType,
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        tenderedAmount: tenderedAmount.toFixed(2),
        changeAmount: changeAmount.toFixed(2),
        balanceAmount: balanceAmount.toFixed(2),
        paymentStatus: paidAmount === 0 ? 'UNPAID' : paidAmount < grandTotal ? 'PARTIALLY_PAID' : 'PAID',
        invoiceStatus: 'COMPLETED',
        isCreditSale,
        creditAuthorizedByUserId: isCreditSale ? user.userId : null,
        creditAuthorizedAt: isCreditSale ? new Date() : null,
        createdByUserId: user.userId,
      }));
      invoice.invoiceNumber = this.invoiceNumber(invoice.invoiceId);
      await invoiceRepo.save(invoice);

      for (const line of preparedDetails) {
        const product = await manager.getRepository(Product).findOneBy({ productId: line.productId, tenantId: user.tenantId, isActive: true, isSellable: true });
        if (!product) throw new NotFoundException(`Sellable product ${line.productId} was not found.`);
        const detail = await manager.getRepository(InvoiceDetail).save(manager.getRepository(InvoiceDetail).create({
          invoiceId: invoice.invoiceId, productId: line.productId, quantity: String(line.quantity), unitPrice: line.unitPrice.toFixed(2),
          discountPercentage: line.discountPercentage.toFixed(4), discountAmount: line.discountAmount.toFixed(2), grossTotal: line.grossTotal.toFixed(2), netTotal: line.netTotal.toFixed(2),
        }));
        if (product.isStockItem) await this.issueStock(manager, invoice, detail, user);
      }

      for (const payment of preparedPayments) {
        await manager.getRepository(InvoicePayment).save(manager.getRepository(InvoicePayment).create({
          invoiceId: invoice.invoiceId, paymentMethodId: payment.method.paymentMethodId, paymentMethodTypeSnapshot: payment.method.paymentMethodType,
          paymentChannelId: payment.channel?.paymentChannelId ?? null, paymentChannelCodeSnapshot: payment.channel?.code ?? null,
          paymentChannelNameSnapshot: payment.channel?.name ?? null,
          amount: payment.applied.toFixed(2), tenderedAmount: payment.tendered.toFixed(2), changeAmount: payment.change.toFixed(2),
          referenceNumber: payment.referenceNumber, paidAt: new Date(), createdByUserId: user.userId,
          posTerminalId: activeSession.terminal?.posTerminalId ?? null,
          posRegisterSessionId: activeSession.registerSession.posRegisterSessionId,
          posCashierSessionId: activeSession.cashierSession.posCashierSessionId,
        }));
      }
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const header = await posReceiptHeader(manager, user.tenantId, dto.locationId, user.userId);
      const registerCode = activeSession.config.registerMode === PosRegisterMode.MASTER_REGISTER
        ? activeSession.register.receiptCode || 'MASTER'
        : activeSession.terminal!.terminalCode.trim().toUpperCase();
      invoice.businessDate = clock.businessDate;
      invoice.printedLocationCode = header.locationCode;
      invoice.printedRegisterCode = registerCode;
      invoice.billNo = await nextPosReceiptNumber(manager, 'SALE', user.tenantId, clock.businessDate, header.locationCode, registerCode);
      invoice.issuedAt = clock.now;
      await invoiceRepo.save(invoice);
      const completed = (await this.getWithManager(manager, invoice.invoiceId, user.tenantId))!;
      for (const detail of completed.details) {
        const pricing = quote.lines.find((line) => Number(line.productId) === Number(detail.productId));
        if (pricing) (detail as InvoiceDetail & { pricingSnapshot: PosPriceLine }).pricingSnapshot = pricing;
      }
      completed.receiptSnapshot = snapshotInvoiceReceipt(completed, header);
      await invoiceRepo.update(invoice.invoiceId, { receiptSnapshot: completed.receiptSnapshot });
      await this.posPrint?.enqueue(manager, 'SALE', invoice.invoiceId, user.tenantId, dto.locationId, activeSession.terminal?.posTerminalId ?? null, completed.receiptSnapshot);
      return completed;
      });
    } catch (error) {
      if (this.isRetryableDeadlock(error) && deadlockAttempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (deadlockAttempt + 1)));
        return this.create(dto, user, credential, deadlockAttempt + 1);
      }
      if (!this.isCheckoutKeyConflict(error)) throw error;
      const committed = await this.checkoutResult(dto.checkoutKey, checkoutFingerprint, user);
      if (committed) return committed;
      throw error;
    }
  }

  async catalog(locationId: number, saleType: PosSaleType, user: TenantPrincipal) {
    await this.validateLocation(locationId, user);
    const products: Array<{ productId: number; code: string; name: string; category: string; stock: string; isStockItem: number }> = await this.dataSource.query(`
      SELECT p.product_id AS productId, p.sku AS code, p.product_name AS name,
        COALESCE(c.category_name, 'Uncategorized') AS category,
        COALESCE(ib.quantity_on_hand, 0) AS stock, p.is_stock_item AS isStockItem
      FROM tbl_product p
      LEFT JOIN tbl_category c ON c.category_id = p.category_id
      INNER JOIN tbl_product_location product_location ON product_location.product_id = p.product_id AND product_location.location_id = ? AND product_location.is_active = 1 AND product_location.is_sellable = 1
      LEFT JOIN tbl_inventory_balance ib ON ib.product_id = p.product_id AND ib.tenant_id = p.tenant_id AND ib.location_id = ?
      WHERE p.tenant_id = ? AND p.is_active = 1 AND p.is_sellable = 1
      ORDER BY p.product_name`, [locationId, locationId, user.tenantId]);
    const result = [];
    for (const product of products) {
      try {
        const quote = await this.pricing.quote(user.tenantId, locationId, saleType, [{ productId: Number(product.productId), quantity: 1 }]);
        const line = quote.lines[0];
        result.push({
          ...product,
          stock: product.isStockItem ? product.stock : Number.MAX_SAFE_INTEGER,
          retailPrice: saleType === 'RETAIL' ? line.unitPrice : 0,
          wholesalePrice: saleType === 'WHOLESALE' ? line.unitPrice : 0,
          discountPercentage: line.discountPercentage,
          discountAmount: line.discountAmount,
          finalUnitPrice: line.netTotal,
          pricing: line,
        });
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return result;
  }

  private async validateHeader(dto: CreateInvoiceDto, user: TenantPrincipal) {
    await this.validateLocation(dto.locationId, user);
    if (dto.customerId && !(await this.dataSource.getRepository(Customer).findOneBy({ customerId: dto.customerId, tenantId: user.tenantId, isActive: true }))) {
      throw new NotFoundException('Customer not found.');
    }
  }

  private async validateLocation(locationId: number, user: TenantPrincipal) {
    this.assertLocationAccess(locationId, user);
    if (!(await this.dataSource.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true }))) throw new NotFoundException('Location not found.');
  }

  private assertLocationAccess(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId))) {
      throw new ForbiddenException('You do not have access to this location.');
    }
  }

  private priceChanged(request: CreateInvoiceDto['details'][number], current: PosPriceLine) {
    if (!request.quotedPriceListItemId || request.quotedUnitPrice === undefined || request.quotedDiscountAmount === undefined) return true;
    return Number(request.quotedPriceListItemId) !== current.priceListItemId
      || Number(request.quotedPriceListItemDiscountId ?? 0) !== Number(current.priceListItemDiscountId ?? 0)
      || money(Number(request.quotedUnitPrice)) !== current.unitPrice
      || money(Number(request.quotedDiscountAmount)) !== current.discountAmount;
  }

  private checkoutFingerprint(dto: CreateInvoiceDto) {
    const details = dto.details.map((line) => ({ productId: Number(line.productId), quantity: Number(line.quantity) }))
      .sort((a, b) => a.productId - b.productId || a.quantity - b.quantity);
    const payments = (dto.payments ?? []).map((payment) => ({
      paymentMethodId: Number(payment.paymentMethodId),
      amount: money(Number(payment.amount)),
      paymentChannelId: payment.paymentChannelId ? Number(payment.paymentChannelId) : null,
      referenceNumber: payment.referenceNumber?.trim() || null,
    })).sort((a, b) => a.paymentMethodId - b.paymentMethodId || a.amount - b.amount || Number(a.paymentChannelId ?? 0) - Number(b.paymentChannelId ?? 0) || String(a.referenceNumber).localeCompare(String(b.referenceNumber)));
    return createHash('sha256').update(JSON.stringify({
      locationId: Number(dto.locationId),
      customerId: dto.customerId ? Number(dto.customerId) : null,
      saleType: dto.saleType,
      details,
      payments,
      sellOnCredit: Boolean(dto.sellOnCredit),
    })).digest('hex');
  }

  private async checkoutResult(checkoutKey: string, checkoutFingerprint: string, user: TenantPrincipal) {
    const existing = await this.dataSource.getRepository(Invoice).findOneBy({ tenantId: user.tenantId, checkoutKey });
    if (!existing) return null;
    this.assertLocationAccess(existing.locationId, user);
    if (existing.checkoutFingerprint !== checkoutFingerprint) {
      throw new ConflictException({ code: 'CHECKOUT_KEY_REUSED', message: 'This checkout key was already used for a different sale.' });
    }
    return this.get(existing.invoiceId, user);
  }

  private isCheckoutKeyConflict(error: unknown) {
    const candidate = error as { code?: string; message?: string; driverError?: { code?: string; message?: string; sqlMessage?: string } };
    const code = candidate.driverError?.code ?? candidate.code;
    const message = `${candidate.driverError?.sqlMessage ?? ''} ${candidate.driverError?.message ?? ''} ${candidate.message ?? ''}`;
    return code === 'ER_DUP_ENTRY' && message.includes('uq_invoice_tenant_checkout');
  }

  private isRetryableDeadlock(error: unknown) {
    const candidate = error as { code?: string; errno?: number; driverError?: { code?: string; errno?: number } };
    return (candidate.driverError?.code ?? candidate.code) === 'ER_LOCK_DEADLOCK' || (candidate.driverError?.errno ?? candidate.errno) === 1213;
  }

  private async assertCreditAuthorization(manager: EntityManager, user: TenantPrincipal) {
    if (user.roleCode === 'TENANT_ADMIN') return;
    const permission = await manager.getRepository(Permission).findOneBy({ code: 'SALES_CREDIT_AUTHORIZE', isActive: true });
    if (!permission) throw new ForbiddenException('Credit-sale authorization is unavailable.');
    const enabled = await manager.getRepository(TenantModule).findOneBy({ tenantId: user.tenantId, moduleId: permission.moduleId, isEnabled: true });
    if (!enabled) throw new ForbiddenException('The Sales module is not enabled for this tenant.');
    const grant = await manager.getRepository(RolePermission).findOneBy({ roleId: user.roleId, permissionId: permission.permissionId });
    if (!grant) throw new ForbiddenException('SALES_CREDIT_AUTHORIZE permission is required to sell on credit.');
  }

  private async issueStock(manager: EntityManager, invoice: Invoice, detail: InvoiceDetail, user: TenantPrincipal) {
    const repo = manager.getRepository(InventoryBalance);
    const balance = await repo.findOne({ where: { tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId }, lock: { mode: 'pessimistic_write' } });
    const before = Number(balance?.quantityOnHand ?? 0);
    const quantity = Number(detail.quantity);
    if (!balance || before < quantity) throw new BadRequestException(`Insufficient stock for product ${detail.productId}. Available: ${before}.`);
    const after = before - quantity;
    balance.quantityOnHand = String(after);
    balance.lastMovementAt = new Date();
    await repo.save(balance);
    const cost = Number(balance.averageCost);
    await manager.getRepository(InventoryLedger).save(manager.getRepository(InventoryLedger).create({
      tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId, movementDate: new Date(), movementType: 'SALE',
      sourceDocumentType: 'INVOICE', sourceDocumentId: invoice.invoiceId, sourceDocumentLineId: detail.invoiceDetailId,
      quantityIn: '0', quantityOut: String(quantity), unitCost: String(cost), movementValue: String(money(quantity * cost)),
      quantityBefore: String(before), quantityAfter: String(after), averageCostBefore: String(cost), averageCostAfter: String(cost), createdByUserId: user.userId,
    }));
  }

  private invoiceNumber(id: number) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${date}-${String(id).padStart(6, '0')}`;
  }

  private async getWithManager(manager: EntityManager, id: number, tenantId: number) {
    return manager.getRepository(Invoice).findOne({ where: { invoiceId: id, tenantId }, relations: { customer: true, location: true, creditAuthorizedByUser: true, details: { product: true }, payments: { paymentMethod: true, paymentChannel: true } } });
  }
}
