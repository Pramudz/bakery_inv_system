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
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatGoodsReceiptNumber } from '../number-sequences/number-sequence-formatters';
import { loadDocumentHeader } from '../../common/document-header';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { baseInventorySnapshot, purchaseOrderLineSnapshot, productUnitSnapshot } from '../../common/transaction-unit-snapshot';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balances: InventoryBalanceService,
    private readonly ledgers: InventoryLedgerService,
    private readonly ageLayers: InventoryAgeLayerService,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  list(user: TenantPrincipal) { return this.dataSource.getRepository(GoodsReceipt).findBy({ tenantId: user.tenantId }); }
  async get(id: number, user: TenantPrincipal) {
    const goodsReceipt = await this.find(id, user);
    const [lines, documentHeader] = await Promise.all([
      this.dataSource.getRepository(GoodsReceiptLine).find({ where: { goodsReceiptId: id }, relations: { product: true, productUnit: { unit: true } } }),
      loadDocumentHeader(this.dataSource, user.tenantId, Number(goodsReceipt.locationId)),
    ]);
    return { ...goodsReceipt, lines, documentHeader };
  }

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
      await this.saveLines(manager, goodsReceipt.goodsReceiptId, dto.lines, user.tenantId, Number(dto.supplierId), receiptType, goodsReceipt.purchaseOrderId);
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
      await this.saveLines(manager, id, dto.lines as GoodsReceiptLineDto[], user.tenantId, Number(dto.supplierId), goodsReceipt.receiptType, goodsReceipt.purchaseOrderId);
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
      const year = String(new Date().getFullYear());
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.GOODS_RECEIPT, year);
      goodsReceipt.grnNumber = formatGoodsReceiptNumber(user.tenantId, year, nextNumber);
      const lines = await manager.getRepository(GoodsReceiptLine).findBy({ goodsReceiptId: id });
      if (!lines.length) throw new BadRequestException('GRN requires at least one line.');
      for (const line of lines) {
        const quantity = Number(line.receivedQty), cost = Number(line.netUnitCost);
        if (quantity <= 0 || cost < 0) throw new BadRequestException('Invalid receipt quantity or cost.');
        if (!line.productUnitId || !line.conversionFactorSnapshot)
          throw new BadRequestException('This historical GRN line has no reliable product-unit conversion snapshot and cannot be posted until it is reviewed.');
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
    if (!poLine || Number(poLine.productId) !== Number(line.productId) || Number(poLine.productUnitId) !== Number(line.productUnitId)) throw new BadRequestException('Receipt line does not match the purchase order.');
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
    const conversionFactor = Number(line.conversionFactorSnapshot);
    if (!(conversionFactor > 0)) throw new BadRequestException('Invalid product-unit conversion snapshot.');
    const { baseQuantity, baseUnitCost, movementValue } = baseInventorySnapshot(quantity, cost, conversionFactor);
    const movement = await this.balances.addStock(manager, user.tenantId, grn.locationId, line.productId, baseQuantity, baseUnitCost);
    await this.ledgers.insert(manager, { tenantId: user.tenantId, locationId: grn.locationId, productId: line.productId, movementDate: new Date(), movementType: 'GRN', sourceDocumentType: 'GRN', sourceDocumentId: grn.goodsReceiptId, sourceDocumentLineId: line.goodsReceiptLineId, quantityIn: String(baseQuantity), quantityOut: '0', unitCost: String(baseUnitCost), movementValue: String(movementValue), quantityBefore: String(movement.quantityBefore), quantityAfter: String(movement.quantityAfter), averageCostBefore: String(movement.averageCostBefore), averageCostAfter: String(movement.averageCostAfter), createdByUserId: user.userId });
    await this.ageLayers.insert(manager, { tenantId: user.tenantId, locationId: grn.locationId, productId: line.productId, sourceDocumentType: 'GRN', sourceDocumentId: grn.goodsReceiptId, sourceDocumentLineId: line.goodsReceiptLineId, receiptDate: grn.receiptDate, originalQuantity: String(baseQuantity), remainingQuantity: String(baseQuantity), originalUnitCost: String(baseUnitCost), batchNumber: line.batchNumber, manufactureDate: line.manufactureDate, expiryDate: line.expiryDate, isActive: true });
  }

  private async saveLines(manager: EntityManager, goodsReceiptId: number, rows: GoodsReceiptLineDto[], tenantId: number, supplierId: number, receiptType: string, purchaseOrderId: number | null) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    for (const row of rows) {
      let productId = Number(row.productId), productUnitId = Number(row.productUnitId), unitId: number, conversionFactorSnapshot: string;
      let unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0), sourceSupplierPriceId = row.sourceSupplierPriceId ?? null;
      let agreedNetUnitCost: number | null = null;
      if (receiptType === 'PO_BASED') {
        if (!row.purchaseOrderLineId || !purchaseOrderId) throw new BadRequestException('PO receipt line is required.');
        const poLine = await manager.getRepository(PurchaseOrderLine).findOneBy({ purchaseOrderLineId: Number(row.purchaseOrderLineId), purchaseOrderId: Number(purchaseOrderId) });
        if (!poLine?.productUnitId || !poLine.conversionFactorSnapshot)
          throw new BadRequestException('The selected PO line has no reliable product-unit conversion snapshot.');
        const snapshot = purchaseOrderLineSnapshot(poLine);
        productId = snapshot.productId; productUnitId = snapshot.productUnitId; unitId = snapshot.unitId;
        conversionFactorSnapshot = snapshot.conversionFactorSnapshot;
        unitCost = Number(snapshot.unitCost); discountAmount = Number(snapshot.discountAmount); taxAmount = Number(snapshot.taxAmount);
        agreedNetUnitCost = Number(snapshot.netUnitCost);
        sourceSupplierPriceId = snapshot.sourceSupplierPriceId;
      } else {
        const productUnit = await this.resolveProductUnit(manager, productId, productUnitId, tenantId);
        ({ unitId, conversionFactorSnapshot } = productUnitSnapshot(productUnit));
        await this.assertSupplierPriceSource(manager, row, supplierId, productUnitId);
      }
      const quantity = Number(row.receivedQty);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const netUnitCost = agreedNetUnitCost ?? (unitCost - discountAmount + taxAmount);
      const repository = manager.getRepository(GoodsReceiptLine);
      await repository.save(repository.create({ ...row, goodsReceiptId, productId, productUnitId, unitId, conversionFactorSnapshot, sourceSupplierPriceId, receivedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost), manufactureDate: row.manufactureDate || null, expiryDate: row.expiryDate || null }));
    }
  }

  private async assertSupplierPriceSource(manager: EntityManager, row: GoodsReceiptLineDto, supplierId: number, productUnitId: number) {
    if (!row.sourceSupplierPriceId) return;
    const price = await manager.getRepository(ProductSupplierPrice).findOne({
      where: { productSupplierPriceId: Number(row.sourceSupplierPriceId) },
      relations: { productSupplierUnit: { productSupplier: true, productUnit: true } },
    });
    if (!price || Number(price.productSupplierUnit.productSupplier.productId) !== Number(row.productId) || Number(price.productSupplierUnit.productSupplier.supplierId) !== supplierId || Number(price.productSupplierUnit.productUnitId) !== productUnitId || !price.productSupplierUnit.isActive || Number(price.minimumQuantity) !== 1)
      throw new BadRequestException('Selected supplier price is not valid for this goods receipt line.');
  }

  private async validateReferences(user: TenantPrincipal, supplierId: number, locationId: number) { if (!await this.dataSource.getRepository(Supplier).findOneBy({ supplierId, tenantId: user.tenantId, isActive: true })) throw new NotFoundException('Supplier not found.'); await this.assertLocationAccess(user, locationId); }
  private async assertLocationAccess(user: TenantPrincipal, locationId: number) { const location = await this.dataSource.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true }); if (!location) throw new NotFoundException('Location not found.'); if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.'); }
  private async resolveProductUnit(manager: EntityManager, productId: number, productUnitId: number, tenantId: number) { const product = await manager.getRepository(Product).findOneBy({ productId, tenantId, isActive: true }); if (!product) throw new NotFoundException('Product not found.'); const productUnit = await manager.getRepository(ProductUnit).findOneBy({ productUnitId, productId, isActive: true, isPurchaseUnit: true }); if (!productUnit) throw new BadRequestException('Product unit is not a valid active purchase unit for this product.'); return productUnit; }
  private async find(id: number, user: TenantPrincipal) { const grn = await this.dataSource.getRepository(GoodsReceipt).findOneBy({ goodsReceiptId: id, tenantId: user.tenantId }); if (!grn) throw new NotFoundException('GRN not found.'); return grn; }
  private async findPo(id: number, user: TenantPrincipal) { const po = await this.dataSource.getRepository(PurchaseOrder).findOneBy({ purchaseOrderId: id, tenantId: user.tenantId }); if (!po) throw new NotFoundException('Purchase order not found.'); return po; }
}
