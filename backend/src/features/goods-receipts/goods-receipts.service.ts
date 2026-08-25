import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { loadDocumentHeader } from '../../common/document-header';
import { baseInventorySnapshot, purchaseOrderLineSnapshot, productUnitSnapshot } from '../../common/transaction-unit-snapshot';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryAgeLayerService } from '../inventory-age-layers/inventory-age-layer.service';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { Location } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatGoodsReceiptNumber } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
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
    if (!['PO_BASED', 'DIRECT'].includes(dto.receiptType)) throw new BadRequestException('Receipt type must be PO_BASED or DIRECT.');
    return this.dataSource.transaction(async manager => {
      const tenant = await manager.getRepository(Tenant).findOneBy({ tenantId: user.tenantId });
      if (!tenant) throw new NotFoundException('Tenant not found.');
      if (dto.receiptType === 'DIRECT' && (!tenant.allowDirectGrn || tenant.poRequiredForGrn)) throw new ForbiddenException('Direct GRN is disabled for this tenant.');

      let supplierId = Number(dto.supplierId), locationId = Number(dto.locationId), currencyCode = this.currency(dto.currencyCode);
      let purchaseOrder: PurchaseOrder | null = null;
      if (dto.receiptType === 'PO_BASED') {
        if (!dto.purchaseOrderId) throw new BadRequestException('PO-based GRNs require a purchase order.');
        purchaseOrder = await this.lockPurchaseOrder(manager, Number(dto.purchaseOrderId), user.tenantId);
        this.assertPoHeader(purchaseOrder, supplierId, locationId, currencyCode);
        supplierId = Number(purchaseOrder.supplierId); locationId = Number(purchaseOrder.locationId); currencyCode = purchaseOrder.currencyCode.toUpperCase();
      } else if (dto.purchaseOrderId) throw new BadRequestException('Direct GRNs cannot reference a purchase order.');

      await this.validateReferences(manager, user, supplierId, locationId);
      const repository = manager.getRepository(GoodsReceipt);
      const { lines, ...header } = dto;
      const goodsReceipt = await repository.save(repository.create({ ...header, tenantId: user.tenantId, receiptType: dto.receiptType, supplierId, locationId, supplierInvoiceDate: dto.supplierInvoiceDate || null, purchaseOrderId: purchaseOrder?.purchaseOrderId ?? null, createdByUserId: user.userId, status: 'DRAFT', currencyCode, isActive: true }));
      await this.saveLines(manager, goodsReceipt, lines, purchaseOrder);
      return goodsReceipt;
    });
  }

  async update(id: number, dto: UpdateGoodsReceiptDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const goodsReceipt = await this.lockGoodsReceipt(manager, id, user.tenantId);
      if (goodsReceipt.status !== 'DRAFT') throw new BadRequestException('Only draft GRNs can be edited.');
      if (dto.receiptType && dto.receiptType !== goodsReceipt.receiptType) throw new BadRequestException('Receipt type cannot be changed after creation.');
      if (dto.purchaseOrderId !== undefined && Number(dto.purchaseOrderId) !== Number(goodsReceipt.purchaseOrderId)) throw new BadRequestException('Purchase order cannot be changed after GRN creation.');

      let supplierId = Number(dto.supplierId ?? goodsReceipt.supplierId), locationId = Number(dto.locationId ?? goodsReceipt.locationId);
      let currencyCode = this.currency(dto.currencyCode ?? goodsReceipt.currencyCode), purchaseOrder: PurchaseOrder | null = null;
      if (goodsReceipt.receiptType === 'PO_BASED') {
        purchaseOrder = await this.lockPurchaseOrder(manager, Number(goodsReceipt.purchaseOrderId), user.tenantId);
        this.assertPoHeader(purchaseOrder, supplierId, locationId, currencyCode);
        supplierId = Number(purchaseOrder.supplierId); locationId = Number(purchaseOrder.locationId); currencyCode = purchaseOrder.currencyCode.toUpperCase();
      }
      await this.validateReferences(manager, user, supplierId, locationId);
      const { lines, ...header } = dto;
      Object.assign(goodsReceipt, { ...header, tenantId: user.tenantId, receiptType: goodsReceipt.receiptType, purchaseOrderId: goodsReceipt.purchaseOrderId, supplierId, locationId, currencyCode, supplierInvoiceDate: dto.supplierInvoiceDate === undefined ? goodsReceipt.supplierInvoiceDate : dto.supplierInvoiceDate || null });
      await manager.getRepository(GoodsReceipt).save(goodsReceipt);
      if (lines) {
        await manager.getRepository(GoodsReceiptLine).delete({ goodsReceiptId: id });
        await this.saveLines(manager, goodsReceipt, lines, purchaseOrder);
      }
      return goodsReceipt;
    });
  }

  async cancel(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const goodsReceipt = await this.lockGoodsReceipt(manager, id, user.tenantId);
      if (goodsReceipt.status === 'POSTED') throw new BadRequestException('Posted GRN cannot be cancelled directly. Use inventory reversal/return workflow.');
      if (goodsReceipt.status === 'CANCELLED') throw new BadRequestException('GRN is already cancelled.');
      Object.assign(goodsReceipt, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
      return manager.getRepository(GoodsReceipt).save(goodsReceipt);
    });
  }

  async post(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const goodsReceipt = await this.lockGoodsReceipt(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(goodsReceipt.locationId));
      if (goodsReceipt.status !== 'DRAFT') throw new BadRequestException('Only draft GRNs can be posted.');

      let purchaseOrder: PurchaseOrder | null = null;
      if (goodsReceipt.receiptType === 'PO_BASED') {
        purchaseOrder = await this.lockPurchaseOrder(manager, Number(goodsReceipt.purchaseOrderId), user.tenantId);
        this.assertPoHeader(purchaseOrder, Number(goodsReceipt.supplierId), Number(goodsReceipt.locationId), goodsReceipt.currencyCode.toUpperCase());
        await manager.getRepository(PurchaseOrderLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.purchaseOrderId = :id', { id: purchaseOrder.purchaseOrderId }).getMany();
      }

      const lines = await manager.getRepository(GoodsReceiptLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.goodsReceiptId = :id', { id }).getMany();
      if (!lines.length) throw new BadRequestException('GRN requires at least one line.');
      const year = String(new Date().getFullYear());
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.GOODS_RECEIPT, year);
      goodsReceipt.grnNumber = formatGoodsReceiptNumber(user.tenantId, year, nextNumber);

      for (const line of lines) {
        const quantity = Number(line.receivedQty), cost = Number(line.netUnitCost);
        if (quantity <= 0 || cost < 0) throw new BadRequestException('Invalid receipt quantity or cost.');
        if (!line.productUnitId || !line.conversionFactorSnapshot) throw new BadRequestException('This historical GRN line has no reliable product-unit conversion snapshot and cannot be posted until it is reviewed.');
        if (goodsReceipt.receiptType === 'PO_BASED') await this.receivePoLine(manager, goodsReceipt, line, quantity);
        else await this.assertDirectLineStillEligible(manager, goodsReceipt, line);
        await this.lockInventoryContext(manager, goodsReceipt, line);
        await this.addInventory(manager, goodsReceipt, line, quantity, cost, user);
      }
      if (purchaseOrder) await this.refreshPoStatus(manager, purchaseOrder);
      Object.assign(goodsReceipt, { status: 'POSTED', postedByUserId: user.userId, postedAt: new Date() });
      return manager.getRepository(GoodsReceipt).save(goodsReceipt);
    });
  }

  private async saveLines(manager: EntityManager, receipt: GoodsReceipt, rows: GoodsReceiptLineDto[], purchaseOrder: PurchaseOrder | null) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('At least one line is required.');
    for (const row of rows) {
      let productId = Number(row.productId), productUnitId = Number(row.productUnitId), unitId: number, conversionFactorSnapshot: string;
      let unitCost = Number(row.unitCost), discountAmount = Number(row.discountAmount || 0), taxAmount = Number(row.taxAmount || 0);
      let sourceSupplierPriceId = row.sourceSupplierPriceId ?? null, costOverrideReason: string | null;
      if (receipt.receiptType === 'PO_BASED') {
        if (!row.purchaseOrderLineId || !purchaseOrder) throw new BadRequestException('PO receipt line is required.');
        const poLine = await manager.getRepository(PurchaseOrderLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.purchaseOrderLineId = :lineId AND line.purchaseOrderId = :poId', { lineId: Number(row.purchaseOrderLineId), poId: purchaseOrder.purchaseOrderId }).getOne();
        if (!poLine?.productUnitId || !poLine.conversionFactorSnapshot) throw new BadRequestException('The selected PO line has no reliable product-unit conversion snapshot.');
        const snapshot = purchaseOrderLineSnapshot(poLine);
        if (productId !== snapshot.productId || productUnitId !== snapshot.productUnitId || Number(row.unitId) !== snapshot.unitId) throw new BadRequestException('Receipt product and unit must match the selected PO line.');
        productId = snapshot.productId; productUnitId = snapshot.productUnitId; unitId = snapshot.unitId; conversionFactorSnapshot = snapshot.conversionFactorSnapshot;
        discountAmount = Number(snapshot.discountAmount); taxAmount = Number(snapshot.taxAmount); sourceSupplierPriceId = snapshot.sourceSupplierPriceId;
        costOverrideReason = this.costOverrideReason(row.costOverrideReason, unitCost !== Number(snapshot.unitCost), 'PO cost snapshot');
      } else {
        const { productUnit, supplierUnit } = await this.resolveDirectPurchasingContext(manager, productId, productUnitId, Number(row.unitId), receipt.tenantId, Number(receipt.supplierId), Number(receipt.locationId));
        ({ unitId, conversionFactorSnapshot } = productUnitSnapshot(productUnit));
        const sourcePrice = await this.resolveDirectSupplierPrice(manager, row, supplierUnit.productSupplierUnitId, receipt.receiptDate, receipt.currencyCode);
        sourceSupplierPriceId = sourcePrice?.productSupplierPriceId ?? null;
        costOverrideReason = this.costOverrideReason(row.costOverrideReason, sourcePrice ? unitCost !== Number(sourcePrice.purchasePrice) : true, 'supplier price');
      }
      const quantity = Number(row.receivedQty);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0) throw new BadRequestException('Invalid quantity or cost.');
      const netUnitCost = unitCost - discountAmount + taxAmount;
      const repository = manager.getRepository(GoodsReceiptLine);
      await repository.save(repository.create({ ...row, goodsReceiptId: receipt.goodsReceiptId, productId, productUnitId, unitId, conversionFactorSnapshot, sourceSupplierPriceId, costOverrideReason, receivedQty: String(quantity), unitCost: String(unitCost), discountAmount: String(discountAmount), taxAmount: String(taxAmount), netUnitCost: String(netUnitCost), lineTotal: String(quantity * netUnitCost), manufactureDate: row.manufactureDate || null, expiryDate: row.expiryDate || null }));
    }
  }

  private async receivePoLine(manager: EntityManager, receipt: GoodsReceipt, line: GoodsReceiptLine, quantity: number) {
    if (!line.purchaseOrderLineId) throw new BadRequestException('PO receipt line is required.');
    const poLine = await manager.getRepository(PurchaseOrderLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.purchaseOrderLineId = :lineId AND line.purchaseOrderId = :poId', { lineId: Number(line.purchaseOrderLineId), poId: Number(receipt.purchaseOrderId) }).getOne();
    if (!poLine || Number(poLine.productId) !== Number(line.productId) || Number(poLine.productUnitId) !== Number(line.productUnitId) || Number(poLine.unitId) !== Number(line.unitId)) throw new BadRequestException('Receipt line does not match the purchase order.');
    if (Number(poLine.receivedQty) + quantity > Number(poLine.orderedQty)) throw new BadRequestException('Receipt exceeds remaining PO quantity.');
    poLine.receivedQty = String(Number(poLine.receivedQty) + quantity);
    poLine.status = Number(poLine.receivedQty) >= Number(poLine.orderedQty) ? 'RECEIVED' : 'PART_RECEIVED';
    await manager.getRepository(PurchaseOrderLine).save(poLine);
  }

  private async refreshPoStatus(manager: EntityManager, purchaseOrder: PurchaseOrder) {
    const lines = await manager.getRepository(PurchaseOrderLine).findBy({ purchaseOrderId: purchaseOrder.purchaseOrderId });
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

  private async resolveDirectPurchasingContext(manager: EntityManager, productId: number, productUnitId: number, clientUnitId: number, tenantId: number, supplierId: number, locationId: number) {
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

  private async resolveDirectSupplierPrice(manager: EntityManager, row: { sourceSupplierPriceId?: number | null; receivedQty: number | string }, productSupplierUnitId: number, receiptDate: string, currencyCode: string) {
    if (!row.sourceSupplierPriceId) return null;
    const price = await manager.getRepository(ProductSupplierPrice).findOneBy({ productSupplierPriceId: Number(row.sourceSupplierPriceId) });
    const effectiveDate = this.effectiveDate(receiptDate);
    if (!price || Number(price.productSupplierUnitId) !== productSupplierUnitId || Number(price.minimumQuantity) > Number(row.receivedQty) || !price.isActive || Number(price.purchasePrice) <= 0 || price.currencyCode.toUpperCase() !== currencyCode.toUpperCase() || price.effectiveFrom > effectiveDate || Boolean(price.effectiveTo && price.effectiveTo < effectiveDate)) throw new BadRequestException('Selected supplier price is not valid for this goods receipt line on the receipt date.');
    return price;
  }

  private async assertDirectLineStillEligible(manager: EntityManager, receipt: GoodsReceipt, line: GoodsReceiptLine) {
    const { supplierUnit } = await this.resolveDirectPurchasingContext(manager, Number(line.productId), Number(line.productUnitId), Number(line.unitId), receipt.tenantId, Number(receipt.supplierId), Number(receipt.locationId));
    if (line.sourceSupplierPriceId) {
      await this.resolveDirectSupplierPrice(manager, { sourceSupplierPriceId: line.sourceSupplierPriceId, receivedQty: Number(line.receivedQty) }, supplierUnit.productSupplierUnitId, receipt.receiptDate, receipt.currencyCode);
    }
  }

  private async lockInventoryContext(manager: EntityManager, receipt: GoodsReceipt, line: GoodsReceiptLine) {
    const context = await manager.getRepository(ProductLocation).createQueryBuilder('productLocation').setLock('pessimistic_write').where('productLocation.productId = :productId AND productLocation.locationId = :locationId', { productId: line.productId, locationId: receipt.locationId }).getOne();
    if (!context) throw new BadRequestException('Product location is not configured for inventory posting.');
  }

  private assertPoHeader(po: PurchaseOrder, supplierId: number, locationId: number, currencyCode: string) {
    if (!['APPROVED', 'SENT', 'PART_RECEIVED'].includes(po.status) || Number(po.supplierId) !== supplierId || Number(po.locationId) !== locationId || po.currencyCode.toUpperCase() !== currencyCode.toUpperCase()) throw new BadRequestException('PO supplier, location, tenant, currency, or status is not eligible for this receipt.');
  }

  private costOverrideReason(value: string | undefined, required: boolean, baseline: string) {
    const reason = value?.trim() || null;
    if (required && !reason) throw new BadRequestException(`A cost override reason is required when receipt unit cost differs from the ${baseline}.`);
    return reason;
  }

  private effectiveDate(value: string) { return new Date(`${value.slice(0, 10)}T23:59:59.999`); }
  private currency(value: string) { return value.trim().toUpperCase(); }

  private async validateReferences(manager: EntityManager, user: TenantPrincipal, supplierId: number, locationId: number) {
    if (!await manager.getRepository(Supplier).findOneBy({ supplierId, tenantId: user.tenantId, isActive: true })) throw new NotFoundException('Supplier not found.');
    await this.assertLocationAccess(manager, user, locationId);
  }

  private async assertLocationAccess(manager: EntityManager, user: TenantPrincipal, locationId: number) {
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, isActive: true });
    if (!location) throw new NotFoundException('Location not found.');
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
  }

  private async lockGoodsReceipt(manager: EntityManager, id: number, tenantId: number) {
    const receipt = await manager.getRepository(GoodsReceipt).createQueryBuilder('grn').setLock('pessimistic_write').where('grn.goodsReceiptId = :id AND grn.tenantId = :tenantId', { id, tenantId }).getOne();
    if (!receipt) throw new NotFoundException('GRN not found.');
    return receipt;
  }

  private async lockPurchaseOrder(manager: EntityManager, id: number, tenantId: number) {
    const po = await manager.getRepository(PurchaseOrder).createQueryBuilder('po').setLock('pessimistic_write').where('po.purchaseOrderId = :id AND po.tenantId = :tenantId', { id, tenantId }).getOne();
    if (!po) throw new NotFoundException('Purchase order not found.');
    return po;
  }

  private async find(id: number, user: TenantPrincipal) {
    const grn = await this.dataSource.getRepository(GoodsReceipt).findOneBy({ goodsReceiptId: id, tenantId: user.tenantId });
    if (!grn) throw new NotFoundException('GRN not found.');
    return grn;
  }
}
