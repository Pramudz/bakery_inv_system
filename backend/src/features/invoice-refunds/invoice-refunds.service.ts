import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoiceDetail } from '../invoices/invoice-detail.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Invoice } from '../invoices/invoice.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { PaymentProcessingService } from '../payment-methods/payment-processing.service';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Product } from '../products/products.entity';
import { CreateInvoiceRefundDto } from './dto/create-invoice-refund.dto';
import { ReverseInvoicePaymentDto } from './dto/reverse-invoice-payment.dto';
import { InvoicePaymentReversal } from './invoice-payment-reversal.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceAdjustment } from './invoice-adjustment.entity';
import { CreateInvoiceAdjustmentDto } from './dto/create-invoice-adjustment.dto';
import { randomUUID } from 'node:crypto';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class InvoiceRefundsService {
  constructor(private readonly dataSource: DataSource, private readonly paymentProcessing: PaymentProcessingService = new PaymentProcessingService()) {}

  list(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoiceRefund).find({ where: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) }, relations: { invoice: { customer: true }, location: true }, order: { invoiceRefundId: 'DESC' } });
  }
  async get(id: number, user: TenantPrincipal) {
    const row = await this.dataSource.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: id, tenantId: user.tenantId }, relations: { invoice: { customer: true }, location: true, details: { product: true, invoiceDetail: true }, payments: { paymentMethod: true, paymentChannel: true } } });
    if (!row) throw new NotFoundException('Invoice refund not found.');
    this.assertLocationAccess(row.locationId, user);
    return row;
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
    return { ...invoice, refundablePaymentAmount: await this.remainingPayment(invoice), details: invoice.details.map((line) => ({ ...line, refundedQuantity: sums.get(Number(line.invoiceDetailId)) ?? 0, refundableQuantity: Math.max(0, Number(line.quantity) - (sums.get(Number(line.invoiceDetailId)) ?? 0)) })) };
  }

  async create(dto: CreateInvoiceRefundDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId: dto.invoiceId, tenantId: user.tenantId }, relations: { details: { product: true } }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      this.assertLocationAccess(invoice.locationId, user);
      if (invoice.invoiceStatus === 'FULLY_REFUNDED') throw new BadRequestException('Invoice is already fully refunded.');
      const requestedIds = dto.details.map((x) => x.invoiceDetailId);
      if (new Set(requestedIds).size !== requestedIds.length) throw new BadRequestException('A refund line cannot be selected more than once.');
      const originalLines = invoice.details.filter((x) => requestedIds.includes(Number(x.invoiceDetailId)));
      if (originalLines.length !== requestedIds.length) throw new BadRequestException('One or more invoice lines are invalid.');
      const previous = await this.refundedQuantities(invoice.details.map((line) => line.invoiceDetailId), manager);
      const prepared = dto.details.map((request) => {
        const line = originalLines.find((x) => Number(x.invoiceDetailId) === request.invoiceDetailId)!;
        const refundable = Number(line.quantity) - (previous.get(Number(line.invoiceDetailId)) ?? 0);
        if (request.quantity > refundable) throw new BadRequestException(`Refund quantity exceeds the available quantity for ${line.product.productName}.`);
        const ratio = request.quantity / Number(line.quantity);
        const gross = money(Number(line.grossTotal) * ratio);
        const discount = money(Number(line.discountAmount) * ratio);
        return { request, line, gross, discount, total: money(gross - discount) };
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

      const repo = manager.getRepository(InvoiceRefund);
      const refund = await repo.save(repo.create({ tenantId: user.tenantId, locationId: invoice.locationId, invoiceId: invoice.invoiceId, refundNumber: `PENDING-${Date.now()}-${user.userId}`, refundDate: new Date(), reason: dto.reason.trim(), subtotal: subtotal.toFixed(2), discountTotal: discountTotal.toFixed(2), refundTotal: refundTotal.toFixed(2), status: 'COMPLETED', createdByUserId: user.userId, approvedByUserId: null }));
      refund.refundNumber = this.refundNumber(refund.invoiceRefundId);
      await repo.save(refund);
      for (const item of prepared) {
        const detail = await manager.getRepository(InvoiceRefundDetail).save(manager.getRepository(InvoiceRefundDetail).create({ invoiceRefundId: refund.invoiceRefundId, invoiceDetailId: item.line.invoiceDetailId, productId: item.line.productId, quantity: String(item.request.quantity), unitPrice: item.line.unitPrice, discountPercentage: item.line.discountPercentage, discountAmount: item.discount.toFixed(2), refundAmount: item.total.toFixed(2), returnToStock: item.request.returnToStock !== false }));
        if (detail.returnToStock && item.line.product.isStockItem) await this.restoreStock(manager, invoice, detail, user);
      }
      for (const payment of dto.payments ?? []) {
        const { method, channel, referenceNumber } = await this.paymentProcessing.configuration(manager, user.tenantId, payment);
        await manager.getRepository(InvoiceRefundPayment).save(manager.getRepository(InvoiceRefundPayment).create({
          invoiceRefundId: refund.invoiceRefundId, paymentMethodId: method.paymentMethodId, paymentMethodTypeSnapshot: method.paymentMethodType,
          paymentChannelId: channel?.paymentChannelId ?? null, paymentChannelCodeSnapshot: channel?.code ?? null,
          paymentChannelNameSnapshot: channel?.name ?? null,
          amount: money(payment.amount).toFixed(2), referenceNumber, refundedAt: new Date(), createdByUserId: user.userId,
        }));
      }
      const fullyReturned = invoice.details.every((line) => (previous.get(Number(line.invoiceDetailId)) ?? 0) + (dto.details.find((item) => item.invoiceDetailId === Number(line.invoiceDetailId))?.quantity ?? 0) >= Number(line.quantity));
      invoice.invoiceStatus = fullyReturned ? 'FULLY_REFUNDED' : 'PARTIALLY_REFUNDED';
      await this.recalculateInvoicePayments(manager, invoice);
      return this.getWithManager(manager, refund.invoiceRefundId, user.tenantId);
    });
  }

  async reversePayment(invoiceId: number, paymentId: number, dto: ReverseInvoicePaymentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      this.assertLocationAccess(invoice.locationId, user);
      const payment = await manager.getRepository(InvoicePayment).findOne({ where: { invoicePaymentId: paymentId, invoiceId }, relations: { paymentChannel: true }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Invoice payment not found.');
      if (payment.isReversed) throw new BadRequestException('Payment is already reversed.');
      await manager.getRepository(InvoicePaymentReversal).save(manager.getRepository(InvoicePaymentReversal).create({ invoicePaymentId: payment.invoicePaymentId, reversalAmount: payment.amount, reason: dto.reason.trim(), reversedAt: new Date(), reversedByUserId: user.userId }));
      payment.isReversed = true; payment.reversedAt = new Date(); await manager.getRepository(InvoicePayment).save(payment);
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
        }));
      }
      await this.recalculateInvoicePayments(manager, invoice);
      return manager.getRepository(Invoice).findOne({ where: { invoiceId }, relations: { payments: { paymentMethod: true, paymentChannel: true } } });
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
  private async restoreStock(manager: EntityManager, invoice: Invoice, detail: InvoiceRefundDetail, user: TenantPrincipal) {
    const repo = manager.getRepository(InventoryBalance);
    let balance = await repo.findOne({ where: { tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId }, lock: { mode: 'pessimistic_write' } });
    if (!balance) balance = repo.create({ tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId, quantityOnHand: '0', averageCost: '0', lastMovementAt: null });
    const before = Number(balance.quantityOnHand); const after = before + Number(detail.quantity); const cost = Number(balance.averageCost);
    balance.quantityOnHand = String(after); balance.lastMovementAt = new Date(); await repo.save(balance);
    await manager.getRepository(InventoryLedger).save(manager.getRepository(InventoryLedger).create({ tenantId: user.tenantId, locationId: invoice.locationId, productId: detail.productId, movementDate: new Date(), movementType: 'SALE_RETURN', sourceDocumentType: 'INVOICE_REFUND', sourceDocumentId: detail.invoiceRefundId, sourceDocumentLineId: detail.invoiceRefundDetailId, quantityIn: detail.quantity, quantityOut: '0', unitCost: String(cost), movementValue: String(money(Number(detail.quantity) * cost)), quantityBefore: String(before), quantityAfter: String(after), averageCostBefore: String(cost), averageCostAfter: String(cost), createdByUserId: user.userId }));
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
  private getWithManager(manager: EntityManager, id: number, tenantId: number) { return manager.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: id, tenantId }, relations: { invoice: true, location: true, details: { product: true }, payments: { paymentMethod: true, paymentChannel: true } } }); }
}
