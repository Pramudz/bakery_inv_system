import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, MoreThan, Not, IsNull } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Customer } from '../customers/customers.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Location } from '../locations/locations.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { Product } from '../products/products.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Invoice } from './invoice.entity';
import { ReceiveInvoicePaymentDto } from './dto/receive-invoice-payment.dto';
import { snapshotInvoiceReceipt } from './invoice-receipt';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class InvoicesService {
  constructor(private readonly dataSource: DataSource) {}

  pendingPayments(user: TenantPrincipal) {
    return this.dataSource.getRepository(Invoice).find({
      where: {
        tenantId: user.tenantId, invoiceStatus: 'COMPLETED', balanceAmount: MoreThan('0'),
        ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}),
      },
      relations: { customer: true, location: true },
      order: { invoiceDate: 'ASC', invoiceId: 'ASC' },
    });
  }

  collectionHistory(user: TenantPrincipal) {
    return this.dataSource.getRepository(InvoicePayment).find({
      where: {
        collectionKey: Not(IsNull()),
        invoice: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) },
      },
      relations: { invoice: { customer: true, location: true }, paymentMethod: true },
      order: { invoicePaymentId: 'DESC' },
    });
  }

  async receivePayment(id: number, dto: ReceiveInvoicePaymentDto, user: TenantPrincipal) {
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
      const repo = manager.getRepository(InvoicePayment);
      const existing = await repo.findOneBy({ invoiceId: invoice.invoiceId, collectionKey: dto.collectionKey });
      if (existing) {
        if (Number(existing.amount) !== dto.amount || Number(existing.paymentMethodId) !== dto.paymentMethodId || existing.referenceNumber !== (dto.referenceNumber?.trim() || null)) {
          throw new BadRequestException('This receipt request was already used for a different payment. Refresh and try again.');
        }
        return existing;
      }
      if (invoice.invoiceStatus !== 'COMPLETED') throw new BadRequestException('Only completed invoices without refunds can receive payments here.');
      const before = money(Number(invoice.balanceAmount));
      if (before <= 0 || dto.amount > before) throw new BadRequestException(`Payment cannot exceed the remaining balance of ${before.toFixed(2)}.`);
      const method = await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: dto.paymentMethodId, tenantId: user.tenantId, isActive: true });
      if (!method) throw new NotFoundException('Active payment method not found.');
      const after = money(before - dto.amount);
      const payment = await repo.save(repo.create({
        invoiceId: invoice.invoiceId, paymentMethodId: method.paymentMethodId, amount: dto.amount.toFixed(2),
        tenderedAmount: dto.amount.toFixed(2), changeAmount: '0.00', referenceNumber: dto.referenceNumber?.trim() || null,
        paidAt: new Date(), createdByUserId: user.userId, isReversed: false, reversedAt: null,
        collectionKey: dto.collectionKey, balanceBefore: before.toFixed(2), balanceAfter: after.toFixed(2),
      }));
      invoice.paidAmount = money(Number(invoice.paidAmount) + dto.amount).toFixed(2);
      invoice.tenderedAmount = money(Number(invoice.tenderedAmount) + dto.amount).toFixed(2);
      invoice.balanceAmount = after.toFixed(2);
      invoice.paymentStatus = after === 0 ? 'PAID' : 'PARTIALLY_PAID';
      await invoiceRepo.save(invoice);
      return payment;
    });
  }

  list(user: TenantPrincipal) {
    return this.dataSource.getRepository(Invoice).find({
      where: { tenantId: user.tenantId },
      relations: { customer: true, location: true, payments: { paymentMethod: true } },
      order: { invoiceId: 'DESC' },
    });
  }

  async get(id: number, user: TenantPrincipal) {
    const invoice = await this.dataSource.getRepository(Invoice).findOne({
      where: { invoiceId: id, tenantId: user.tenantId },
      relations: { customer: true, location: true, details: { product: true }, payments: { paymentMethod: true } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return invoice;
  }

  async create(dto: CreateInvoiceDto, user: TenantPrincipal) {
    await this.validateHeader(dto, user);
    return this.dataSource.transaction(async (manager) => {
      const preparedDetails = dto.details.map((line) => {
        const quantity = Number(line.quantity);
        const unitPrice = money(Number(line.unitPrice));
        const grossTotal = money(quantity * unitPrice);
        const percentage = Number(line.discountPercentage ?? 0);
        const discountAmount = money(line.discountAmount ?? grossTotal * percentage / 100);
        if (percentage > 100 || discountAmount > grossTotal) throw new BadRequestException('A line discount cannot exceed its gross total.');
        return { ...line, quantity, unitPrice, discountPercentage: percentage, discountAmount, grossTotal, netTotal: money(grossTotal - discountAmount) };
      });
      const subtotal = money(preparedDetails.reduce((sum, line) => sum + line.grossTotal, 0));
      const discountTotal = money(preparedDetails.reduce((sum, line) => sum + line.discountAmount, 0));
      const grandTotal = money(subtotal - discountTotal);
      const tenderedAmount = money((dto.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0));
      const paidAmount = money(Math.min(tenderedAmount, grandTotal));
      const changeAmount = money(Math.max(0, tenderedAmount - grandTotal));

      const invoiceRepo = manager.getRepository(Invoice);
      const invoice = await invoiceRepo.save(invoiceRepo.create({
        tenantId: user.tenantId,
        locationId: dto.locationId,
        customerId: dto.customerId ?? null,
        invoiceNumber: `PENDING-${Date.now()}-${user.userId}`,
        invoiceDate: new Date(),
        saleType: dto.saleType,
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        tenderedAmount: tenderedAmount.toFixed(2),
        changeAmount: changeAmount.toFixed(2),
        balanceAmount: money(grandTotal - paidAmount).toFixed(2),
        paymentStatus: paidAmount === 0 ? 'UNPAID' : paidAmount < grandTotal ? 'PARTIALLY_PAID' : 'PAID',
        invoiceStatus: 'COMPLETED',
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

      let remainingToApply = grandTotal;
      for (const payment of dto.payments ?? []) {
        const method = await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: payment.paymentMethodId, tenantId: user.tenantId, isActive: true });
        if (!method) throw new NotFoundException(`Payment method ${payment.paymentMethodId} was not found.`);
        const tendered = money(Number(payment.amount));
        const applied = money(Math.min(tendered, remainingToApply));
        const change = money(tendered - applied);
        remainingToApply = money(Math.max(0, remainingToApply - applied));
        await manager.getRepository(InvoicePayment).save(manager.getRepository(InvoicePayment).create({
          invoiceId: invoice.invoiceId, paymentMethodId: payment.paymentMethodId, amount: applied.toFixed(2), tenderedAmount: tendered.toFixed(2), changeAmount: change.toFixed(2),
          referenceNumber: payment.referenceNumber?.trim() || null, paidAt: new Date(), createdByUserId: user.userId,
        }));
      }
      const completed = (await this.getWithManager(manager, invoice.invoiceId, user.tenantId))!;
      completed.receiptSnapshot = snapshotInvoiceReceipt(completed);
      await invoiceRepo.update(invoice.invoiceId, { receiptSnapshot: completed.receiptSnapshot });
      return completed;
    });
  }

  async catalog(locationId: number, user: TenantPrincipal) {
    await this.validateLocation(locationId, user);
    return this.dataSource.query(`
      SELECT p.product_id AS productId, p.sku AS code, p.product_name AS name,
        COALESCE(c.category_name, 'Uncategorized') AS category,
        COALESCE(MAX(CASE WHEN UPPER(pl.price_list_type) = 'RETAIL' THEN pli.selling_price END), MAX(pli.selling_price), 0) AS retailPrice,
        COALESCE(MAX(CASE WHEN UPPER(pl.price_list_type) = 'WHOLESALE' THEN pli.selling_price END), MAX(pli.selling_price), 0) AS wholesalePrice,
        COALESCE(ib.quantity_on_hand, 0) AS stock
      FROM tbl_product p
      LEFT JOIN tbl_category c ON c.category_id = p.category_id
      LEFT JOIN tbl_price_list_item pli ON pli.product_id = p.product_id AND pli.is_active = 1
      LEFT JOIN tbl_price_list pl ON pl.price_list_id = pli.price_list_id AND pl.tenant_id = p.tenant_id AND pl.is_active = 1
      LEFT JOIN tbl_inventory_balance ib ON ib.product_id = p.product_id AND ib.tenant_id = p.tenant_id AND ib.location_id = ?
      WHERE p.tenant_id = ? AND p.is_active = 1 AND p.is_sellable = 1
      GROUP BY p.product_id, p.sku, p.product_name, c.category_name, ib.quantity_on_hand
      ORDER BY p.product_name`, [locationId, user.tenantId]);
  }

  private async validateHeader(dto: CreateInvoiceDto, user: TenantPrincipal) {
    await this.validateLocation(dto.locationId, user);
    if (dto.customerId && !(await this.dataSource.getRepository(Customer).findOneBy({ customerId: dto.customerId, tenantId: user.tenantId, isActive: true }))) {
      throw new NotFoundException('Customer not found.');
    }
  }

  private async validateLocation(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.includes(locationId)) throw new ForbiddenException('You do not have access to this location.');
    if (!(await this.dataSource.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true }))) throw new NotFoundException('Location not found.');
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
    return manager.getRepository(Invoice).findOne({ where: { invoiceId: id, tenantId }, relations: { customer: true, location: true, details: { product: true }, payments: { paymentMethod: true } } });
  }
}
