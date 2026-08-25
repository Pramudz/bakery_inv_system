import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { loadDocumentHeader } from '../../common/document-header';
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

  list(user: TenantPrincipal) { return this.dataSource.getRepository(PurchaseOrder).findBy({ tenantId: user.tenantId }); }

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
      if (purchaseOrder.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be approved.');
      const lines = await manager.getRepository(PurchaseOrderLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.purchaseOrderId = :id', { id }).getMany();
      if (!lines.length) throw new BadRequestException('Purchase order requires at least one line.');
      Object.assign(purchaseOrder, { status: 'APPROVED', approvedByUserId: user.userId, approvedAt: new Date() });
      return manager.getRepository(PurchaseOrder).save(purchaseOrder);
    });
  }

  async cancel(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const purchaseOrder = await this.lockPurchaseOrder(manager, id, user.tenantId);
      if (!['DRAFT', 'APPROVED', 'SENT'].includes(purchaseOrder.status)) throw new BadRequestException('Received purchase orders cannot be cancelled.');
      Object.assign(purchaseOrder, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
      return manager.getRepository(PurchaseOrder).save(purchaseOrder);
    });
  }

  private async saveLines(manager: EntityManager, purchaseOrderId: number, rows: PurchaseOrderLineDto[], tenantId: number, supplierId: number, locationId: number, orderDate: string, currencyCode: string) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    for (const row of rows) {
      const { productUnit, supplierUnit } = await this.resolvePurchasingContext(manager, Number(row.productId), Number(row.productUnitId), Number(row.unitId), tenantId, supplierId, locationId);
      const sourcePrice = await this.resolveSupplierPrice(manager, row, supplierUnit.productSupplierUnitId, orderDate, currencyCode);
      const quantity = Number(row.orderedQty), unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const costOverrideReason = this.costOverrideReason(row.costOverrideReason, sourcePrice ? unitCost !== Number(sourcePrice.purchasePrice) : true);
      const netUnitCost = unitCost - discountAmount + taxAmount;
      const repository = manager.getRepository(PurchaseOrderLine);
      await repository.save(repository.create({ ...row, ...productUnitSnapshot(productUnit), purchaseOrderId, productId: Number(row.productId), sourceSupplierPriceId: sourcePrice?.productSupplierPriceId ?? null, costOverrideReason, orderedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost) }));
    }
  }

  private async resolveSupplierPrice(manager: EntityManager, row: PurchaseOrderLineDto, productSupplierUnitId: number, orderDate: string, currencyCode: string) {
    if (!row.sourceSupplierPriceId) return null;
    const price = await manager.getRepository(ProductSupplierPrice).findOneBy({ productSupplierPriceId: Number(row.sourceSupplierPriceId) });
    const priceDate = this.effectiveDate(orderDate);
    if (!price || Number(price.productSupplierUnitId) !== productSupplierUnitId || Number(price.minimumQuantity) > Number(row.orderedQty) || price.currencyCode.toUpperCase() !== currencyCode || !price.isActive || Number(price.purchasePrice) <= 0 || price.effectiveFrom > priceDate || Boolean(price.effectiveTo && price.effectiveTo < priceDate))
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

  private effectiveDate(value: string) { return new Date(`${value.slice(0, 10)}T23:59:59.999`); }
  private currency(value: string) { return value.trim().toUpperCase(); }

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
    const purchaseOrder = await this.dataSource.getRepository(PurchaseOrder).findOneBy({ purchaseOrderId: id, tenantId: user.tenantId });
    if (!purchaseOrder) throw new NotFoundException('Purchase order not found.');
    return purchaseOrder;
  }
}
