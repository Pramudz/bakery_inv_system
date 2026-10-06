import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { TenantPrincipal } from '../auth/auth.types';
import { Customer } from '../customers/customers.entity';
import { Location } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatQuotationNumber } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { PosPricingService } from '../invoices/pos-pricing.service';
import { InvoicesService } from '../invoices/invoices.service';
import { QuoteInvoiceDto } from '../invoices/dto/quote-invoice.dto';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { SaveQuotationDto } from './dto/save-quotation.dto';
import { Quotation, QuotationStatus } from './quotation.entity';
import { QuotationLine } from './quotation-line.entity';

@Injectable()
export class QuotationsService {
  constructor(private readonly dataSource: DataSource, private readonly pricing: PosPricingService, private readonly sequences: NumberSequencesService, private readonly invoices: InvoicesService) {}

  catalog(locationId: number, saleType: 'RETAIL' | 'WHOLESALE', user: TenantPrincipal) { return this.invoices.catalog(locationId, saleType, user); }
  price(dto: QuoteInvoiceDto, user: TenantPrincipal) { return this.invoices.quote(dto, user); }

  private access(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId)))
      throw new ForbiddenException('You do not have access to this location.');
  }

  async locations(user: TenantPrincipal) {
    return this.dataSource.getRepository(Location).find({ where: { tenantId: user.tenantId, isActive: true, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds.length ? user.assignedLocationIds : [-1]) } : {}) }, order: { name: 'ASC' } });
  }

  customers(user: TenantPrincipal) {
    return this.dataSource.getRepository(Customer).find({ where: { tenantId: user.tenantId, isActive: true }, order: { customerName: 'ASC' } });
  }

  async list(user: TenantPrincipal, filters: Record<string, string | undefined>) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const clock = await tenantBusinessClock(this.dataSource.manager, user.tenantId);
    const q = this.dataSource.getRepository(Quotation).createQueryBuilder('quotation')
      .leftJoinAndSelect('quotation.createdByUser', 'preparedBy')
      .where('quotation.tenantId = :tenantId', { tenantId: user.tenantId });
    if (user.accessScope === 'LOCATION') q.andWhere('quotation.locationId IN (:...ids)', { ids: user.assignedLocationIds.length ? user.assignedLocationIds : [-1] });
    if (filters.locationId) q.andWhere('quotation.locationId = :locationId', { locationId: Number(filters.locationId) });
    if (filters.customerId) q.andWhere('quotation.customerId = :customerId', { customerId: Number(filters.customerId) });
    if (filters.dateFrom) q.andWhere('quotation.quotationDate >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) q.andWhere('quotation.quotationDate <= :dateTo', { dateTo: filters.dateTo });
    if (filters.status === 'EXPIRED') q.andWhere('quotation.status = :status AND quotation.validUntil < :today', { status: 'SENT', today: clock.businessDate });
    else if (filters.status) q.andWhere('quotation.status = :status', { status: filters.status });
    if (filters.quotationType) q.andWhere('quotation.quotationType = :quotationType', { quotationType: filters.quotationType });
    if (filters.quotationNumber) q.andWhere('quotation.quotationNumber LIKE :number', { number: `%${filters.quotationNumber.slice(0, 50)}%` });
    if (filters.customer) q.andWhere('(quotation.customerNameSnapshot LIKE :customer OR quotation.customerCodeSnapshot LIKE :customer OR quotation.customerPhoneSnapshot LIKE :customer)', { customer: `%${filters.customer.slice(0, 100)}%` });
    const [items, total] = await q.orderBy('quotation.quotationId', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items: items.map(x => ({ ...x, effectiveStatus: x.status === 'SENT' && x.validUntil < clock.businessDate ? 'EXPIRED' : x.status })), total, page, limit };
  }

  async get(id: number, user: TenantPrincipal) {
    const quote = await this.dataSource.getRepository(Quotation).findOne({ where: { quotationId: id, tenantId: user.tenantId }, relations: { lines: true, createdByUser: true, convertedInvoice: true }, order: { lines: { lineNumber: 'ASC' } } });
    if (!quote) throw new NotFoundException('Quotation not found.');
    this.access(quote.locationId, user);
    const clock = await tenantBusinessClock(this.dataSource.manager, user.tenantId);
    return { ...quote, effectiveStatus: quote.status === 'SENT' && quote.validUntil < clock.businessDate ? 'EXPIRED' : quote.status };
  }

  async create(dto: SaveQuotationDto, user: TenantPrincipal) {
    const id = await this.dataSource.transaction(async manager => (await this.saveDraft(manager, null, dto, user)).quotationId);
    return this.get(id, user);
  }

  async update(id: number, dto: SaveQuotationDto, user: TenantPrincipal) {
    await this.dataSource.transaction(async manager => {
      const quote = await this.lock(manager, id, user);
      if (quote.status !== 'DRAFT') throw new ConflictException('Only draft quotations can be edited.');
      await this.saveDraft(manager, quote, dto, user);
    });
    return this.get(id, user);
  }

  private async saveDraft(manager: EntityManager, existing: Quotation | null, dto: SaveQuotationDto, user: TenantPrincipal) {
    this.access(dto.locationId, user);
    const location = await manager.getRepository(Location).findOneBy({ locationId: dto.locationId, tenantId: user.tenantId, isActive: true });
    if (!location) throw new NotFoundException('Location not found.');
    const customer = await manager.getRepository(Customer).findOneBy({ customerId: dto.customerId, tenantId: user.tenantId, isActive: true });
    if (!customer) throw new NotFoundException('Customer not found.');
    if (dto.validUntil < dto.quotationDate) throw new BadRequestException('Valid until must be on or after the quotation date.');
    if (new Set(dto.lines.map(x => x.productId)).size !== dto.lines.length) throw new BadRequestException('Duplicate quotation products are not allowed.');
    if (dto.lines.some(x => !Number.isFinite(x.quantity) || x.quantity <= 0 || x.quantity > 1000000)) throw new BadRequestException('Invalid quotation quantity.');
    const pricing = await this.pricing.quoteWithManager(manager, user.tenantId, dto.locationId, dto.quotationType, dto.lines);
    const clock = await tenantBusinessClock(manager, user.tenantId);
    const number = existing?.quotationNumber ?? formatQuotationNumber(user.tenantId, clock.businessDate.slice(0, 4), await this.sequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.SALES_QUOTATION, clock.businessDate.slice(0, 4)));
    const repo = manager.getRepository(Quotation);
    const quote = await repo.save(repo.create({
      ...(existing ?? {}), tenantId: user.tenantId, quotationNumber: number, locationId: location.locationId,
      customerId: customer.customerId, quotationDate: dto.quotationDate, validUntil: dto.validUntil,
      status: 'DRAFT', quotationType: dto.quotationType, subtotal: pricing.subtotal.toFixed(2),
      discountTotal: pricing.discountTotal.toFixed(2), grandTotal: pricing.grandTotal.toFixed(2),
      notes: dto.notes?.trim() || null, termsAndConditions: dto.termsAndConditions?.trim() || null,
      customerNameSnapshot: customer.customerName, customerCodeSnapshot: customer.customerCode,
      customerPhoneSnapshot: customer.phone ?? customer.mobile ?? null, customerEmailSnapshot: customer.email ?? null,
      customerAddressSnapshot: [customer.addressLine1, customer.addressLine2, customer.city].filter(Boolean).join(', ') || null,
      locationCodeSnapshot: location.code, locationNameSnapshot: location.name,
      createdByUserId: existing?.createdByUserId ?? user.userId, updatedByUserId: user.userId,
    }));
    if (existing) await manager.getRepository(QuotationLine).delete({ quotationId: quote.quotationId });
    for (const [i, line] of pricing.lines.entries()) {
      const product = await manager.getRepository(Product).findOne({ where: { productId: line.productId, tenantId: user.tenantId }, relations: { baseUnit: true } });
      if (!product || !product.baseUnit || Number(product.baseUnit.unitId) !== Number((await manager.getRepository(UnitOfMeasure).findOneBy({ unitId: product.baseUnitId, tenantId: user.tenantId }))?.unitId)) throw new BadRequestException('Invalid product unit.');
      await manager.getRepository(QuotationLine).save(manager.getRepository(QuotationLine).create({
        quotationId: quote.quotationId, lineNumber: i + 1, productId: product.productId,
        productCodeSnapshot: product.sku, productNameSnapshot: product.productName,
        unitId: product.baseUnitId, unitCodeSnapshot: product.baseUnit.code, unitNameSnapshot: product.baseUnit.name,
        quantity: line.quantity.toFixed(4), listPrice: line.unitPrice.toFixed(2), unitPrice: line.unitPrice.toFixed(2),
        discountPercent: line.discountPercentage.toFixed(4), discountAmount: line.discountAmount.toFixed(2),
        grossTotal: line.grossTotal.toFixed(2), netTotal: line.netTotal.toFixed(2),
      }));
    }
    return quote;
  }

  private async lock(manager: EntityManager, id: number, user: TenantPrincipal) {
    const quote = await manager.getRepository(Quotation).findOne({ where: { quotationId: id, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
    if (!quote) throw new NotFoundException('Quotation not found.');
    this.access(quote.locationId, user);
    return quote;
  }

  async transition(id: number, action: 'send' | 'accept' | 'reject' | 'cancel', user: TenantPrincipal) {
    await this.dataSource.transaction(async manager => {
      const quote = await this.lock(manager, id, user);
      const allowed: Record<string, QuotationStatus[]> = { send: ['DRAFT'], accept: ['SENT'], reject: ['SENT'], cancel: ['DRAFT', 'SENT'] };
      if (!allowed[action].includes(quote.status)) throw new ConflictException(`Cannot ${action} a ${quote.status.toLowerCase()} quotation.`);
      const clock = await tenantBusinessClock(manager, user.tenantId);
      if (action === 'accept' && quote.validUntil < clock.businessDate) throw new ConflictException(`Quotation expired on ${quote.validUntil}.`);
      const status: Record<string, QuotationStatus> = { send: 'SENT', accept: 'ACCEPTED', reject: 'REJECTED', cancel: 'CANCELLED' };
      quote.status = status[action];
      (quote as any)[`${action === 'send' ? 'sent' : action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'cancelled'}At`] = clock.now;
      (quote as any)[`${action === 'send' ? 'sent' : action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'cancelled'}ByUserId`] = user.userId;
      quote.updatedByUserId = user.userId;
      await manager.getRepository(Quotation).save(quote);
    });
    return this.get(id, user);
  }

  async posPreview(id: number, user: TenantPrincipal) {
    const quote = await this.get(id, user);
    if (quote.status !== 'ACCEPTED') throw new ConflictException('Only accepted quotations can be converted to POS.');
    return quote;
  }
}
