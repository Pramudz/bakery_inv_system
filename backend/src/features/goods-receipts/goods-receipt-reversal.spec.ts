import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { getMetadataArgsStorage } from "typeorm";
import { checked, multiply, units } from "../../common/inventory-decimal";
import { InventoryBalanceService } from "../inventory-balance/inventory-balance.service";
import { InventoryLedger } from "../inventory-ledger/inventory-ledger.entity";
import { InventoryAgeLayerService } from "../inventory-age-layers/inventory-age-layer.service";
import { GoodsReceiptsController } from "./goods-receipts.controller";
import { ReverseGoodsReceiptDto } from "./dto/reverse-goods-receipt.dto";
import { receivedStatus, orderReceivedStatus } from "./goods-receipt-reversal";
import { PermissionGuard } from "../auth/permission.guard";
import { Permission } from "../permissions/permissions.entity";
import { TenantModule } from "../tenant-modules/tenant-modules.entity";
import { REQUIRE_PERMISSION } from "../auth/require-permission.decorator";

const balances = new InventoryBalanceService();
const original = {
  quantityIn: "10.0000",
  movementValue: "1500.0000",
  quantityBefore: "20.0000",
  quantityAfter: "30.0000",
  averageCostBefore: "100.0000",
  averageCostAfter: "116.6667",
} as InventoryLedger;

test("exact immediate reversal restores original quantity and WAVG and records zero variance", () => {
  const row = balances.reversalSnapshot(
    { quantityOnHand: "30", averageCost: "116.6667" },
    original,
    true,
  );
  assert.equal(row.quantityAfter, "20.0000");
  assert.equal(row.averageCostAfter, "100.0000");
  assert.equal(row.inventoryReliefValue, "1500.0000");
  assert.equal(row.originalDocumentValue, "1500.0000");
  assert.equal(row.costVariance, "0.0000");
  assert.equal(row.valuationMethod, "EXACT_ORIGINAL");
});
test("late compensation preserves current WAVG and captures all value differences", () => {
  const row = balances.reversalSnapshot(
    { quantityOnHand: "25", averageCost: "116.6700" },
    original,
    false,
  );
  assert.equal(row.quantityAfter, "15.0000");
  assert.equal(row.averageCostAfter, "116.6700");
  assert.equal(row.inventoryReliefValue, "1166.7000");
  assert.equal(row.costVariance, "333.3000");
  assert.equal(row.valuationMethod, "CURRENT_WAVG_COMPENSATION");
});
test("zero stock has zero WAVG with receipt difference preserved as variance", () => {
  const row = balances.reversalSnapshot(
    { quantityOnHand: "10", averageCost: "116.6667" },
    original,
    false,
  );
  assert.equal(row.quantityAfter, "0.0000");
  assert.equal(row.averageCostAfter, "0.0000");
  assert.equal(row.inventoryValueAfter, "0.0000");
  assert.equal(row.costVariance, "333.3330");
});
test("negative stock preserves current WAVG and has an explicit preview flag", () => {
  const row = balances.reversalSnapshot(
    { quantityOnHand: "2", averageCost: "116.6667" },
    original,
    false,
  );
  assert.equal(row.quantityAfter, "-8.0000");
  assert.equal(row.averageCostAfter, "116.6667");
  assert.equal(row.createsNegativeStock, true);
});
test("multiple lines crossing zero retain WAVG until the final stock relief", () => {
  const first = balances.reversalSnapshot(
    { quantityOnHand: "10", averageCost: "100" },
    original,
    false,
    true,
  );
  const second = balances.reversalSnapshot(
    {
      quantityOnHand: first.quantityAfter,
      averageCost: first.averageCostAfter,
    },
    original,
    false,
  );
  assert.equal(second.inventoryReliefValue, "1000.0000");
  assert.equal(second.averageCostAfter, "100.0000");
});
test("decimal arithmetic rounds halves away from zero without IEEE floating point", () => {
  assert.equal(checked(multiply(units("0.3333"), units("0.1000"))), "0.0333");
  assert.equal(checked(multiply(units("-0.0001"), units("0.5000"))), "-0.0001");
  assert.equal(checked(units("99999999999999.9999")), "99999999999999.9999");
  for (const value of ["NaN", "Infinity", "100000000000000.0000"])
    assert.throws(() => units(value), ConflictException);
  assert.throws(
    () =>
      balances.reversalSnapshot(
        { quantityOnHand: "30", averageCost: "120" },
        original,
        true,
      ),
    ConflictException,
  );
});
test("PO received status returns OPEN / PART_RECEIVED / RECEIVED and prevents underflow", () => {
  assert.equal(receivedStatus("0", "10"), "OPEN");
  assert.equal(receivedStatus("4", "10"), "PART_RECEIVED");
  assert.equal(receivedStatus("10", "10"), "RECEIVED");
  assert.throws(() => receivedStatus("-1", "10"), ConflictException);
  assert.equal(
    orderReceivedStatus([{ receivedQty: "0", orderedQty: "10" }]),
    "APPROVED",
  );
  assert.equal(
    orderReceivedStatus([
      { receivedQty: "0", orderedQty: "10" },
      { receivedQty: "2", orderedQty: "5" },
    ]),
    "PART_RECEIVED",
  );
  assert.equal(
    orderReceivedStatus([{ receivedQty: "10", orderedQty: "10" }]),
    "RECEIVED",
  );
});
test("late layer relief uses original remaining stock then FIFO and persists unallocated shortage", async () => {
  const layers: any[] = [
    {
      inventoryAgeLayerId: 1,
      sourceDocumentType: "GRN",
      sourceDocumentId: 1,
      sourceDocumentLineId: 1,
      receiptDate: "2026-01-01",
      remainingQuantity: "3",
      isActive: true,
    },
    {
      inventoryAgeLayerId: 2,
      sourceDocumentType: "GRN",
      sourceDocumentId: 2,
      sourceDocumentLineId: 2,
      receiptDate: "2026-02-01",
      remainingQuantity: "2",
      isActive: true,
    },
    {
      inventoryAgeLayerId: 3,
      sourceDocumentType: "GRN",
      sourceDocumentId: 3,
      sourceDocumentLineId: 3,
      receiptDate: "2026-03-01",
      remainingQuantity: "1",
      isActive: true,
    },
  ];
  const saved: number[] = [];
  const manager: any = {
    getRepository: () => ({
      save: async (row: any) => {
        saved.push(row.inventoryAgeLayerId);
      },
    }),
  };
  const result = await new InventoryAgeLayerService().relieve(manager, layers, {
    quantity: original.quantityIn,
    preferredSource: {
      sourceDocumentType: "GRN",
      sourceDocumentId: 2,
      sourceDocumentLineId: 2,
    },
    exact: false,
  });
  assert.deepEqual(saved, [2, 1, 3]);
  assert.equal(result.unallocatedQuantity, "4.0000");
  assert.equal(result.allocations[0].before, "2.0000");
  assert.equal(result.allocations[0].after, "0.0000");
});
test("exact layer relief does not erase unrelated layers or assume the original layer is untouched", async () => {
  const layers: any[] = [
    {
      inventoryAgeLayerId: 1,
      sourceDocumentType: "GRN",
      sourceDocumentId: 1,
      sourceDocumentLineId: 1,
      receiptDate: "2026-01-01",
      remainingQuantity: "50",
      isActive: true,
    },
    {
      inventoryAgeLayerId: 2,
      sourceDocumentType: "GRN",
      sourceDocumentId: 2,
      sourceDocumentLineId: 2,
      receiptDate: "2026-02-01",
      remainingQuantity: "4",
      isActive: true,
    },
  ];
  const manager: any = {
    getRepository: () => ({ save: async () => undefined }),
  };
  const result = await new InventoryAgeLayerService().relieve(manager, layers, {
    quantity: original.quantityIn,
    preferredSource: {
      sourceDocumentType: "GRN",
      sourceDocumentId: 2,
      sourceDocumentLineId: 2,
    },
    exact: true,
  });
  assert.equal(layers[0].remainingQuantity, "50");
  assert.equal(layers[1].isActive, false);
  assert.equal(result.unallocatedQuantity, "6.0000");
});
test("reversal DTO trims reason, rejects blanks, length overflow and nonboolean confirmations", async () => {
  const valid = plainToInstance(ReverseGoodsReceiptDto, {
    reason: " mistake ",
    confirmNegativeStock: true,
  });
  assert.equal(valid.reason, "mistake");
  assert.deepEqual(await validate(valid), []);
  for (const body of [
    { reason: " " },
    { reason: "a".repeat(1001) },
    { reason: "valid", confirmNegativeStock: "true" },
  ])
    assert.ok(
      (await validate(plainToInstance(ReverseGoodsReceiptDto, body))).length,
    );
});
test("every reversal endpoint requires GRN_REVERSE and preserves existing GRN permissions", () => {
  for (const method of ["candidates", "preview", "reverse"] as const)
    assert.equal(
      Reflect.getMetadata(
        REQUIRE_PERMISSION,
        GoodsReceiptsController.prototype[method],
      ),
      "GRN_REVERSE",
    );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_PERMISSION,
      GoodsReceiptsController.prototype.cancel,
    ),
    "GRN_CANCEL",
  );
});
test("permission guard requires assigned grant for non-admins and enabled module for admins", async () => {
  let grant = false,
    enabled = true;
  const user: any = {
    scope: "TENANT",
    tenantId: 1,
    roleId: 2,
    roleCode: "CLERK",
  };
  const ds: any = {
    getRepository: (entity: any) => ({
      findOneBy: async () =>
        entity === Permission
          ? { permissionId: 5, moduleId: 3 }
          : entity === TenantModule
            ? enabled
              ? {}
              : null
            : null,
      findOne: async () => (grant ? {} : null),
    }),
  };
  const guard = new PermissionGuard(
    { getAllAndOverride: () => "GRN_REVERSE" } as any,
    ds,
  );
  const ctx: any = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  await assert.rejects(() => guard.canActivate(ctx), ForbiddenException);
  grant = true;
  assert.equal(await guard.canActivate(ctx), true);
  grant = false;
  user.roleCode = "TENANT_ADMIN";
  assert.equal(await guard.canActivate(ctx), true);
  enabled = false;
  await assert.rejects(() => guard.canActivate(ctx), ForbiddenException);
});
test("ledger declares source idempotency and one reversal per original ledger", () => {
  const metadata = getMetadataArgsStorage();
  assert.ok(
    metadata.uniques.some(
      (index) =>
        index.target === InventoryLedger &&
        index.name === "uq_inventory_ledger_source_movement",
    ),
  );
  assert.ok(
    metadata.indices.some(
      (index) =>
        index.target === InventoryLedger &&
        index.name === "uq_inventory_ledger_reversal" &&
        index.unique,
    ),
  );
});
