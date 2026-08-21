import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Location } from '../locations/locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { CreatePurchaseOrderDto, PurchaseOrderLineDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatPurchaseOrderNumber } from '../number-sequences/number-sequence-formatters';
import { loadDocumentHeader } from '../../common/document-header';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { productUnitSnapshot } from '../../common/transaction-unit-snapshot';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numberSequences: NumberSequencesService,
  ) {}

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
      await this.validateReferences(manager, user, Number(dto.supplierId), Number(dto.locationId));
      const year = String(new Date().getFullYear());
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.PURCHASE_ORDER, year);
      const poNumber = formatPurchaseOrderNumber(user.tenantId, year, nextNumber);
      const repository = manager.getRepository(PurchaseOrder);
      const { lines, ...header } = dto;
      const purchaseOrder = await repository.save(repository.create({ ...header, poNumber, tenantId: user.tenantId, supplierId: Number(dto.supplierId), locationId: Number(dto.locationId), createdByUserId: user.userId, status: 'DRAFT', currencyCode: dto.currencyCode || 'LKR', isActive: true }));
      await this.saveLines(manager, purchaseOrder.purchaseOrderId, dto.lines, user.tenantId, Number(dto.supplierId), dto.orderDate, dto.currencyCode);
      return purchaseOrder;
    });
  }

  async update(id: number, dto: UpdatePurchaseOrderDto, user: TenantPrincipal) {
    const purchaseOrder = await this.find(id, user);
    if (purchaseOrder.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be edited.');
    return this.dataSource.transaction(async manager => {
      await this.validateReferences(manager, user, Number(dto.supplierId), Number(dto.locationId));
      Object.assign(purchaseOrder, { ...dto, tenantId: user.tenantId, supplierId: Number(dto.supplierId), locationId: Number(dto.locationId), currencyCode: dto.currencyCode || 'LKR' });
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);
      await manager.getRepository(PurchaseOrderLine).delete({ purchaseOrderId: id });
      await this.saveLines(manager, id, dto.lines as PurchaseOrderLineDto[], user.tenantId, Number(purchaseOrder.supplierId), purchaseOrder.orderDate, purchaseOrder.currencyCode);
      return purchaseOrder;
    });
  }

  async approve(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.find(id, user);
    if (purchaseOrder.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be approved.');
    Object.assign(purchaseOrder, { status: 'APPROVED', approvedByUserId: user.userId, approvedAt: new Date() });
    return this.dataSource.getRepository(PurchaseOrder).save(purchaseOrder);
  }

  async cancel(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.find(id, user);
    if (!['DRAFT', 'APPROVED', 'SENT'].includes(purchaseOrder.status)) throw new BadRequestException('Received purchase orders cannot be cancelled.');
    Object.assign(purchaseOrder, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
    return this.dataSource.getRepository(PurchaseOrder).save(purchaseOrder);
  }

  private async saveLines(manager: EntityManager, purchaseOrderId: number, rows: PurchaseOrderLineDto[], tenantId: number, supplierId: number, orderDate: string, currencyCode: string) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    for (const row of rows) {
      const productUnit = await this.resolveProductUnit(manager, Number(row.productId), Number(row.productUnitId), tenantId);
      await this.assertSupplierPriceSource(manager, row, supplierId, productUnit.productUnitId, orderDate, currencyCode);
      const quantity = Number(row.orderedQty), unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const netUnitCost = unitCost - discountAmount + taxAmount;
      const repository = manager.getRepository(PurchaseOrderLine);
      await repository.save(repository.create({ ...row, ...productUnitSnapshot(productUnit), purchaseOrderId, productId: Number(row.productId), orderedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost) }));
    }
  }

  private async assertSupplierPriceSource(manager: EntityManager, row: PurchaseOrderLineDto, supplierId: number, productUnitId: number, orderDate: string, currencyCode: string) {
    if (!row.sourceSupplierPriceId) return;
    const price = await manager.getRepository(ProductSupplierPrice).findOne({
      where: { productSupplierPriceId: Number(row.sourceSupplierPriceId) },
      relations: { productSupplierUnit: { productSupplier: true, productUnit: true } },
    });
    const priceDate = new Date(`${orderDate.slice(0, 10)}T12:00:00.000`);
    if (!price || Number(price.productSupplierUnit.productSupplier.productId) !== Number(row.productId) || Number(price.productSupplierUnit.productSupplier.supplierId) !== supplierId || Number(price.productSupplierUnit.productUnitId) !== productUnitId || !price.productSupplierUnit.isActive || Number(price.minimumQuantity) !== 1 || price.currencyCode !== currencyCode.toUpperCase() || !price.isActive || price.effectiveFrom > priceDate || Boolean(price.effectiveTo && price.effectiveTo < priceDate))
      throw new BadRequestException('Selected supplier price is not valid for this purchase order line.');
  }

  private async validateReferences(manager: EntityManager, user: TenantPrincipal, supplierId: number, locationId: number) {
    if (!await manager.getRepository(Supplier).findOneBy({ supplierId, tenantId: user.tenantId, isActive: true })) throw new NotFoundException('Supplier not found.');
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true });
    if (!location) throw new NotFoundException('Location not found.');
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
  }

  private async resolveProductUnit(manager: EntityManager, productId: number, productUnitId: number, tenantId: number) {
    const product = await manager.getRepository(Product).findOneBy({ productId, tenantId, isActive: true });
    if (!product) throw new NotFoundException('Product not found.');
    const productUnit = await manager.getRepository(ProductUnit).findOneBy({ productUnitId, productId, isActive: true, isPurchaseUnit: true });
    if (!productUnit) throw new BadRequestException('Product unit is not valid for this product.');
    return productUnit;
  }

  private async find(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.dataSource.getRepository(PurchaseOrder).findOneBy({ purchaseOrderId: id, tenantId: user.tenantId });
    if (!purchaseOrder) throw new NotFoundException('Purchase order not found.');
    return purchaseOrder;
  }
}
