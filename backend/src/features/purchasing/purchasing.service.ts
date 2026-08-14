import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import {
  GoodsReceipt,
  GoodsReceiptLine,
  InventoryAgeLayer,
  InventoryBalance,
  InventoryLedger,
  PurchaseOrder,
  PurchaseOrderLine,
} from "./purchasing.entities";
import { Supplier } from "../suppliers/suppliers.entity";
import { Location } from "../locations/locations.entity";
import { Product } from "../products/products.entity";
import { ProductUnit } from "../product-units/product-units.entity";
import { Tenant } from "../tenants/tenant.entity";
import { TenantPrincipal } from "../auth/auth.types";

@Injectable()
export class PurchasingService {
  constructor(private readonly dataSource: DataSource) {}

  async listPos(user: TenantPrincipal) {
    return this.dataSource
      .getRepository(PurchaseOrder)
      .findBy({ tenantId: user.tenantId });
  }
  async listGrns(user: TenantPrincipal) {
    return this.dataSource
      .getRepository(GoodsReceipt)
      .findBy({ tenantId: user.tenantId });
  }

  async getPo(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.po(id, user);
    const lines = await this.dataSource
      .getRepository(PurchaseOrderLine)
      .findBy({ purchaseOrderId: id });
    return { ...purchaseOrder, lines };
  }

  async getGrn(id: number, user: TenantPrincipal) {
    const goodsReceipt = await this.grn(id, user);
    const lines = await this.dataSource
      .getRepository(GoodsReceiptLine)
      .findBy({ goodsReceiptId: id });
    return { ...goodsReceipt, lines };
  }

  async createPo(dto: any, user: TenantPrincipal) {
    await this.validateReferences(
      user,
      Number(dto.supplierId),
      Number(dto.locationId),
    );
    return this.dataSource.transaction(async (manager) => {
      const purchaseOrder: any = await manager
        .getRepository(PurchaseOrder)
        .save(
          manager.getRepository(PurchaseOrder).create({
            ...dto,
            tenantId: user.tenantId,
            supplierId: Number(dto.supplierId),
            locationId: Number(dto.locationId),
            createdByUserId: user.userId,
            status: "DRAFT",
            currencyCode: dto.currencyCode || "LKR",
            isActive: true,
          }),
        );
      await this.saveLines(
        manager,
        PurchaseOrderLine,
        purchaseOrder.purchaseOrderId,
        dto.lines,
        "purchaseOrderId",
        user.tenantId,
      );
      return purchaseOrder;
    });
  }

  async updatePo(id: number, dto: any, user: TenantPrincipal) {
    const purchaseOrder = await this.po(id, user);
    if (purchaseOrder.status !== "DRAFT")
      throw new BadRequestException(
        "Only draft purchase orders can be edited.",
      );
    await this.validateReferences(
      user,
      Number(dto.supplierId),
      Number(dto.locationId),
    );
    return this.dataSource.transaction(async (manager) => {
      Object.assign(purchaseOrder, {
        ...dto,
        tenantId: user.tenantId,
        supplierId: Number(dto.supplierId),
        locationId: Number(dto.locationId),
        currencyCode: dto.currencyCode || "LKR",
      });
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);
      await manager
        .getRepository(PurchaseOrderLine)
        .delete({ purchaseOrderId: id });
      await this.saveLines(
        manager,
        PurchaseOrderLine,
        id,
        dto.lines,
        "purchaseOrderId",
        user.tenantId,
      );
      return purchaseOrder;
    });
  }

  async approvePo(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.po(id, user);
    if (purchaseOrder.status !== "DRAFT")
      throw new BadRequestException(
        "Only draft purchase orders can be approved.",
      );
    purchaseOrder.status = "APPROVED";
    purchaseOrder.approvedByUserId = user.userId;
    purchaseOrder.approvedAt = new Date();
    return this.dataSource.getRepository(PurchaseOrder).save(purchaseOrder);
  }

  async cancelPo(id: number, user: TenantPrincipal) {
    const purchaseOrder = await this.po(id, user);
    if (!["DRAFT", "APPROVED", "SENT"].includes(purchaseOrder.status))
      throw new BadRequestException(
        "Received purchase orders cannot be cancelled.",
      );
    purchaseOrder.status = "CANCELLED";
    purchaseOrder.cancelledByUserId = user.userId;
    purchaseOrder.cancelledAt = new Date();
    return this.dataSource.getRepository(PurchaseOrder).save(purchaseOrder);
  }

  async createGrn(dto: any, user: TenantPrincipal) {
    const receiptType = dto.receiptType;
    if (!["PO_BASED", "DIRECT"].includes(receiptType))
      throw new BadRequestException("Receipt type must be PO_BASED or DIRECT.");
    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOneBy({ tenantId: user.tenantId });
    if (!tenant) throw new NotFoundException("Tenant not found.");
    if (
      receiptType === "DIRECT" &&
      (!tenant.allowDirectGrn || tenant.poRequiredForGrn)
    )
      throw new ForbiddenException("Direct GRN is disabled for this tenant.");
    await this.validateReferences(
      user,
      Number(dto.supplierId),
      Number(dto.locationId),
    );
    if (receiptType === "PO_BASED") {
      const purchaseOrder = await this.po(Number(dto.purchaseOrderId), user);
      if (
        !["APPROVED", "SENT", "PART_RECEIVED"].includes(purchaseOrder.status) ||
        Number(purchaseOrder.supplierId) !== Number(dto.supplierId) ||
        Number(purchaseOrder.locationId) !== Number(dto.locationId)
      ) {
        throw new BadRequestException("PO is not eligible for this receipt.");
      }
    } else if (dto.purchaseOrderId)
      throw new BadRequestException(
        "Direct GRNs cannot reference a purchase order.",
      );
    return this.dataSource.transaction(async (manager) => {
      const goodsReceipt: any = await manager.getRepository(GoodsReceipt).save(
        manager.getRepository(GoodsReceipt).create({
          ...dto,
          tenantId: user.tenantId,
          receiptType,
          supplierId: Number(dto.supplierId),
          locationId: Number(dto.locationId),
          supplierInvoiceDate: dto.supplierInvoiceDate || null,
          purchaseOrderId:
            receiptType === "PO_BASED" ? Number(dto.purchaseOrderId) : null,
          createdByUserId: user.userId,
          status: "DRAFT",
          currencyCode: dto.currencyCode || "LKR",
          isActive: true,
        }),
      );
      await this.saveLines(
        manager,
        GoodsReceiptLine,
        goodsReceipt.goodsReceiptId,
        dto.lines,
        "goodsReceiptId",
        user.tenantId,
      );
      return goodsReceipt;
    });
  }

  async updateGrn(id: number, dto: any, user: TenantPrincipal) {
    const goodsReceipt = await this.grn(id, user);
    if (goodsReceipt.status !== "DRAFT")
      throw new BadRequestException("Only draft GRNs can be edited.");
    if (dto.receiptType && dto.receiptType !== goodsReceipt.receiptType)
      throw new BadRequestException(
        "Receipt type cannot be changed after creation.",
      );
    await this.validateReferences(
      user,
      Number(dto.supplierId),
      Number(dto.locationId),
    );
    return this.dataSource.transaction(async (manager) => {
      Object.assign(goodsReceipt, {
        ...dto,
        tenantId: user.tenantId,
        receiptType: goodsReceipt.receiptType,
        supplierId: Number(dto.supplierId),
        locationId: Number(dto.locationId),
        supplierInvoiceDate: dto.supplierInvoiceDate || null,
      });
      await manager.getRepository(GoodsReceipt).save(goodsReceipt);
      await manager
        .getRepository(GoodsReceiptLine)
        .delete({ goodsReceiptId: id });
      await this.saveLines(
        manager,
        GoodsReceiptLine,
        id,
        dto.lines,
        "goodsReceiptId",
        user.tenantId,
      );
      return goodsReceipt;
    });
  }

  async cancelGrn(id: number, user: TenantPrincipal) {
    const goodsReceipt = await this.grn(id, user);
    if (goodsReceipt.status === "POSTED")
      throw new BadRequestException(
        "Posted GRN cannot be cancelled directly. Use inventory reversal/return workflow.",
      );
    if (goodsReceipt.status === "CANCELLED")
      throw new BadRequestException("GRN is already cancelled.");
    goodsReceipt.status = "CANCELLED";
    goodsReceipt.cancelledByUserId = user.userId;
    goodsReceipt.cancelledAt = new Date();
    return this.dataSource.getRepository(GoodsReceipt).save(goodsReceipt);
  }

  async postGrn(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const goodsReceipt = await manager
        .getRepository(GoodsReceipt)
        .findOneBy({ goodsReceiptId: id, tenantId: user.tenantId });
      if (!goodsReceipt) throw new NotFoundException("GRN not found.");
      await this.assertLocationAccess(user, Number(goodsReceipt.locationId));
      if (goodsReceipt.status !== "DRAFT")
        throw new BadRequestException("Only draft GRNs can be posted.");
      const lines = await manager
        .getRepository(GoodsReceiptLine)
        .findBy({ goodsReceiptId: id });
      if (!lines.length)
        throw new BadRequestException("GRN requires at least one line.");
      for (const line of lines) {
        await this.assertProductAndUnit(
          manager,
          Number(line.productId),
          Number(line.unitId),
          user.tenantId,
        );
        const quantity = Number(line.receivedQty);
        const cost = Number(line.netUnitCost);
        if (quantity <= 0 || cost < 0)
          throw new BadRequestException("Invalid receipt quantity or cost.");
        if (goodsReceipt.receiptType === "PO_BASED")
          await this.receivePoLine(manager, goodsReceipt, line, quantity, user);
        await this.addInventory(
          manager,
          goodsReceipt,
          line,
          quantity,
          cost,
          user,
        );
      }
      if (goodsReceipt.purchaseOrderId)
        await this.refreshPoStatus(
          manager,
          Number(goodsReceipt.purchaseOrderId),
        );
      goodsReceipt.status = "POSTED";
      goodsReceipt.postedByUserId = user.userId;
      goodsReceipt.postedAt = new Date();
      return manager.getRepository(GoodsReceipt).save(goodsReceipt);
    });
  }

  private async receivePoLine(
    manager: EntityManager,
    goodsReceipt: GoodsReceipt,
    line: GoodsReceiptLine,
    quantity: number,
    user: TenantPrincipal,
  ) {
    if (!line.purchaseOrderLineId)
      throw new BadRequestException("PO receipt line is required.");
    const poLine = await manager
      .getRepository(PurchaseOrderLine)
      .findOneBy({
        purchaseOrderLineId: Number(line.purchaseOrderLineId),
        purchaseOrderId: Number(goodsReceipt.purchaseOrderId),
      });
    if (
      !poLine ||
      Number(poLine.productId) !== Number(line.productId) ||
      Number(poLine.unitId) !== Number(line.unitId)
    )
      throw new BadRequestException(
        "Receipt line does not match the purchase order.",
      );
    if (Number(poLine.receivedQty) + quantity > Number(poLine.orderedQty))
      throw new BadRequestException("Receipt exceeds remaining PO quantity.");
    poLine.receivedQty = String(Number(poLine.receivedQty) + quantity);
    poLine.status =
      Number(poLine.receivedQty) >= Number(poLine.orderedQty)
        ? "RECEIVED"
        : "PART_RECEIVED";
    await manager.getRepository(PurchaseOrderLine).save(poLine);
  }

  private async refreshPoStatus(
    manager: EntityManager,
    purchaseOrderId: number,
  ) {
    const purchaseOrder = await manager
      .getRepository(PurchaseOrder)
      .findOneByOrFail({ purchaseOrderId });
    const lines = await manager
      .getRepository(PurchaseOrderLine)
      .findBy({ purchaseOrderId });
    purchaseOrder.status = lines.every(
      (line) => Number(line.receivedQty) >= Number(line.orderedQty),
    )
      ? "RECEIVED"
      : "PART_RECEIVED";
    await manager.getRepository(PurchaseOrder).save(purchaseOrder);
  }

  private async addInventory(
    manager: EntityManager,
    goodsReceipt: GoodsReceipt,
    line: GoodsReceiptLine,
    quantity: number,
    cost: number,
    user: TenantPrincipal,
  ) {
    const balances = manager.getRepository(InventoryBalance);
    let balance = await balances.findOneBy({
      tenantId: user.tenantId,
      locationId: goodsReceipt.locationId,
      productId: line.productId,
    });
    const quantityBefore = Number(balance?.quantityOnHand ?? 0);
    const averageCostBefore = Number(balance?.averageCost ?? 0);
    const quantityAfter = quantityBefore + quantity;
    const averageCostAfter =
      quantityBefore <= 0
        ? cost
        : (quantityBefore * averageCostBefore + quantity * cost) /
          quantityAfter;
    if (!balance)
      balance = balances.create({
        tenantId: user.tenantId,
        locationId: goodsReceipt.locationId,
        productId: line.productId,
        quantityOnHand: String(quantityAfter),
        averageCost: String(averageCostAfter),
        lastMovementAt: new Date(),
      });
    else
      Object.assign(balance, {
        quantityOnHand: String(quantityAfter),
        averageCost: String(averageCostAfter),
        lastMovementAt: new Date(),
      });
    await balances.save(balance);
    await manager
      .getRepository(InventoryLedger)
      .save(
        manager
          .getRepository(InventoryLedger)
          .create({
            tenantId: user.tenantId,
            locationId: goodsReceipt.locationId,
            productId: line.productId,
            movementDate: new Date(),
            movementType: "GRN",
            sourceDocumentType: "GRN",
            sourceDocumentId: goodsReceipt.goodsReceiptId,
            sourceDocumentLineId: line.goodsReceiptLineId,
            quantityIn: String(quantity),
            quantityOut: "0",
            unitCost: String(cost),
            movementValue: String(quantity * cost),
            quantityBefore: String(quantityBefore),
            quantityAfter: String(quantityAfter),
            averageCostBefore: String(averageCostBefore),
            averageCostAfter: String(averageCostAfter),
            createdByUserId: user.userId,
          }),
      );
    await manager
      .getRepository(InventoryAgeLayer)
      .save(
        manager
          .getRepository(InventoryAgeLayer)
          .create({
            tenantId: user.tenantId,
            locationId: goodsReceipt.locationId,
            productId: line.productId,
            sourceDocumentType: "GRN",
            sourceDocumentId: goodsReceipt.goodsReceiptId,
            sourceDocumentLineId: line.goodsReceiptLineId,
            receiptDate: goodsReceipt.receiptDate,
            originalQuantity: String(quantity),
            remainingQuantity: String(quantity),
            originalUnitCost: String(cost),
            batchNumber: line.batchNumber,
            manufactureDate: line.manufactureDate,
            expiryDate: line.expiryDate,
            isActive: true,
          }),
      );
  }

  private async validateReferences(
    user: TenantPrincipal,
    supplierId: number,
    locationId: number,
  ) {
    if (
      !(await this.dataSource
        .getRepository(Supplier)
        .findOneBy({ supplierId, tenantId: user.tenantId, isActive: true }))
    )
      throw new NotFoundException("Supplier not found.");
    await this.assertLocationAccess(user, locationId);
  }
  private async assertLocationAccess(
    user: TenantPrincipal,
    locationId: number,
  ) {
    const location = await this.dataSource
      .getRepository(Location)
      .findOneBy({ locationId, tenantId: user.tenantId, isActive: true });
    if (!location) throw new NotFoundException("Location not found.");
    if (
      user.accessScope === "LOCATION" &&
      !user.assignedLocationIds.map(Number).includes(locationId)
    )
      throw new ForbiddenException("User is not assigned to this location.");
  }
  private async assertProductAndUnit(
    manager: EntityManager,
    productId: number,
    unitId: number,
    tenantId: number,
  ) {
    const product = await manager
      .getRepository(Product)
      .findOneBy({ productId, tenantId, isActive: true });
    if (!product) throw new NotFoundException("Product not found.");
    if (Number(product.baseUnitId) === unitId) return;
    const productUnit = await manager
      .getRepository(ProductUnit)
      .findOneBy({ productId, unitId, isActive: true });
    if (!productUnit)
      throw new BadRequestException("Unit is not valid for this product.");
  }
  private async saveLines(
    manager: EntityManager,
    entity: typeof PurchaseOrderLine | typeof GoodsReceiptLine,
    parentId: number,
    rows: any[],
    parentField: "purchaseOrderId" | "goodsReceiptId",
    tenantId: number,
  ) {
    if (!Array.isArray(rows) || rows.length === 0)
      throw new BadRequestException("At least one line is required.");
    for (const row of rows) {
      await this.assertProductAndUnit(
        manager,
        Number(row.productId),
        Number(row.unitId),
        tenantId,
      );
      const quantity = Number(row.orderedQty ?? row.receivedQty);
      const unitCost = Number(row.unitCost);
      const discountAmount = Number(row.discountAmount || 0);
      const taxAmount = Number(row.taxAmount || 0);
      if (quantity <= 0 || unitCost < 0 || discountAmount < 0 || taxAmount < 0)
        throw new BadRequestException("Invalid quantity or cost.");
      const netUnitCost = unitCost - discountAmount + taxAmount;
      await manager
        .getRepository(entity)
        .save(
          manager
            .getRepository(entity)
            .create({
              ...row,
              [parentField]: parentId,
              productId: Number(row.productId),
              unitId: Number(row.unitId),
              orderedQty:
                parentField === "purchaseOrderId"
                  ? String(quantity)
                  : undefined,
              receivedQty:
                parentField === "goodsReceiptId" ? String(quantity) : undefined,
              unitCost: String(unitCost),
              discountAmount: String(discountAmount),
              taxAmount: String(taxAmount),
              netUnitCost: String(netUnitCost),
              lineTotal: String(quantity * netUnitCost),
              manufactureDate:
                parentField === "goodsReceiptId"
                  ? row.manufactureDate || null
                  : undefined,
              expiryDate:
                parentField === "goodsReceiptId"
                  ? row.expiryDate || null
                  : undefined,
            }),
        );
    }
  }
  private async po(id: number, user: TenantPrincipal) {
    const po = await this.dataSource
      .getRepository(PurchaseOrder)
      .findOneBy({ purchaseOrderId: id, tenantId: user.tenantId });
    if (!po) throw new NotFoundException("Purchase order not found.");
    return po;
  }
  private async grn(id: number, user: TenantPrincipal) {
    const grn = await this.dataSource
      .getRepository(GoodsReceipt)
      .findOneBy({ goodsReceiptId: id, tenantId: user.tenantId });
    if (!grn) throw new NotFoundException("GRN not found.");
    return grn;
  }
}
