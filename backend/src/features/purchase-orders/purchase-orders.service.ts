import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { loadDocumentHeader } from '../../common/document-header';
import { isEffectiveOnBusinessDate, tenantBusinessClock } from '../../common/business-date';
import { productUnitSnapshot } from '../../common/transaction-unit-snapshot';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatPurchaseOrderNumber } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { CreatePurchaseOrderDto, PurchaseOrderLineDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly dataSource: DataSource, private readonly numberSequences: NumberSequencesService) {}

  list(user: TenantPrincipal) {
    const query = this.dataSource.getRepository(PurchaseOrder).createQueryBuilder('po')
      .where('po.tenantId = :tenantId', { tenantId: user.tenantId })
      .orderBy('po.purchaseOrderId', 'DESC');
    if (user.accessScope === 'LOCATION') {
      if (!user.assignedLocationIds.length) query.andWhere('1 = 0');
      else query.andWhere('po.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.map(Number) });
    }
    return query.getMany();
  }

  async findPage(user: TenantPrincipal, page = 1, limit = 20, search = '', status = '') {
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const safeLimit = [20, 50, 100].includes(limit) ? limit : 20;
    const query = this.dataSource.getRepository(PurchaseOrder).createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.location', 'location')
      .where('po.tenantId = :tenantId', { tenantId: user.tenantId });
    if (user.accessScope === 'LOCATION') {
      if (!user.assignedLocationIds.length) query.andWhere('1 = 0');
      else query.andWhere('po.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.map(Number) });
    }
    if (search.trim()) query.andWhere(`(
      LOWER(COALESCE(po.poNumber, '')) LIKE :search OR
      LOWER(COALESCE(supplier.supplierCode, '')) LIKE :search OR
      LOWER(COALESCE(supplier.supplierName, '')) LIKE :search
    )`, { search: `%${search.trim().toLowerCase()}%` });
    if (['DRAFT', 'APPROVED', 'SENT', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED'].includes(status.toUpperCase()))
      query.andWhere('po.status = :status', { status: status.toUpperCase() });
    const total = await query.getCount();
    const result = await query.addSelect(subQuery => subQuery
      .select('COALESCE(SUM(line.lineTotal), 0)').from(PurchaseOrderLine, 'line')
      .where('line.purchaseOrderId = po.purchaseOrderId'), 'po_total')
      .orderBy('po.purchaseOrderId', 'DESC').skip((safePage - 1) * safeLimit).take(safeLimit).getRawAndEntities();
    return {
      items: result.entities.map((order, index) => ({ ...order, total: result.raw[index]?.po_total ?? '0' })),
      page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async get(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.find(id, user);
    const [lines, documentHeader] = await Promise.all([
      this.dataSource.getRepository(PurchaseOrderLine).find({ where: { purchaseOrderId: id }, relations: { product: true, productUnit: { unit: true } } }),
      loadDocumentHeader(this.dataSource, user.tenantId, Number(purchaseOrder.locationId)),
    ]);
    return { ...purchaseOrder, lines, documentHeader };
  }

  async create(dto: CreatePurchaseOrderDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const supplierId = Number(dto.supplierId), locationId = Number(dto.locationId), currencyCode = this.currency(dto.currencyCode);
      await this.validateReferences(manager, user, supplierId, locationId);
      const year = String(new Date().getFullYear());
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.PURCHASE_ORDER, year);
      const repository = manager.getRepository(PurchaseOrder);
      const { lines, ...header } = dto;
      const purchaseOrder = await repository.save(repository.create({ ...header, poNumber: formatPurchaseOrderNumber(user.tenantId, year, nextNumber), tenantId: user.tenantId, supplierId, locationId, createdByUserId: user.userId, status: 'DRAFT', currencyCode, isActive: true }));
      await this.saveLines(manager, purchaseOrder.purchaseOrderId, lines, user.tenantId, supplierId, locationId, dto.orderDate, currencyCode);
      return purchaseOrder;
    });
  }

  async update(id: number, dto: UpdatePurchaseOrderDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const purchaseOrder = await this.lockPurchaseOrder(manager, id, user.tenantId);
      if (purchaseOrder.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be edited.');
      this.assertLocationAccess(purchaseOrder.locationId, user);
      const supplierId = Number(dto.supplierId ?? purchaseOrder.supplierId), locationId = Number(dto.locationId ?? purchaseOrder.locationId);
      const currencyCode = this.currency(dto.currencyCode ?? purchaseOrder.currencyCode), orderDate = dto.orderDate ?? purchaseOrder.orderDate;
      await this.validateReferences(manager, user, supplierId, locationId);
      const { lines, ...header } = dto;
      Object.assign(purchaseOrder, { ...header, tenantId: user.tenantId, supplierId, locationId, currencyCode, orderDate });
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);
      if (lines) {
        await manager.getRepository(PurchaseOrderLine).delete({ purchaseOrderId: id });
        await this.saveLines(manager, id, lines, user.tenantId, supplierId, locationId, orderDate, currencyCode);
      }
      return purchaseOrder;
    });
  }

  async approve(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const purchaseOrder = await this.lockPurchaseOrder(manager, id, user.tenantId);
      this.assertLocationAccess(purchaseOrder.locationId, user);
      if (purchaseOrder.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be approved.');
      const lines = await manager.getRepository(PurchaseOrderLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.purchaseOrderId = :id', { id }).getMany();
      await this.validateForApproval(manager, purchaseOrder, lines, user);
      Object.assign(purchaseOrder, { status: 'APPROVED', approvedByUserId: user.userId, approvedAt: new Date() });
      return manager.getRepository(PurchaseOrder).save(purchaseOrder);
    });
  }

  private async validateForApproval(manager: EntityManager, purchaseOrder: PurchaseOrder, lines: PurchaseOrderLine[], user: TenantPrincipal) {
    const supplierId = Number(purchaseOrder.supplierId), locationId = Number(purchaseOrder.locationId);
    if (!Number.isSafeInteger(supplierId) || supplierId <= 0 || !Number.isSafeInteger(locationId) || locationId <= 0)
      throw new BadRequestException('Purchase order requires a supplier and receiving location.');
    if (!this.isDateOnly(purchaseOrder.orderDate) || (purchaseOrder.expectedDate != null && !this.isDateOnly(purchaseOrder.expectedDate)))
      throw new BadRequestException('Purchase order dates must be valid.');
    const currencyCode = this.currency(purchaseOrder.currencyCode || '');
    if (!/^[A-Z]{3}$/.test(currencyCode)) throw new BadRequestException('Purchase order currency must be a three-letter code.');
    await this.validateReferences(manager, user, supplierId, locationId);
    if (!lines.length) throw new BadRequestException('Purchase order requires at least one line.');

    const { timeZone } = await tenantBusinessClock(manager, user.tenantId);
    const seen = new Set<string>();
    for (const line of lines) {
      const productId = Number(line.productId), productUnitId = Number(line.productUnitId), unitId = Number(line.unitId);
      const quantity = Number(line.orderedQty), unitCost = Number(line.unitCost);
      const discountAmount = Number(line.discountAmount || 0), taxAmount = Number(line.taxAmount || 0);
      if (![productId, productUnitId, unitId].every(value => Number.isSafeInteger(value) && value > 0))
        throw new BadRequestException('Purchase order line has an invalid product or unit.');
      if (![quantity, unitCost, discountAmount, taxAmount].every(Number.isFinite) || quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0)
        throw new BadRequestException('Invalid quantity or cost.');
      const key = `${productId}:${productUnitId}`;
      if (seen.has(key)) throw new BadRequestException('A product purchase unit can appear only once on a purchase order.');
      seen.add(key);
      const { supplierUnit } = await this.resolvePurchasingContext(manager, productId, productUnitId, unitId, user.tenantId, supplierId, locationId);
      const row = {
        productId, productUnitId, unitId, orderedQty: quantity, unitCost,
        discountAmount, taxAmount,
        sourceSupplierPriceId: line.sourceSupplierPriceId == null ? undefined : Number(line.sourceSupplierPriceId),
        costOverrideReason: line.costOverrideReason ?? undefined,
      };
      const sourcePrice = await this.resolveSupplierPrice(manager, row, supplierUnit.productSupplierUnitId, purchaseOrder.orderDate, currencyCode, timeZone);
      this.costOverrideReason(row.costOverrideReason, sourcePrice ? unitCost !== Number(sourcePrice.purchasePrice) : true);
    }
  }

  async cancel(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const purchaseOrder = await this.lockPurchaseOrder(manager, id, user.tenantId);
      this.assertLocationAccess(purchaseOrder.locationId, user);
      if (!['DRAFT', 'APPROVED', 'SENT'].includes(purchaseOrder.status)) throw new BadRequestException('Received purchase orders cannot be cancelled.');
      Object.assign(purchaseOrder, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
      return manager.getRepository(PurchaseOrder).save(purchaseOrder);
    });
  }

  private async saveLines(manager: EntityManager, purchaseOrderId: number, rows: PurchaseOrderLineDto[], tenantId: number, supplierId: number, locationId: number, orderDate: string, currencyCode: string) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    const { timeZone } = await tenantBusinessClock(manager, tenantId);
    for (const row of rows) {
      const { productUnit, supplierUnit } = await this.resolvePurchasingContext(manager, Number(row.productId), Number(row.productUnitId), Number(row.unitId), tenantId, supplierId, locationId);
      const sourcePrice = await this.resolveSupplierPrice(manager, row, supplierUnit.productSupplierUnitId, orderDate, currencyCode, timeZone);
      const quantity = Number(row.orderedQty), unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const costOverrideReason = this.costOverrideReason(row.costOverrideReason, sourcePrice ? unitCost !== Number(sourcePrice.purchasePrice) : true);
      const netUnitCost = unitCost - discountAmount + taxAmount;
      const repository = manager.getRepository(PurchaseOrderLine);
      await repository.save(repository.create({ ...row, ...productUnitSnapshot(productUnit), purchaseOrderId, productId: Number(row.productId), sourceSupplierPriceId: sourcePrice?.productSupplierPriceId ?? null, costOverrideReason, orderedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost) }));
    }
  }

  private async resolveSupplierPrice(manager: EntityManager, row: PurchaseOrderLineDto, productSupplierUnitId: number, orderDate: string, currencyCode: string, timeZone: string) {
    if (!row.sourceSupplierPriceId) return null;
    const price = await manager.getRepository(ProductSupplierPrice).findOneBy({ productSupplierPriceId: Number(row.sourceSupplierPriceId) });
    if (!price || Number(price.productSupplierUnitId) !== Number(productSupplierUnitId) || Number(price.minimumQuantity) > Number(row.orderedQty) || price.currencyCode.toUpperCase() !== currencyCode || !price.isActive || Number(price.purchasePrice) <= 0 || !isEffectiveOnBusinessDate(price, orderDate.slice(0, 10), timeZone))
      throw new BadRequestException('Selected supplier price is not valid for this purchase order line.');
    return price;
  }

  private async resolvePurchasingContext(manager: EntityManager, productId: number, productUnitId: number, clientUnitId: number, tenantId: number, supplierId: number, locationId: number) {
    if (!await manager.getRepository(Product).findOneBy({ productId, tenantId, isActive: true, isPurchasable: true })) throw new BadRequestException('Product is not active and purchasable.');
    if (!await manager.getRepository(ProductLocation).findOneBy({ productId, locationId, isActive: true, isPurchasable: true })) throw new BadRequestException('Product is not active and purchasable at the selected location.');
    const productUnit = await manager.getRepository(ProductUnit).findOneBy({ productUnitId, productId, isActive: true, isPurchaseUnit: true });
    if (!productUnit) throw new BadRequestException('Product unit is not a valid active purchase unit for this product.');
    if (Number(productUnit.unitId) !== clientUnitId) throw new BadRequestException('Unit does not match the selected Product Unit.');
    const supplierLink = await manager.getRepository(ProductSupplier).findOneBy({ productId, supplierId, isActive: true });
    if (!supplierLink) throw new BadRequestException('Supplier is not active for this product.');
    const supplierUnit = await manager.getRepository(ProductSupplierUnit).findOneBy({ productSupplierId: supplierLink.productSupplierId, productUnitId, isActive: true });
    if (!supplierUnit) throw new BadRequestException('Supplier purchase unit is not active for this product and supplier.');
    return { productUnit, supplierUnit };
  }

  private costOverrideReason(value: string | undefined, required: boolean) {
    const reason = value?.trim() || null;
    if (required && !reason) throw new BadRequestException('A cost override reason is required when unit cost differs from the supplier price or no supplier price is selected.');
    return reason;
  }

  private currency(value: string) { return value.trim().toUpperCase(); }

  private isDateOnly(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.slice(0, 10) ?? '');
    if (!match || value.length !== 10) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
  }

  private async validateReferences(manager: EntityManager, user: TenantPrincipal, supplierId: number, locationId: number) {
    if (!await manager.getRepository(Supplier).findOneBy({ supplierId, tenantId: user.tenantId, isActive: true })) throw new NotFoundException('Supplier not found.');
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true });
    if (!location) throw new NotFoundException('Location not found.');
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
  }

  private async lockPurchaseOrder(manager: EntityManager, id: number, tenantId: number) {
    const purchaseOrder = await manager.getRepository(PurchaseOrder).createQueryBuilder('po').setLock('pessimistic_write').where('po.purchaseOrderId = :id AND po.tenantId = :tenantId', { id, tenantId }).getOne();
    if (!purchaseOrder) throw new NotFoundException('Purchase order not found.');
    return purchaseOrder;
  }

  private async find(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.dataSource.getRepository(PurchaseOrder).findOne({ where: { purchaseOrderId: id, tenantId: user.tenantId }, relations: { supplier: true, location: true } });
    if (!purchaseOrder) throw new NotFoundException('Purchase order not found.');
    this.assertLocationAccess(purchaseOrder.locationId, user);
    return purchaseOrder;
  }

  private assertLocationAccess(locationId: number, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(locationId)))
      throw new ForbiddenException('User is not assigned to this location.');
  }
}
