import { ConflictException } from "@nestjs/common";
import { EntityManager, SelectQueryBuilder, ObjectLiteral } from "typeorm";
import { checked, sum4, units } from "../../common/inventory-decimal";
import { InventoryBalance } from "../inventory-balance/inventory-balance.entity";
import { InventoryBalanceService } from "../inventory-balance/inventory-balance.service";
import { InventoryLedger } from "../inventory-ledger/inventory-ledger.entity";
import { InventoryAgeLayer } from "../inventory-age-layers/inventory-age-layer.entity";
import { ProductLocation } from "../product-locations/product-locations.entity";
import { PurchaseOrder } from "../purchase-orders/purchase-order.entity";
import { PurchaseOrderLine } from "../purchase-orders/purchase-order-line.entity";
import { GoodsReceipt } from "./goods-receipt.entity";
import { GoodsReceiptLine } from "./goods-receipt-line.entity";

export function receivedStatus(received: string, ordered: string) {
  const qty = units(received),
    total = units(ordered);
  if (qty < 0n || qty > total)
    throw new ConflictException(
      "Purchase Order received quantity is outside its ordered quantity.",
    );
  return qty === 0n ? "OPEN" : qty === total ? "RECEIVED" : "PART_RECEIVED";
}
export function orderReceivedStatus(
  lines: Pick<PurchaseOrderLine, "receivedQty" | "orderedQty">[],
) {
  return lines.length &&
    lines.every((line) => units(line.receivedQty) === units(line.orderedQty))
    ? "RECEIVED"
    : lines.some((line) => units(line.receivedQty) > 0n)
      ? "PART_RECEIVED"
      : "APPROVED";
}

export async function prepareReversal(
  manager: EntityManager,
  receipt: GoodsReceipt,
  balances: InventoryBalanceService,
  lock: boolean,
) {
  const locked = <T extends ObjectLiteral>(query: SelectQueryBuilder<T>) =>
    lock ? query.setLock("pessimistic_write") : query;
  if (
    receipt.status !== "POSTED" ||
    receipt.reversedAt != null ||
    receipt.reversedByUserId != null ||
    receipt.reversalReason != null
  )
    throw new ConflictException(
      "Only a Posted GRN that has not already been reversed can be reversed.",
    );
  if (!["DIRECT", "PO_BASED"].includes(receipt.receiptType))
    throw new ConflictException("Unsupported receipt type.");
  let po: PurchaseOrder | null = null;
  let poLines: PurchaseOrderLine[] = [];
  if (receipt.receiptType === "PO_BASED") {
    po = await locked(
      manager
        .getRepository(PurchaseOrder)
        .createQueryBuilder("po")
        .where("po.purchaseOrderId = :id AND po.tenantId = :tenantId", {
          id: receipt.purchaseOrderId,
          tenantId: receipt.tenantId,
        }),
    ).getOne();
    if (
      !po ||
      String(po.locationId) !== String(receipt.locationId) ||
      String(po.supplierId) !== String(receipt.supplierId) ||
      po.currencyCode !== receipt.currencyCode ||
      !["APPROVED", "PART_RECEIVED", "RECEIVED"].includes(po.status)
    )
      throw new ConflictException(
        "Linked Purchase Order is missing or inconsistent.",
      );
    poLines = await locked(
      manager
        .getRepository(PurchaseOrderLine)
        .createQueryBuilder("line")
        .where("line.purchaseOrderId = :id", { id: po.purchaseOrderId })
        .orderBy("line.purchaseOrderLineId", "ASC"),
    ).getMany();
  }
  const lines = await locked(
    manager
      .getRepository(GoodsReceiptLine)
      .createQueryBuilder("line")
      .where("line.goodsReceiptId = :id", { id: receipt.goodsReceiptId })
      .orderBy("line.goodsReceiptLineId", "ASC"),
  ).getMany();
  if (!lines.length)
    throw new ConflictException("Original GRN lines are missing.");
  const originals = await locked(
    manager
      .getRepository(InventoryLedger)
      .createQueryBuilder("ledger")
      .where(
        "ledger.tenantId = :tenantId AND ledger.sourceDocumentType = :type AND ledger.sourceDocumentId = :id AND ledger.movementType = :type",
        { tenantId: receipt.tenantId, type: "GRN", id: receipt.goodsReceiptId },
      )
      .orderBy("ledger.inventoryLedgerId", "ASC"),
  ).getMany();
  if (originals.length !== lines.length)
    throw new ConflictException(
      "Original GRN posting ledger is missing or duplicated.",
    );
  for (const line of lines) {
    const original = originals.find(
      (row) =>
        String(row.sourceDocumentLineId) === String(line.goodsReceiptLineId),
    );
    if (
      !original ||
      String(original.productId) !== String(line.productId) ||
      String(original.locationId) !== String(receipt.locationId) ||
      units(original.quantityOut) !== 0n ||
      units(original.quantityAfter) - units(original.quantityBefore) !==
        units(original.quantityIn) ||
      units(original.movementValue) !== units(line.lineTotal)
    )
      throw new ConflictException(
        "Original GRN posting ledger does not match its receipt line.",
      );
    // Use the immutable six-decimal conversion snapshot, rounded to inventory scale.
    if (
      !line.conversionFactorSnapshot ||
      !/^\d+(\.\d{1,6})?$/.test(line.conversionFactorSnapshot)
    )
      throw new ConflictException(
        "Original conversion snapshot is missing or invalid.",
      );
    const factor =
      BigInt(line.conversionFactorSnapshot.split(".")[0]) * 1_000_000n +
      BigInt(
        (line.conversionFactorSnapshot.split(".")[1] ?? "").padEnd(6, "0"),
      );
    if (
      factor <= 0n ||
      (units(line.receivedQty) * factor + 500_000n) / 1_000_000n !==
        units(original.quantityIn)
    )
      throw new ConflictException(
        "Original ledger quantity does not match the receipt snapshot.",
      );
  }
  const poImpact = poLines.map((line) => ({
    ...line,
    receivedQtyBefore: line.receivedQty,
  }));
  if (po)
    for (const line of lines) {
      const target = poImpact.find(
        (row) =>
          String(row.purchaseOrderLineId) === String(line.purchaseOrderLineId),
      );
      if (
        !target ||
        ["productId", "productUnitId", "unitId"].some(
          (key) =>
            String(target[key as keyof PurchaseOrderLine]) !==
            String(line[key as keyof GoodsReceiptLine]),
        )
      )
        throw new ConflictException(
          "GRN line does not match its original PO line.",
        );
      target.receivedQty = checked(
        units(target.receivedQty) - units(line.receivedQty),
      );
      target.status = receivedStatus(target.receivedQty, target.orderedQty);
    }
  // Lock every product context and balance before any layer or valuation work.
  const contexts: Array<{
    balance: InventoryBalance;
    originals: InventoryLedger[];
    layers: InventoryAgeLayer[];
  }> = [];
  const productIds = [
    ...new Set(lines.map((line) => String(line.productId))),
  ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  for (const productId of productIds) {
    const params = {
      tenantId: receipt.tenantId,
      locationId: receipt.locationId,
      productId,
    };
    const context = await locked(
      manager
        .getRepository(ProductLocation)
        .createQueryBuilder("context")
        .where(
          "context.productId = :productId AND context.locationId = :locationId",
          params,
        ),
    ).getOne();
    const balance = await locked(
      manager
        .getRepository(InventoryBalance)
        .createQueryBuilder("balance")
        .where(
          "balance.tenantId = :tenantId AND balance.locationId = :locationId AND balance.productId = :productId",
          params,
        ),
    ).getOne();
    if (!context || !balance)
      throw new ConflictException(
        "Original product/location inventory balance is missing.",
      );
    contexts.push({
      balance,
      originals: originals.filter((row) => String(row.productId) === productId),
      layers: [],
    });
  }
  const movements: Array<{
    original: InventoryLedger;
    line: GoodsReceiptLine;
    balance: InventoryBalance;
    layers: InventoryAgeLayer[];
    snapshot: ReturnType<InventoryBalanceService["reversalSnapshot"]>;
  }> = [];
  for (const context of contexts) {
    const params = {
      tenantId: receipt.tenantId,
      locationId: receipt.locationId,
      productId: context.balance.productId,
    };
    context.layers = await locked(
      manager
        .getRepository(InventoryAgeLayer)
        .createQueryBuilder("layer")
        .where(
          "layer.tenantId = :tenantId AND layer.locationId = :locationId AND layer.productId = :productId",
          params,
        )
        .orderBy("layer.inventoryAgeLayerId", "ASC"),
    ).getMany();
    const latest = await locked(
      manager
        .getRepository(InventoryLedger)
        .createQueryBuilder("ledger")
        .where(
          "ledger.tenantId = :tenantId AND ledger.locationId = :locationId AND ledger.productId = :productId",
          params,
        )
        .orderBy("ledger.inventoryLedgerId", "DESC")
        .take(1),
    ).getOne();
    const last = context.originals[context.originals.length - 1];
    let exact =
      String(latest?.inventoryLedgerId) === String(last.inventoryLedgerId) &&
      units(context.balance.quantityOnHand) === units(last.quantityAfter) &&
      units(context.balance.averageCost) === units(last.averageCostAfter);
    // Multiple receipt lines for one product must form one uninterrupted tail.
    if (exact) {
      const tail = await locked(
        manager
          .getRepository(InventoryLedger)
          .createQueryBuilder("ledger")
          .where(
            "ledger.tenantId = :tenantId AND ledger.locationId = :locationId AND ledger.productId = :productId AND ledger.inventoryLedgerId >= :first",
            { ...params, first: context.originals[0].inventoryLedgerId },
          )
          .orderBy("ledger.inventoryLedgerId", "ASC"),
      ).getMany();
      exact =
        tail.length === context.originals.length &&
        tail.every(
          (row, i) =>
            String(row.inventoryLedgerId) ===
            String(context.originals[i].inventoryLedgerId),
        );
      exact =
        exact &&
        context.originals.every(
          (row, i, all) =>
            i === 0 ||
            (units(row.quantityBefore) === units(all[i - 1].quantityAfter) &&
              units(row.averageCostBefore) ===
                units(all[i - 1].averageCostAfter)),
        );
    }
    const projected = { ...context.balance };
    for (const [index, original] of [...context.originals]
      .reverse()
      .entries()) {
      const snapshot = balances.reversalSnapshot(
        projected,
        original,
        exact,
        index < context.originals.length - 1,
      );
      movements.push({
        original,
        line: lines.find(
          (line) =>
            String(line.goodsReceiptLineId) ===
            String(original.sourceDocumentLineId),
        )!,
        balance: context.balance,
        layers: context.layers,
        snapshot,
      });
      projected.quantityOnHand = snapshot.quantityAfter;
      projected.averageCost = snapshot.averageCostAfter;
    }
  }
  return {
    movements,
    po,
    poLines: poImpact,
    preview: {
      eligible: true,
      blockingReason: null as string | null,
      lines: movements.map(({ line, original, snapshot, balance }) => {
        const final = movements
          .filter(
            (row) =>
              String(row.original.productId) === String(original.productId),
          )
          .at(-1)!.snapshot;
        return {
          ...line,
          ...snapshot,
          currentQuantity: balance.quantityOnHand,
          currentWavg: balance.averageCost,
          projectedQuantity: final.quantityAfter,
          createsNegativeStock: units(final.quantityAfter) < 0n,
          originalLedgerId: original.inventoryLedgerId,
        };
      }),
      totalReceivedUnits: sum4(lines.map((line) => line.receivedQty)),
      originalDocumentValue: sum4(
        movements.map((row) => row.snapshot.originalDocumentValue),
      ),
      inventoryReliefValue: sum4(
        movements.map((row) => row.snapshot.inventoryReliefValue),
      ),
      costVariance: sum4(movements.map((row) => row.snapshot.costVariance)),
      negativeStockLineCount: movements.filter(
        (row) =>
          units(
            movements
              .filter(
                (other) =>
                  String(other.original.productId) ===
                  String(row.original.productId),
              )
              .at(-1)!.snapshot.quantityAfter,
          ) < 0n,
      ).length,
      hasLaterMovements: movements.some(
        (row) => row.snapshot.valuationMethod === "CURRENT_WAVG_COMPENSATION",
      ),
      purchaseOrderImpact: po
        ? {
            purchaseOrderId: po.purchaseOrderId,
            statusBefore: po.status,
            statusAfter: orderReceivedStatus(poImpact),
            lines: poImpact.map((line) => ({
              purchaseOrderLineId: line.purchaseOrderLineId,
              receivedQtyBefore: line.receivedQtyBefore,
              receivedQtyAfter: line.receivedQty,
              statusAfter: line.status,
            })),
          }
        : null,
    },
  };
}
