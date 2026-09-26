import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { sum4, units } from '../../common/inventory-decimal';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { User } from '../users/user.entity';
import { ReverseGoodsReceiptDto } from './dto/reverse-goods-receipt.dto';
import { orderReceivedStatus, prepareReversal } from './goods-receipt-reversal';
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

  list(user: TenantPrincipal) { return this.dataSource.getRepository(GoodsReceipt).findBy({ tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { locationId: In(user.assignedLocationIds) } : {}) }); }

  async reversalPreview(id: number, user: TenantPrincipal) {
    this.assertId(id);
    return this.dataSource.transaction(async manager => {
      const receipt = await manager.getRepository(GoodsReceipt).findOne({ where: { goodsReceiptId: id, tenantId: user.tenantId }, relations: { supplier: true, location: true, purchaseOrder: true } });
      if (!receipt) throw new NotFoundException('GRN not found.');
      await this.assertLocationAccess(manager, user, Number(receipt.locationId));
      const lines = await manager.getRepository(GoodsReceiptLine).find({ where: { goodsReceiptId: id }, relations: { product: { baseUnit: true }, productUnit: { unit: true }, unit: true } });
      const lineById = new Map(lines.map(line => [String(line.goodsReceiptLineId), line]));
      const display = (line: GoodsReceiptLine) => {
        const product = String(line.product?.tenantId) === String(receipt.tenantId) ? line.product : null;
        const purchaseUnit = line.productUnit && String(line.productUnit.productId) === String(line.productId) && String(line.productUnit.unitId) === String(line.unitId) && String(line.productUnit.unit?.tenantId) === String(receipt.tenantId) ? line.productUnit.unit : null;
        const unit = String(line.unit?.tenantId) === String(receipt.tenantId) ? line.unit : null;
        const sku = product?.sku ?? '';
        const productName = product?.productName ?? '';
        return {
          sku,
          productName,
          productDisplayName: [sku, productName].filter(Boolean).join(' — ') || 'Product unavailable',
          purchaseUnitCode: purchaseUnit?.code ?? unit?.code ?? '',
          purchaseUnitName: purchaseUnit?.name ?? unit?.name ?? '',
          baseUnitCode: product && String(product.baseUnit?.tenantId) === String(receipt.tenantId) ? product.baseUnit.code : '',
          conversionFactor: line.conversionFactorSnapshot ?? (purchaseUnit ? line.productUnit?.conversionFactor : null) ?? '',
        };
      };
      try {
        const { preview } = await prepareReversal(manager, receipt, this.balances, false);
        const affectedIds = [...new Set(lines.filter(line => line.purchaseOrderLineId != null && units(line.receivedQty) > 0n).map(line => String(line.purchaseOrderLineId)))];
        const poLines = affectedIds.length && receipt.purchaseOrderId != null
          ? await manager.getRepository(PurchaseOrderLine).find({ where: { purchaseOrderId: receipt.purchaseOrderId, purchaseOrderLineId: In(affectedIds) }, relations: { product: true } })
          : [];
        const poLineById = new Map(poLines.map(line => [String(line.purchaseOrderLineId), line]));
        const purchaseOrderImpact = preview.purchaseOrderImpact && {
          ...preview.purchaseOrderImpact,
          lines: preview.purchaseOrderImpact.lines.filter(line => affectedIds.includes(String(line.purchaseOrderLineId))).map(line => {
            const poLine = poLineById.get(String(line.purchaseOrderLineId));
            const product = poLine && String(poLine.product?.tenantId) === String(receipt.tenantId) ? poLine.product : null;
            const sku = product?.sku ?? '';
            const productName = product?.productName ?? '';
            return {
              ...line,
              productId: poLine?.productId ?? null,
              sku,
              productName,
              productDisplayName: [sku, productName].filter(Boolean).join(' — ') || 'Product unavailable',
              orderedQty: poLine?.orderedQty ?? '0.0000',
              reversalQty: sum4(lines.filter(receiptLine => String(receiptLine.purchaseOrderLineId) === String(line.purchaseOrderLineId)).map(receiptLine => receiptLine.receivedQty)),
            };
          }),
        };
        return { ...preview, receipt: { ...receipt, ...await this.auditNames(manager, receipt) }, lines: preview.lines.map(line => ({ ...line, ...display(lineById.get(String(line.goodsReceiptLineId))!) })), purchaseOrderImpact };
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        return { receipt, lines: lines.map(line => {
          const { product, productUnit, unit, ...values } = line;
          return { ...values, ...display(line) };
        }), eligible: false, blockingReason: error.message };
      }
    });
  }

  async reverse(id: number, dto: ReverseGoodsReceiptDto, user: TenantPrincipal) {
    this.assertId(id);
    if (typeof dto.reason !== 'string' || !dto.reason.trim() || dto.reason.trim().length > 1000 || (dto.confirmNegativeStock !== undefined && typeof dto.confirmNegativeStock !== 'boolean'))
      throw new BadRequestException('A reversal reason of 1 to 1000 characters and a valid confirmation are required.');
    try {
      return await this.dataSource.transaction(async manager => {
        const clock = await tenantBusinessClock(manager, user.tenantId);
        const receipt = await this.lockGoodsReceipt(manager, id, user.tenantId);
        await this.assertLocationAccess(manager, user, Number(receipt.locationId));
        const plan = await prepareReversal(manager, receipt, this.balances, true);
        if (plan.preview.negativeStockLineCount && dto.confirmNegativeStock !== true)
          throw new BadRequestException('This reversal will create negative stock. Refresh the preview and explicitly confirm negative stock.');
        for (const { original, balance, layers, snapshot } of plan.movements) {
          await this.balances.applyRelief(manager, balance, snapshot, clock.now);
          const ageLayerRelief = await this.ageLayers.relieve(manager, layers, { quantity: original.quantityIn, preferredSource: original, exact: snapshot.valuationMethod === 'EXACT_ORIGINAL' });
          await this.ledgers.insert(manager, {
            tenantId: user.tenantId, locationId: receipt.locationId, productId: original.productId,
            movementDate: clock.now, businessDate: clock.businessDate, movementType: 'GRN_REVERSAL', sourceDocumentType: 'GRN',
            sourceDocumentId: receipt.goodsReceiptId, sourceDocumentLineId: original.sourceDocumentLineId,
            quantityIn: '0.0000', quantityOut: snapshot.baseQuantity, unitCost: snapshot.valuationMethod === 'EXACT_ORIGINAL' ? original.unitCost : snapshot.averageCostBefore,
            movementValue: snapshot.inventoryReliefValue, quantityBefore: snapshot.quantityBefore, quantityAfter: snapshot.quantityAfter,
            averageCostBefore: snapshot.averageCostBefore, averageCostAfter: snapshot.averageCostAfter,
            valuationMethod: snapshot.valuationMethod, originalDocumentValue: snapshot.originalDocumentValue, inventoryReliefValue: snapshot.inventoryReliefValue,
            costVariance: snapshot.costVariance, reversalOfLedgerId: original.inventoryLedgerId, ageLayerRelief, createdByUserId: user.userId,
          });
        }
        if (plan.po) {
          for (const line of plan.poLines) await manager.getRepository(PurchaseOrderLine).update(line.purchaseOrderLineId, { receivedQty: line.receivedQty, status: line.status });
          plan.po.status = orderReceivedStatus(plan.poLines);
          await manager.getRepository(PurchaseOrder).save(plan.po);
        }
        Object.assign(receipt, { status: 'REVERSED', reversalReason: dto.reason.trim(), reversedByUserId: user.userId, reversedAt: clock.now });
        return manager.getRepository(GoodsReceipt).save(receipt);
      });
    } catch (error) {
      if (error instanceof QueryFailedError && ['ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_WARN_DATA_OUT_OF_RANGE'].includes(error.driverError?.code))
        throw new ConflictException('Reversal conflicted with inventory integrity or another transaction. Refresh the GRN before retrying.');
      throw error;
    }
  }

  private assertId(id: number) { if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Invalid GRN ID.'); }

  private async auditNames(manager: EntityManager, receipt: GoodsReceipt) {
    const ids = [receipt.postedByUserId, receipt.reversedByUserId].filter((id): id is number => id != null);
    const users = ids.length ? await manager.getRepository(User).find({ where: { tenantId: receipt.tenantId, userId: In(ids) }, select: { userId: true, username: true } }) : [];
    return { postedByName: users.find(user => String(user.userId) === String(receipt.postedByUserId))?.username ?? null, reversedByName: users.find(user => String(user.userId) === String(receipt.reversedByUserId))?.username ?? null };
  }

  async findPage(user: TenantPrincipal, page: number, limit: number, search: string, status: string, receiptType: string) {
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const safeLimit = [20, 50, 100].includes(limit) ? limit : 20;
    const query = this.dataSource.getRepository(GoodsReceipt)
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.supplier', 'supplier')
      .leftJoinAndSelect('grn.location', 'location')
      .leftJoinAndSelect('grn.purchaseOrder', 'purchaseOrder')
      .where('grn.tenantId = :tenantId', { tenantId: user.tenantId });

    if (user.accessScope === 'LOCATION') {
      if (!user.assignedLocationIds.length) query.andWhere('1 = 0');
      else query.andWhere('grn.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.map(Number) });
    }
    if (search.trim()) {
      query.andWhere(`(
        LOWER(COALESCE(grn.grnNumber, '')) LIKE :search OR
        LOWER(COALESCE(supplier.supplierCode, '')) LIKE :search OR
        LOWER(COALESCE(supplier.supplierName, '')) LIKE :search OR
        LOWER(COALESCE(grn.supplierInvoiceNumber, '')) LIKE :search OR
        LOWER(COALESCE(purchaseOrder.poNumber, '')) LIKE :search
      )`, { search: `%${search.trim().toLowerCase()}%` });
    }
    if (['DRAFT', 'POSTED', 'CANCELLED', 'REVERSED'].includes(status.toUpperCase()))
      query.andWhere('grn.status = :status', { status: status.toUpperCase() });
    if (['DIRECT', 'PO_BASED'].includes(receiptType.toUpperCase()))
      query.andWhere('grn.receiptType = :receiptType', { receiptType: receiptType.toUpperCase() });
    else query.andWhere('grn.receiptType IN (:...types)', { types: ['DIRECT', 'PO_BASED'] });

    const total = await query.getCount();
    const result = await query
      .addSelect(subQuery => subQuery
        .select('COALESCE(SUM(line.lineTotal), 0)')
        .from(GoodsReceiptLine, 'line')
        .where('line.goodsReceiptId = grn.goodsReceiptId'), 'grn_total')
      .orderBy('grn.goodsReceiptId', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getRawAndEntities();
    return {
      items: result.entities.map((receipt, index) => ({ ...receipt, total: result.raw[index]?.grn_total ?? '0' })),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async get(id: number, user: TenantPrincipal) {
    this.assertId(id);
    const goodsReceipt = await this.find(id, user);
    await this.assertLocationAccess(this.dataSource.manager, user, Number(goodsReceipt.locationId));
    const [lines, documentHeader] = await Promise.all([
      this.dataSource.getRepository(GoodsReceiptLine).find({ where: { goodsReceiptId: id }, relations: { product: true, productUnit: { unit: true } } }),
      loadDocumentHeader(this.dataSource, user.tenantId, Number(goodsReceipt.locationId)),
    ]);
    const reversalMovements = goodsReceipt.status === 'REVERSED' ? await this.dataSource.getRepository(InventoryLedger).findBy({ tenantId: user.tenantId, sourceDocumentType: 'GRN', sourceDocumentId: id, movementType: 'GRN_REVERSAL' }) : [];
    return { ...goodsReceipt, lines, documentHeader, reversalMovements, ...await this.auditNames(this.dataSource.manager, goodsReceipt) };
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
      await this.assertLocationAccess(manager, user, Number(goodsReceipt.locationId));
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
      await this.assertLocationAccess(manager, user, Number(goodsReceipt.locationId));
      if (goodsReceipt.status !== 'DRAFT') throw new BadRequestException('Only draft GRNs can be cancelled.');
      Object.assign(goodsReceipt, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
      return manager.getRepository(GoodsReceipt).save(goodsReceipt);
    });
  }

  async post(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const goodsReceipt = await this.lockGoodsReceipt(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(goodsReceipt.locationId));
      if (goodsReceipt.status !== 'DRAFT') throw new BadRequestException('Only draft GRNs can be posted.');
      if (!goodsReceipt.supplierId || !goodsReceipt.locationId || !goodsReceipt.receiptDate || Number.isNaN(new Date(goodsReceipt.receiptDate).getTime())) throw new BadRequestException('GRN supplier, location and receipt date must be valid before posting.');
      await this.validateReferences(manager, user, Number(goodsReceipt.supplierId), Number(goodsReceipt.locationId));

      let purchaseOrder: PurchaseOrder | null = null;
      if (goodsReceipt.receiptType === 'PO_BASED') {
        purchaseOrder = await this.lockPurchaseOrder(manager, Number(goodsReceipt.purchaseOrderId), user.tenantId);
        this.assertPoHeader(purchaseOrder, Number(goodsReceipt.supplierId), Number(goodsReceipt.locationId), goodsReceipt.currencyCode.toUpperCase());
        await manager.getRepository(PurchaseOrderLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.purchaseOrderId = :id', { id: purchaseOrder.purchaseOrderId }).getMany();
      }

      const lines = await manager.getRepository(GoodsReceiptLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.goodsReceiptId = :id', { id }).getMany();
      lines.sort((a, b) => Number(a.productId) - Number(b.productId) || Number(a.goodsReceiptLineId) - Number(b.goodsReceiptLineId));
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
    purchaseOrder.status = orderReceivedStatus(lines);
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
    if (!price || Number(price.productSupplierUnitId) !== Number(productSupplierUnitId) || Number(price.minimumQuantity) > Number(row.receivedQty) || !price.isActive || Number(price.purchasePrice) <= 0 || price.currencyCode.toUpperCase() !== currencyCode.toUpperCase() || price.effectiveFrom > effectiveDate || Boolean(price.effectiveTo && price.effectiveTo < effectiveDate)) throw new BadRequestException('Selected supplier price is not valid for this goods receipt line on the receipt date.');
    return price;
  }

  private async assertDirectLineStillEligible(manager: EntityManager, receipt: GoodsReceipt, line: GoodsReceiptLine) {
    const { supplierUnit } = await this.resolveDirectPurchasingContext(manager, Number(line.productId), Number(line.productUnitId), Number(line.unitId), receipt.tenantId, Number(receipt.supplierId), Number(receipt.locationId));
    let sourcePrice: ProductSupplierPrice | null = null;
    if (line.sourceSupplierPriceId) {
      sourcePrice = await this.resolveDirectSupplierPrice(manager, { sourceSupplierPriceId: line.sourceSupplierPriceId, receivedQty: Number(line.receivedQty) }, supplierUnit.productSupplierUnitId, receipt.receiptDate, receipt.currencyCode);
    }
    this.costOverrideReason(line.costOverrideReason ?? undefined, !sourcePrice || Number(line.unitCost) !== Number(sourcePrice.purchasePrice), 'supplier price');
  }

  private async lockInventoryContext(manager: EntityManager, receipt: GoodsReceipt, line: GoodsReceiptLine) {
    const context = await manager.getRepository(ProductLocation).createQueryBuilder('productLocation').setLock('pessimistic_write').where('productLocation.productId = :productId AND productLocation.locationId = :locationId', { productId: line.productId, locationId: receipt.locationId }).getOne();
    if (!context) throw new BadRequestException('Product location is not configured for inventory posting.');
  }

  private assertPoHeader(po: PurchaseOrder, supplierId: number, locationId: number, currencyCode: string) {
    if (!['APPROVED', 'PART_RECEIVED'].includes(po.status) || Number(po.supplierId) !== supplierId || Number(po.locationId) !== locationId || po.currencyCode.toUpperCase() !== currencyCode.toUpperCase()) throw new BadRequestException('PO supplier, location, tenant, currency, or status is not eligible for this receipt.');
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
    await this.assertLocationAccess(manager, user, locationId, true);
  }

  private async assertLocationAccess(manager: EntityManager, user: TenantPrincipal, locationId: number, requireActive = false) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, ...(requireActive ? { isActive: true } : {}) });
    if (!location) throw new NotFoundException('Location not found.');
  }

  private async lockGoodsReceipt(manager: EntityManager, id: number, tenantId: number) {
    this.assertId(id);
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
    const grn = await this.dataSource.getRepository(GoodsReceipt).findOne({ where: { goodsReceiptId: id, tenantId: user.tenantId }, relations: { supplier: true, location: true, purchaseOrder: true } });
    if (!grn) throw new NotFoundException('GRN not found.');
    return grn;
  }
}
