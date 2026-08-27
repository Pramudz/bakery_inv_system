import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoiceDetail } from '../invoices/invoice-detail.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Invoice } from '../invoices/invoice.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { InventoryBalance, InventoryLedger } from '../purchasing/purchasing.entities';
import { Product } from '../products/products.entity';
import { CreateInvoiceRefundDto } from './dto/create-invoice-refund.dto';
import { ReverseInvoicePaymentDto } from './dto/reverse-invoice-payment.dto';
import { InvoicePaymentReversal } from './invoice-payment-reversal.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceAdjustment } from './invoice-adjustment.entity';
import { CreateInvoiceAdjustmentDto } from './dto/create-invoice-adjustment.dto';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class InvoiceRefundsService {
  constructor(private readonly dataSource: DataSource) {}

  list(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoiceRefund).find({ where: { tenantId: user.tenantId }, relations: { invoice: { customer: true }, location: true }, order: { invoiceRefundId: 'DESC' } });
  }
  async get(id: number, user: TenantPrincipal) {
    const row = await this.dataSource.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: id, tenantId: user.tenantId }, relations: { invoice: { customer: true }, location: true, details: { product: true, invoiceDetail: true }, payments: { paymentMethod: true } } });
    if (!row) throw new NotFoundException('Invoice refund not found.');
    return row;
  }

  listAdjustments(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoiceAdjustment).find({ where: { tenantId: user.tenantId }, relations: { invoice: { customer: true }, invoiceDetail: { product: true }, paymentMethod: true }, order: { invoiceAdjustmentId: 'DESC' } });
  }

  async createAdjustment(dto: CreateInvoiceAdjustmentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOneBy({ invoiceId: dto.invoiceId, tenantId: user.tenantId });
      if (!invoice) throw new NotFoundException('Invoice not found.');
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
    const invoice = await this.dataSource.getRepository(Invoice).findOne({ where: { invoiceId: id, tenantId: user.tenantId }, relations: { customer: true, location: true, details: { product: true }, payments: { paymentMethod: true } } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    const sums = await this.refundedQuantities(invoice.details.map((x) => x.invoiceDetailId));
    return { ...invoice, details: invoice.details.map((line) => ({ ...line, refundedQuantity: sums.get(line.invoiceDetailId) ?? 0, refundableQuantity: Math.max(0, Number(line.quantity) - (sums.get(line.invoiceDetailId) ?? 0)) })) };
  }

  async create(dto: CreateInvoiceRefundDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId: dto.invoiceId, tenantId: user.tenantId }, relations: { details: { product: true } }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      if (invoice.invoiceStatus === 'FULLY_REFUNDED') throw new BadRequestException('Invoice is already fully refunded.');
      const requestedIds = dto.details.map((x) => x.invoiceDetailId);
      if (new Set(requestedIds).size !== requestedIds.length) throw new BadRequestException('A refund line cannot be selected more than once.');
      const originalLines = invoice.details.filter((x) => requestedIds.includes(x.invoiceDetailId));
      if (originalLines.length !== requestedIds.length) throw new BadRequestException('One or more invoice lines are invalid.');
      const previous = await this.refundedQuantities(requestedIds, manager);
      const prepared = dto.details.map((request) => {
        const line = originalLines.find((x) => x.invoiceDetailId === request.invoiceDetailId)!;
        const refundable = Number(line.quantity) - (previous.get(line.invoiceDetailId) ?? 0);
        if (request.quantity > refundable) throw new BadRequestException(`Refund quantity exceeds the available quantity for ${line.product.productName}.`);
        const ratio = request.quantity / Number(line.quantity);
        const gross = money(Number(line.grossTotal) * ratio);
        const discount = money(Number(line.discountAmount) * ratio);
        return { request, line, gross, discount, total: money(gross - discount) };
      });
      const subtotal = money(prepared.reduce((sum, x) => sum + x.gross, 0));
      const discountTotal = money(prepared.reduce((sum, x) => sum + x.discount, 0));
      const refundTotal = money(prepared.reduce((sum, x) => sum + x.total, 0));
      const paymentTotal = money((dto.payments ?? []).reduce((sum, x) => sum + Number(x.amount), 0));
      if (paymentTotal > refundTotal) throw new BadRequestException('Refund payments cannot exceed the refund total.');

      const repo = manager.getRepository(InvoiceRefund);
      const refund = await repo.save(repo.create({ tenantId: user.tenantId, locationId: invoice.locationId, invoiceId: invoice.invoiceId, refundNumber: `PENDING-${Date.now()}-${user.userId}`, refundDate: new Date(), reason: dto.reason.trim(), subtotal: subtotal.toFixed(2), discountTotal: discountTotal.toFixed(2), refundTotal: refundTotal.toFixed(2), status: 'COMPLETED', createdByUserId: user.userId, approvedByUserId: null }));
      refund.refundNumber = this.refundNumber(refund.invoiceRefundId);
      await repo.save(refund);
      for (const item of prepared) {
        const detail = await manager.getRepository(InvoiceRefundDetail).save(manager.getRepository(InvoiceRefundDetail).create({ invoiceRefundId: refund.invoiceRefundId, invoiceDetailId: item.line.invoiceDetailId, productId: item.line.productId, quantity: String(item.request.quantity), unitPrice: item.line.unitPrice, discountPercentage: item.line.discountPercentage, discountAmount: item.discount.toFixed(2), refundAmount: item.total.toFixed(2), returnToStock: item.request.returnToStock !== false }));
        if (detail.returnToStock && item.line.product.isStockItem) await this.restoreStock(manager, invoice, detail, user);
      }
      for (const payment of dto.payments ?? []) {
        const method = await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: payment.paymentMethodId, tenantId: user.tenantId, isActive: true });
        if (!method) throw new NotFoundException('Refund payment method not found.');
        await manager.getRepository(InvoiceRefundPayment).save(manager.getRepository(InvoiceRefundPayment).create({ invoiceRefundId: refund.invoiceRefundId, paymentMethodId: payment.paymentMethodId, amount: money(payment.amount).toFixed(2), referenceNumber: payment.referenceNumber?.trim() || null, refundedAt: new Date(), createdByUserId: user.userId }));
      }
      const allRefunds: any[] = await manager.getRepository(InvoiceRefund).findBy({ invoiceId: invoice.invoiceId, status: 'COMPLETED' });
      const refundedTotal = money(allRefunds.reduce((sum, x) => sum + Number(x.refundTotal), 0));
      invoice.invoiceStatus = refundedTotal >= Number(invoice.grandTotal) ? 'FULLY_REFUNDED' : 'PARTIALLY_REFUNDED';
      await manager.getRepository(Invoice).save(invoice);
      return this.getWithManager(manager, refund.invoiceRefundId, user.tenantId);
    });
  }

  async reversePayment(invoiceId: number, paymentId: number, dto: ReverseInvoicePaymentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(Invoice).findOne({ where: { invoiceId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      const payment = await manager.getRepository(InvoicePayment).findOne({ where: { invoicePaymentId: paymentId, invoiceId }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Invoice payment not found.');
      if (payment.isReversed) throw new BadRequestException('Payment is already reversed.');
      await manager.getRepository(InvoicePaymentReversal).save(manager.getRepository(InvoicePaymentReversal).create({ invoicePaymentId: payment.invoicePaymentId, reversalAmount: payment.amount, reason: dto.reason.trim(), reversedAt: new Date(), reversedByUserId: user.userId }));
      payment.isReversed = true; payment.reversedAt = new Date(); await manager.getRepository(InvoicePayment).save(payment);
      if (dto.replacementPaymentMethodId && dto.replacementAmount) {
        const method = await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: dto.replacementPaymentMethodId, tenantId: user.tenantId, isActive: true });
        if (!method) throw new NotFoundException('Replacement payment method not found.');
        const tendered = money(dto.replacementAmount);
        const otherPayments = await manager.getRepository(InvoicePayment).findBy({ invoiceId, isReversed: false });
        const alreadyApplied = money(otherPayments.reduce((sum, row) => sum + Number(row.amount), 0));
        const remaining = money(Math.max(0, Number(invoice.grandTotal) - alreadyApplied));
        const applied = money(Math.min(tendered, remaining));
        await manager.getRepository(InvoicePayment).save(manager.getRepository(InvoicePayment).create({ invoiceId, paymentMethodId: method.paymentMethodId, amount: applied.toFixed(2), tenderedAmount: tendered.toFixed(2), changeAmount: Math.max(0, tendered - applied).toFixed(2), referenceNumber: dto.referenceNumber?.trim() || null, paidAt: new Date(), createdByUserId: user.userId, isReversed: false, reversedAt: null }));
      }
      await this.recalculateInvoicePayments(manager, invoice);
      return manager.getRepository(Invoice).findOne({ where: { invoiceId }, relations: { payments: { paymentMethod: true } } });
    });
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
    const payments = await manager.getRepository(InvoicePayment).findBy({ invoiceId: invoice.invoiceId, isReversed: false });
    const tendered = money(payments.reduce((sum, x) => sum + Number(x.tenderedAmount), 0)); const paid = money(Math.min(tendered, Number(invoice.grandTotal)));
    invoice.tenderedAmount = tendered.toFixed(2); invoice.paidAmount = paid.toFixed(2); invoice.changeAmount = Math.max(0, tendered - Number(invoice.grandTotal)).toFixed(2); invoice.balanceAmount = Math.max(0, Number(invoice.grandTotal) - paid).toFixed(2); invoice.paymentStatus = paid === 0 ? 'UNPAID' : paid < Number(invoice.grandTotal) ? 'PARTIALLY_PAID' : 'PAID'; await manager.getRepository(Invoice).save(invoice);
  }
  private refundNumber(id: number) { return `REF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(id).padStart(6, '0')}`; }
  private getWithManager(manager: EntityManager, id: number, tenantId: number) { return manager.getRepository(InvoiceRefund).findOne({ where: { invoiceRefundId: id, tenantId }, relations: { invoice: true, location: true, details: { product: true }, payments: { paymentMethod: true } } }); }
}
