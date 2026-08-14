import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryAgeLayerService } from '../inventory-age-layers/inventory-age-layer.service';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { Location } from '../locations/locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { PurchaseOrderLine } from '../purchase-orders/purchase-order-line.entity';
import { PurchaseOrder } from '../purchase-orders/purchase-order.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { Tenant } from '../tenants/tenant.entity';
import { CreateGoodsReceiptDto, GoodsReceiptLineDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { GoodsReceiptLine } from './goods-receipt-line.entity';
import { GoodsReceipt } from './goods-receipt.entity';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balances: InventoryBalanceService,
    private readonly ledgers: InventoryLedgerService,
    private readonly ageLayers: InventoryAgeLayerService,
  ) {}

  list(user: TenantPrincipal) { return this.dataSource.getRepository(GoodsReceipt).findBy({ tenantId: user.tenantId }); }
  async get(id: number, user: TenantPrincipal) { const goodsReceipt = await this.find(id, user); const lines = await this.dataSource.getRepository(GoodsReceiptLine).findBy({ goodsReceiptId: id }); return { ...goodsReceipt, lines }; }

  async create(dto: CreateGoodsReceiptDto, user: TenantPrincipal) {
    const receiptType = dto.receiptType;
    if (!['PO_BASED', 'DIRECT'].includes(receiptType)) throw new BadRequestException('Receipt type must be PO_BASED or DIRECT.');
    const tenant = await this.dataSource.getRepository(Tenant).findOneBy({ tenantId: user.tenantId });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    if (receiptType === 'DIRECT' && (!tenant.allowDirectGrn || tenant.poRequiredForGrn)) throw new ForbiddenException('Direct GRN is disabled for this tenant.');
    await this.validateReferences(user, Number(dto.supplierId), Number(dto.locationId));
    if (receiptType === 'PO_BASED') {
      const purchaseOrder = await this.findPo(Number(dto.purchaseOrderId), user);
      if (!['APPROVED', 'SENT', 'PART_RECEIVED'].includes(purchaseOrder.status) || Number(purchaseOrder.supplierId) !== Number(dto.supplierId) || Number(purchaseOrder.locationId) !== Number(dto.locationId)) throw new BadRequestException('PO is not eligible for this receipt.');
    } else if (dto.purchaseOrderId) throw new BadRequestException('Direct GRNs cannot reference a purchase order.');
    return this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(GoodsReceipt);
      const { lines, ...header } = dto;
      const goodsReceipt = await repository.save(repository.create({ ...header, tenantId: user.tenantId, receiptType, supplierId: Number(dto.supplierId), locationId: Number(dto.locationId), supplierInvoiceDate: dto.supplierInvoiceDate || null, purchaseOrderId: receiptType === 'PO_BASED' ? Number(dto.purchaseOrderId) : null, createdByUserId: user.userId, status: 'DRAFT', currencyCode: dto.currencyCode || 'LKR', isActive: true }));
      await this.saveLines(manager, goodsReceipt.goodsReceiptId, dto.lines, user.tenantId);
      return goodsReceipt;
    });
  }

  async update(id: number, dto: UpdateGoodsReceiptDto, user: TenantPrincipal) {
    const goodsReceipt = await this.find(id, user);
    if (goodsReceipt.status !== 'DRAFT') throw new BadRequestException('Only draft GRNs can be edited.');
    if (dto.receiptType && dto.receiptType !== goodsReceipt.receiptType) throw new BadRequestException('Receipt type cannot be changed after creation.');
    await this.validateReferences(user, Number(dto.supplierId), Number(dto.locationId));
    return this.dataSource.transaction(async manager => {
      Object.assign(goodsReceipt, { ...dto, tenantId: user.tenantId, receiptType: goodsReceipt.receiptType, supplierId: Number(dto.supplierId), locationId: Number(dto.locationId), supplierInvoiceDate: dto.supplierInvoiceDate || null });
      await manager.getRepository(GoodsReceipt).save(goodsReceipt);
      await manager.getRepository(GoodsReceiptLine).delete({ goodsReceiptId: id });
      await this.saveLines(manager, id, dto.lines as GoodsReceiptLineDto[], user.tenantId);
      return goodsReceipt;
    });
  }

  async cancel(id: number, user: TenantPrincipal) {
    const goodsReceipt = await this.find(id, user);
    if (goodsReceipt.status === 'POSTED') throw new BadRequestException('Posted GRN cannot be cancelled directly. Use inventory reversal/return workflow.');
    if (goodsReceipt.status === 'CANCELLED') throw new BadRequestException('GRN is already cancelled.');
    Object.assign(goodsReceipt, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
    return this.dataSource.getRepository(GoodsReceipt).save(goodsReceipt);
  }

  async post(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const goodsReceipt = await manager.getRepository(GoodsReceipt).findOneBy({ goodsReceiptId: id, tenantId: user.tenantId });
      if (!goodsReceipt) throw new NotFoundException('GRN not found.');
      await this.assertLocationAccess(user, Number(goodsReceipt.locationId));
      if (goodsReceipt.status !== 'DRAFT') throw new BadRequestException('Only draft GRNs can be posted.');
      const lines = await manager.getRepository(GoodsReceiptLine).findBy({ goodsReceiptId: id });
      if (!lines.length) throw new BadRequestException('GRN requires at least one line.');
      for (const line of lines) {
        await this.assertProductAndUnit(manager, Number(line.productId), Number(line.unitId), user.tenantId);
        const quantity = Number(line.receivedQty), cost = Number(line.netUnitCost);
        if (quantity <= 0 || cost < 0) throw new BadRequestException('Invalid receipt quantity or cost.');
        if (goodsReceipt.receiptType === 'PO_BASED') await this.receivePoLine(manager, goodsReceipt, line, quantity);
        await this.addInventory(manager, goodsReceipt, line, quantity, cost, user);
      }
      if (goodsReceipt.purchaseOrderId) await this.refreshPoStatus(manager, Number(goodsReceipt.purchaseOrderId));
      Object.assign(goodsReceipt, { status: 'POSTED', postedByUserId: user.userId, postedAt: new Date() });
      return manager.getRepository(GoodsReceipt).save(goodsReceipt);
    });
  }

  private async receivePoLine(manager: EntityManager, goodsReceipt: GoodsReceipt, line: GoodsReceiptLine, quantity: number) {
    if (!line.purchaseOrderLineId) throw new BadRequestException('PO receipt line is required.');
    const poLine = await manager.getRepository(PurchaseOrderLine).findOneBy({ purchaseOrderLineId: Number(line.purchaseOrderLineId), purchaseOrderId: Number(goodsReceipt.purchaseOrderId) });
    if (!poLine || Number(poLine.productId) !== Number(line.productId) || Number(poLine.unitId) !== Number(line.unitId)) throw new BadRequestException('Receipt line does not match the purchase order.');
    if (Number(poLine.receivedQty) + quantity > Number(poLine.orderedQty)) throw new BadRequestException('Receipt exceeds remaining PO quantity.');
    poLine.receivedQty = String(Number(poLine.receivedQty) + quantity);
    poLine.status = Number(poLine.receivedQty) >= Number(poLine.orderedQty) ? 'RECEIVED' : 'PART_RECEIVED';
    await manager.getRepository(PurchaseOrderLine).save(poLine);
  }

  private async refreshPoStatus(manager: EntityManager, purchaseOrderId: number) {
    const purchaseOrder = await manager.getRepository(PurchaseOrder).findOneByOrFail({ purchaseOrderId });
    const lines = await manager.getRepository(PurchaseOrderLine).findBy({ purchaseOrderId });
    purchaseOrder.status = lines.every(line => Number(line.receivedQty) >= Number(line.orderedQty)) ? 'RECEIVED' : 'PART_RECEIVED';
    await manager.getRepository(PurchaseOrder).save(purchaseOrder);
  }

  private async addInventory(manager: EntityManager, grn: GoodsReceipt, line: GoodsReceiptLine, quantity: number, cost: number, user: TenantPrincipal) {
    const movement = await this.balances.addStock(manager, user.tenantId, grn.locationId, line.productId, quantity, cost);
    await this.ledgers.insert(manager, { tenantId: user.tenantId, locationId: grn.locationId, productId: line.productId, movementDate: new Date(), movementType: 'GRN', sourceDocumentType: 'GRN', sourceDocumentId: grn.goodsReceiptId, sourceDocumentLineId: line.goodsReceiptLineId, quantityIn: String(quantity), quantityOut: '0', unitCost: String(cost), movementValue: String(quantity * cost), quantityBefore: String(movement.quantityBefore), quantityAfter: String(movement.quantityAfter), averageCostBefore: String(movement.averageCostBefore), averageCostAfter: String(movement.averageCostAfter), createdByUserId: user.userId });
    await this.ageLayers.insert(manager, { tenantId: user.tenantId, locationId: grn.locationId, productId: line.productId, sourceDocumentType: 'GRN', sourceDocumentId: grn.goodsReceiptId, sourceDocumentLineId: line.goodsReceiptLineId, receiptDate: grn.receiptDate, originalQuantity: String(quantity), remainingQuantity: String(quantity), originalUnitCost: String(cost), batchNumber: line.batchNumber, manufactureDate: line.manufactureDate, expiryDate: line.expiryDate, isActive: true });
  }

  private async saveLines(manager: EntityManager, goodsReceiptId: number, rows: GoodsReceiptLineDto[], tenantId: number) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    for (const row of rows) {
      await this.assertProductAndUnit(manager, Number(row.productId), Number(row.unitId), tenantId);
      const quantity = Number(row.receivedQty), unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const netUnitCost = unitCost - discountAmount + taxAmount;
      const repository = manager.getRepository(GoodsReceiptLine);
      await repository.save(repository.create({ ...row, goodsReceiptId, productId: Number(row.productId), unitId: Number(row.unitId), receivedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost), manufactureDate: row.manufactureDate || null, expiryDate: row.expiryDate || null }));
    }
  }

  private async validateReferences(user: TenantPrincipal, supplierId: number, locationId: number) { if (!await this.dataSource.getRepository(Supplier).findOneBy({ supplierId, tenantId: user.tenantId, isActive: true })) throw new NotFoundException('Supplier not found.'); await this.assertLocationAccess(user, locationId); }
  private async assertLocationAccess(user: TenantPrincipal, locationId: number) { const location = await this.dataSource.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true }); if (!location) throw new NotFoundException('Location not found.'); if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.'); }
  private async assertProductAndUnit(manager: EntityManager, productId: number, unitId: number, tenantId: number) { const product = await manager.getRepository(Product).findOneBy({ productId, tenantId, isActive: true }); if (!product) throw new NotFoundException('Product not found.'); if (Number(product.baseUnitId) === unitId) return; if (!await manager.getRepository(ProductUnit).findOneBy({ productId, unitId, isActive: true })) throw new BadRequestException('Unit is not valid for this product.'); }
  private async find(id: number, user: TenantPrincipal) { const grn = await this.dataSource.getRepository(GoodsReceipt).findOneBy({ goodsReceiptId: id, tenantId: user.tenantId }); if (!grn) throw new NotFoundException('GRN not found.'); return grn; }
  private async findPo(id: number, user: TenantPrincipal) { const po = await this.dataSource.getRepository(PurchaseOrder).findOneBy({ purchaseOrderId: id, tenantId: user.tenantId }); if (!po) throw new NotFoundException('Purchase order not found.'); return po; }
}
