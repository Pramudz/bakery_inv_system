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

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly dataSource: DataSource) {}

  list(user: TenantPrincipal) { return this.dataSource.getRepository(PurchaseOrder).findBy({ tenantId: user.tenantId }); }

  async get(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.find(id, user);
    const lines = await this.dataSource.getRepository(PurchaseOrderLine).findBy({ purchaseOrderId: id });
    return { ...purchaseOrder, lines };
  }

  async create(dto: CreatePurchaseOrderDto, user: TenantPrincipal) {
    await this.validateReferences(user, Number(dto.supplierId), Number(dto.locationId));
    return this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(PurchaseOrder);
      const { lines, ...header } = dto;
      const purchaseOrder = await repository.save(repository.create({ ...header, tenantId: user.tenantId, supplierId: Number(dto.supplierId), locationId: Number(dto.locationId), createdByUserId: user.userId, status: 'DRAFT', currencyCode: dto.currencyCode || 'LKR', isActive: true }));
      await this.saveLines(manager, purchaseOrder.purchaseOrderId, dto.lines, user.tenantId);
      return purchaseOrder;
    });
  }

  async update(id: number, dto: UpdatePurchaseOrderDto, user: TenantPrincipal) {
    const purchaseOrder = await this.find(id, user);
    if (purchaseOrder.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be edited.');
    await this.validateReferences(user, Number(dto.supplierId), Number(dto.locationId));
    return this.dataSource.transaction(async manager => {
      Object.assign(purchaseOrder, { ...dto, tenantId: user.tenantId, supplierId: Number(dto.supplierId), locationId: Number(dto.locationId), currencyCode: dto.currencyCode || 'LKR' });
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);
      await manager.getRepository(PurchaseOrderLine).delete({ purchaseOrderId: id });
      await this.saveLines(manager, id, dto.lines as PurchaseOrderLineDto[], user.tenantId);
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

  private async saveLines(manager: EntityManager, purchaseOrderId: number, rows: PurchaseOrderLineDto[], tenantId: number) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    for (const row of rows) {
      await this.assertProductAndUnit(manager, Number(row.productId), Number(row.unitId), tenantId);
      const quantity = Number(row.orderedQty), unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const netUnitCost = unitCost - discountAmount + taxAmount;
      const repository = manager.getRepository(PurchaseOrderLine);
      await repository.save(repository.create({ ...row, purchaseOrderId, productId: Number(row.productId), unitId: Number(row.unitId), orderedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost) }));
    }
  }

  private async validateReferences(user: TenantPrincipal, supplierId: number, locationId: number) {
    if (!await this.dataSource.getRepository(Supplier).findOneBy({ supplierId, tenantId: user.tenantId, isActive: true })) throw new NotFoundException('Supplier not found.');
    const location = await this.dataSource.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true });
    if (!location) throw new NotFoundException('Location not found.');
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
  }

  private async assertProductAndUnit(manager: EntityManager, productId: number, unitId: number, tenantId: number) {
    const product = await manager.getRepository(Product).findOneBy({ productId, tenantId, isActive: true });
    if (!product) throw new NotFoundException('Product not found.');
    if (Number(product.baseUnitId) === unitId) return;
    if (!await manager.getRepository(ProductUnit).findOneBy({ productId, unitId, isActive: true })) throw new BadRequestException('Unit is not valid for this product.');
  }

  private async find(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.dataSource.getRepository(PurchaseOrder).findOneBy({ purchaseOrderId: id, tenantId: user.tenantId });
    if (!purchaseOrder) throw new NotFoundException('Purchase order not found.');
    return purchaseOrder;
  }
}
