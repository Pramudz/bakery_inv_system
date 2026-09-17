/** Explicit disposable-local-MySQL suite. Never selects the configured application database. */
import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Tenant } from "../tenants/tenant.entity";
import { User } from "../users/user.entity";
import { Location } from "../locations/locations.entity";
import { Supplier } from "../suppliers/suppliers.entity";
import { Category } from "../categories/categories.entity";
import { UnitOfMeasure } from "../units/units.entity";
import { Product } from "../products/products.entity";
import { ProductUnit } from "../product-units/product-units.entity";
import { ProductLocation } from "../product-locations/product-locations.entity";
import { GoodsReceipt } from "./goods-receipt.entity";
import { GoodsReceiptLine } from "./goods-receipt-line.entity";
import { InventoryBalance } from "../inventory-balance/inventory-balance.entity";
import { InventoryLedger } from "../inventory-ledger/inventory-ledger.entity";
import { InventoryAgeLayer } from "../inventory-age-layers/inventory-age-layer.entity";
import { InventoryBalanceService } from "../inventory-balance/inventory-balance.service";
import { InventoryLedgerService } from "../inventory-ledger/inventory-ledger.service";
import { InventoryAgeLayerService } from "../inventory-age-layers/inventory-age-layer.service";
import { PurchaseOrder } from "../purchase-orders/purchase-order.entity";
import { PurchaseOrderLine } from "../purchase-orders/purchase-order-line.entity";
import { GoodsReceiptsService } from "./goods-receipts.service";
import { NumberSequencesService } from "../number-sequences/number-sequences.service";
import { TenantPrincipal } from "../auth/auth.types";
import { AddGoodsReceiptReversal1770000020000 } from "../../migrations/1770000020000-AddGoodsReceiptReversal";

test(
  "disposable MySQL: GRN reversal transactions, migration and constraints",
  { timeout: 120000 },
  async (t) => {
    if (!["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST ?? ""))
      throw new Error("This suite only permits a local MySQL host.");
    const database = `grn_reversal_test_${Date.now()}_${randomBytes(4).toString("hex")}`;
    assert.match(database, /^grn_reversal_test_\d+_[a-f0-9]{8}$/);
    assert.notEqual(database, process.env.DB_DATABASE);
    const options = {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    };
    const server = await createConnection(options);
    let created = false;
    const ds = new DataSource({
      type: "mysql",
      host: options.host,
      port: options.port,
      username: options.user,
      password: options.password,
      database,
      entities: [__dirname + "/../../**/*.entity.js"],
      synchronize: false,
    });
    try {
      await server.query(`CREATE DATABASE \`${database}\``);
      created = true;
      await ds.initialize();
      await ds.synchronize();
      const runner = ds.createQueryRunner();
      const migration = new AddGoodsReceiptReversal1770000020000();
      await t.test(
        "migration applies to previous schema, retries safely and rolls back empty schema",
        async () => {
          const additions = {
            tbl_goods_receipt: [
              "reversal_reason",
              "reversed_by_user_id",
              "reversed_at",
            ],
            tbl_inventory_ledger: [
              "valuation_method",
              "original_document_value",
              "inventory_relief_value",
              "cost_variance",
              "reversal_of_ledger_id",
              "business_date",
              "age_layer_relief",
            ],
          };
          for (const [tableName, columns] of Object.entries(additions)) {
            const table = (await runner.getTable(tableName))!;
            for (const fk of table.foreignKeys.filter((key) =>
              key.columnNames.some((name) => columns.includes(name)),
            ))
              await runner.dropForeignKey(tableName, fk);
            for (const index of table.indices.filter((index) =>
              index.columnNames.some((name) => columns.includes(name)),
            ))
              await runner.dropIndex(tableName, index);
            for (const column of columns)
              await runner.dropColumn(tableName, column);
          }
          await migration.up(runner);
          await migration.up(runner);
          await migration.down(runner);
          await migration.up(runner);
        },
      );
      const service = new GoodsReceiptsService(
        ds,
        new InventoryBalanceService(),
        new InventoryLedgerService(),
        new InventoryAgeLayerService(),
        {} as NumberSequencesService,
      );
      let counter = 0;
      async function seed<T extends ObjectLiteral>(
        entity: EntityTarget<T>,
        supplied: Record<string, unknown>,
      ) {
        const values: Record<string, unknown> = {};
        for (const column of ds.getMetadata(entity).columns) {
          if (
            column.isNullable ||
            column.isGenerated ||
            column.isCreateDate ||
            column.isUpdateDate ||
            column.default !== undefined
          )
            continue;
          values[column.propertyName] = ["bigint", "int", "decimal"].includes(
            String(column.type),
          )
            ? 1
            : column.type === "date"
              ? "2026-09-01"
              : column.type === "datetime"
                ? new Date("2026-09-01T00:00:00Z")
                : `test${++counter}`;
        }
        const repository = ds.getRepository(entity);
        return repository.save(
          repository.create({ ...values, ...supplied } as any) as unknown as T,
        );
      }
      async function fixture(poBased = false, late = false) {
        const tenant = await seed(Tenant, { timeZone: "Asia/Colombo" });
        const tenantId = Number(tenant.tenantId);
        const userRow = await seed(User, { tenantId });
        const user: TenantPrincipal = {
          tenantId,
          userId: Number(userRow.userId),
          scope: "TENANT",
          username: userRow.username,
          roleId: 1,
          roleCode: "TENANT_ADMIN",
          accessScope: "TENANT",
          assignedLocationIds: [],
        };
        const location = await seed(Location, { tenantId });
        const supplier = await seed(Supplier, { tenantId });
        const category = await seed(Category, { tenantId });
        const unit = await seed(UnitOfMeasure, { tenantId, code: "KG", name: "Kilogram" });
        const product = await seed(Product, {
          tenantId,
          categoryId: category.categoryId,
          baseUnitId: unit.unitId,
          sku: `SKU-${++counter}`,
          productName: "First product",
        });
        const productUnit = await seed(ProductUnit, {
          productId: product.productId,
          unitId: unit.unitId,
          conversionFactor: "1.000000",
        });
        const scope = {
          tenantId,
          locationId: location.locationId,
          productId: product.productId,
        };
        await seed(ProductLocation, {
          productId: product.productId,
          locationId: location.locationId,
        });
        const po = poBased
          ? await seed(PurchaseOrder, {
              tenantId,
              supplierId: supplier.supplierId,
              locationId: location.locationId,
              createdByUserId: user.userId,
              currencyCode: "LKR",
              status: "PART_RECEIVED",
            })
          : null;
        const poLine = po
          ? await seed(PurchaseOrderLine, {
              purchaseOrderId: po.purchaseOrderId,
              productId: product.productId,
              productUnitId: productUnit.productUnitId,
              unitId: unit.unitId,
              conversionFactorSnapshot: "1",
              orderedQty: "20",
              receivedQty: "14",
              status: "PART_RECEIVED",
            })
          : null;
        const receipt = await seed(GoodsReceipt, {
          tenantId,
          supplierId: supplier.supplierId,
          locationId: location.locationId,
          createdByUserId: user.userId,
          postedByUserId: user.userId,
          postedAt: new Date("2026-09-01"),
          currencyCode: "LKR",
          receiptType: po ? "PO_BASED" : "DIRECT",
          status: "POSTED",
          purchaseOrderId: po?.purchaseOrderId ?? null,
          grnNumber: `GRN-${++counter}`,
        });
        const line = await seed(GoodsReceiptLine, {
          goodsReceiptId: receipt.goodsReceiptId,
          productId: product.productId,
          productUnitId: productUnit.productUnitId,
          unitId: unit.unitId,
          conversionFactorSnapshot: "1.000000",
          receivedQty: "10",
          unitCost: "150",
          netUnitCost: "150",
          lineTotal: "1500",
          purchaseOrderLineId: poLine?.purchaseOrderLineId ?? null,
        });
        const original = await seed(InventoryLedger, {
          ...scope,
          movementType: "GRN",
          sourceDocumentType: "GRN",
          sourceDocumentId: receipt.goodsReceiptId,
          sourceDocumentLineId: line.goodsReceiptLineId,
          quantityIn: "10",
          quantityOut: "0",
          unitCost: "150",
          movementValue: "1500",
          quantityBefore: "20",
          quantityAfter: "30",
          averageCostBefore: "100",
          averageCostAfter: "116.6667",
          createdByUserId: user.userId,
        });
        const openingLayer = await seed(InventoryAgeLayer, {
          ...scope,
          sourceDocumentType: "OPENING",
          sourceDocumentId: receipt.goodsReceiptId,
          sourceDocumentLineId: line.goodsReceiptLineId,
          originalQuantity: "20",
          remainingQuantity: "20",
          originalUnitCost: "100",
        });
        const layer = await seed(InventoryAgeLayer, {
          ...scope,
          sourceDocumentType: "GRN",
          sourceDocumentId: receipt.goodsReceiptId,
          sourceDocumentLineId: line.goodsReceiptLineId,
          originalQuantity: "10",
          remainingQuantity: "10",
          originalUnitCost: "150",
        });
        if (late)
          await seed(InventoryLedger, {
            ...scope,
            movementType: "RECEIPT",
            sourceDocumentType: "TEST",
            sourceDocumentId: receipt.goodsReceiptId,
            sourceDocumentLineId: line.goodsReceiptLineId,
            quantityIn: "10",
            quantityOut: "0",
            unitCost: "150",
            movementValue: "1500",
            quantityBefore: "30",
            quantityAfter: "40",
            averageCostBefore: "116.6667",
            averageCostAfter: "125",
            createdByUserId: user.userId,
          });
        const balance = await seed(InventoryBalance, {
          ...scope,
          quantityOnHand: late ? "40" : "30",
          averageCost: late ? "125" : "116.6667",
        });
        return {
          user,
          receipt,
          line,
          original,
          balance,
          layer,
          openingLayer,
          po,
          poLine,
          product,
          productUnit,
          unit,
          location,
        };
      }
      const reverse = (
        f: Awaited<ReturnType<typeof fixture>>,
        confirmation = false,
        svc = service,
      ) =>
        svc.reverse(
          Number(f.receipt.goodsReceiptId),
          {
            reason: " Incorrect delivery ",
            confirmNegativeStock: confirmation,
          },
          f.user,
        );
      for (const poBased of [false, true])
        for (const late of [false, true])
          await t.test(
            `${poBased ? "PO" : "Direct"} ${late ? "late compensation" : "exact reversal"} is atomic and preserves original history`,
            async () => {
              const f = await fixture(poBased, late);
              const historyBefore = await ds
                .getRepository(InventoryLedger)
                .findBy({ tenantId: f.user.tenantId });
              const preview: any = await service.reversalPreview(
                Number(f.receipt.goodsReceiptId),
                f.user,
              );
              assert.equal(preview.eligible, true);
              assert.equal(preview.lines[0].sku, f.product.sku);
              assert.equal(preview.lines[0].productName, f.product.productName);
              assert.equal(preview.lines[0].productDisplayName, `${f.product.sku} — ${f.product.productName}`);
              assert.equal(preview.lines[0].purchaseUnitCode, "KG");
              assert.equal(preview.lines[0].purchaseUnitName, "Kilogram");
              assert.equal(preview.lines[0].baseUnitCode, "KG");
              assert.equal(preview.lines[0].conversionFactor, "1.000000");
              assert.equal(preview.receipt.supplier.supplierId, f.receipt.supplierId);
              assert.equal(preview.receipt.location.locationId, f.receipt.locationId);
              if (f.poLine) {
                assert.equal(preview.receipt.purchaseOrder.poNumber, f.po!.poNumber);
                assert.equal(preview.purchaseOrderImpact.lines.length, 1);
                assert.equal(preview.purchaseOrderImpact.lines[0].sku, f.product.sku);
                assert.equal(preview.purchaseOrderImpact.lines[0].productName, f.product.productName);
                assert.equal(preview.purchaseOrderImpact.lines[0].orderedQty, "20.0000");
                assert.equal(preview.purchaseOrderImpact.lines[0].reversalQty, "10.0000");
              } else assert.equal(preview.purchaseOrderImpact, null);
              await reverse(f);
              const balance = await ds
                .getRepository(InventoryBalance)
                .findOneByOrFail({
                  inventoryBalanceId: f.balance.inventoryBalanceId,
                });
              assert.equal(
                balance.quantityOnHand,
                late ? "30.0000" : "20.0000",
              );
              assert.equal(balance.averageCost, late ? "125.0000" : "100.0000");
              const movement = await ds
                .getRepository(InventoryLedger)
                .findOneByOrFail({
                  reversalOfLedgerId: f.original.inventoryLedgerId,
                });
              assert.equal(
                movement.inventoryReliefValue,
                late ? "1250.0000" : "1500.0000",
              );
              assert.equal(movement.costVariance, late ? "250.0000" : "0.0000");
              assert.equal(
                movement.ageLayerRelief?.allocations[0].after,
                "0.0000",
              );
              assert.equal(movement.businessDate?.length, 10);
              for (const row of historyBefore)
                assert.deepEqual(
                  await ds
                    .getRepository(InventoryLedger)
                    .findOneByOrFail({
                      inventoryLedgerId: row.inventoryLedgerId,
                    }),
                  row,
                );
              const receipt = await ds
                .getRepository(GoodsReceipt)
                .findOneByOrFail({ goodsReceiptId: f.receipt.goodsReceiptId });
              assert.equal(receipt.status, "REVERSED");
              assert.equal(receipt.reversalReason, "Incorrect delivery");
              assert.equal(Number(receipt.reversedByUserId), f.user.userId);
              assert.ok(receipt.reversedAt);
              assert.equal(
                (
                  await ds
                    .getRepository(InventoryAgeLayer)
                    .findOneByOrFail({
                      inventoryAgeLayerId: f.openingLayer.inventoryAgeLayerId,
                    })
                ).remainingQuantity,
                "20.0000",
              );
              if (f.po && f.poLine) {
                assert.equal(
                  (
                    await ds
                      .getRepository(PurchaseOrderLine)
                      .findOneByOrFail({
                        purchaseOrderLineId: f.poLine.purchaseOrderLineId,
                      })
                  ).receivedQty,
                  "4.0000",
                );
                assert.equal(
                  (
                    await ds
                      .getRepository(PurchaseOrder)
                      .findOneByOrFail({
                        purchaseOrderId: f.po.purchaseOrderId,
                      })
                  ).status,
                  "PART_RECEIVED",
                );
              }
              await assert.rejects(() => reverse(f), ConflictException);
            },
          );
      await t.test("multi-product previews map each GRN and affected PO line to its own SKU", async () => {
        for (const poBased of [false, true]) {
          const f = await fixture(poBased);
          const second = await seed(Product, {
            tenantId: f.user.tenantId,
            categoryId: f.product.categoryId,
            baseUnitId: f.unit.unitId,
            sku: `SKU-SECOND-${++counter}`,
            productName: "Second product",
          });
          const secondUnit = await seed(ProductUnit, {
            productId: second.productId,
            unitId: f.unit.unitId,
            conversionFactor: "1.000000",
          });
          await seed(ProductLocation, { productId: second.productId, locationId: f.location.locationId });
          const secondPoLine = f.po ? await seed(PurchaseOrderLine, {
            purchaseOrderId: f.po.purchaseOrderId,
            productId: second.productId,
            productUnitId: secondUnit.productUnitId,
            unitId: f.unit.unitId,
            conversionFactorSnapshot: "1.000000",
            orderedQty: "10",
            receivedQty: "5",
            status: "PART_RECEIVED",
          }) : null;
          const unrelatedPoLine = f.po ? await seed(PurchaseOrderLine, {
            purchaseOrderId: f.po.purchaseOrderId,
            productId: second.productId,
            productUnitId: secondUnit.productUnitId,
            unitId: f.unit.unitId,
            conversionFactorSnapshot: "1.000000",
            orderedQty: "10",
            receivedQty: "0",
            status: "OPEN",
          }) : null;
          const secondLine = await seed(GoodsReceiptLine, {
            goodsReceiptId: f.receipt.goodsReceiptId,
            purchaseOrderLineId: secondPoLine?.purchaseOrderLineId ?? null,
            productId: second.productId,
            productUnitId: secondUnit.productUnitId,
            unitId: f.unit.unitId,
            conversionFactorSnapshot: "1.000000",
            receivedQty: "5",
            unitCost: "200",
            netUnitCost: "200",
            lineTotal: "1000",
          });
          const secondScope = { tenantId: f.user.tenantId, locationId: f.location.locationId, productId: second.productId };
          await seed(InventoryLedger, {
            ...secondScope,
            movementType: "GRN",
            sourceDocumentType: "GRN",
            sourceDocumentId: f.receipt.goodsReceiptId,
            sourceDocumentLineId: secondLine.goodsReceiptLineId,
            quantityIn: "5",
            quantityOut: "0",
            unitCost: "200",
            movementValue: "1000",
            quantityBefore: "20",
            quantityAfter: "25",
            averageCostBefore: "100",
            averageCostAfter: "120",
            createdByUserId: f.user.userId,
          });
          await seed(InventoryAgeLayer, { ...secondScope, sourceDocumentType: "OPENING", sourceDocumentId: f.receipt.goodsReceiptId, sourceDocumentLineId: secondLine.goodsReceiptLineId, originalQuantity: "20", remainingQuantity: "20", originalUnitCost: "100" });
          await seed(InventoryAgeLayer, { ...secondScope, sourceDocumentType: "GRN", sourceDocumentId: f.receipt.goodsReceiptId, sourceDocumentLineId: secondLine.goodsReceiptLineId, originalQuantity: "5", remainingQuantity: "5", originalUnitCost: "200" });
          await seed(InventoryBalance, { ...secondScope, quantityOnHand: "25", averageCost: "120" });

          const preview: any = await service.reversalPreview(Number(f.receipt.goodsReceiptId), f.user);
          assert.equal(preview.eligible, true);
          assert.equal(preview.lines.length, 2);
          const grnProducts = new Map(preview.lines.map((line: any) => [String(line.goodsReceiptLineId), line.productDisplayName]));
          assert.equal(grnProducts.get(String(f.line.goodsReceiptLineId)), `${f.product.sku} — ${f.product.productName}`);
          assert.equal(grnProducts.get(String(secondLine.goodsReceiptLineId)), `${second.sku} — ${second.productName}`);
          assert.equal(preview.originalDocumentValue, "2500.0000");
          if (f.po) {
            assert.equal(preview.purchaseOrderImpact.lines.length, 2);
            const poProducts = new Map<string, any>(preview.purchaseOrderImpact.lines.map((line: any) => [String(line.purchaseOrderLineId), line]));
            assert.equal(poProducts.get(String(f.poLine!.purchaseOrderLineId)).sku, f.product.sku);
            assert.equal(poProducts.get(String(secondPoLine!.purchaseOrderLineId)).sku, second.sku);
            assert.equal(poProducts.get(String(secondPoLine!.purchaseOrderLineId)).reversalQty, "5.0000");
            assert.equal(poProducts.has(String(unrelatedPoLine!.purchaseOrderLineId)), false);
          } else assert.equal(preview.purchaseOrderImpact, null);
        }
      });
      await t.test(
        "PO all-zero receipts reopen the line and return header to APPROVED",
        async () => {
          const f = await fixture(true);
          await ds
            .getRepository(PurchaseOrderLine)
            .update(f.poLine!.purchaseOrderLineId, { receivedQty: "10" });
          await reverse(f);
          assert.equal(
            (
              await ds
                .getRepository(PurchaseOrderLine)
                .findOneByOrFail({
                  purchaseOrderLineId: f.poLine!.purchaseOrderLineId,
                })
            ).status,
            "OPEN",
          );
          assert.equal(
            (
              await ds
                .getRepository(PurchaseOrder)
                .findOneByOrFail({ purchaseOrderId: f.po!.purchaseOrderId })
            ).status,
            "APPROVED",
          );
        },
      );
      await t.test(
        "preview is read-only; stale preview cannot bypass negative-stock confirmation",
        async () => {
          const f = await fixture(false, true);
          await service.reversalPreview(
            Number(f.receipt.goodsReceiptId),
            f.user,
          );
          assert.equal(
            (
              await ds
                .getRepository(GoodsReceipt)
                .findOneByOrFail({ goodsReceiptId: f.receipt.goodsReceiptId })
            ).status,
            "POSTED",
          );
          await ds
            .getRepository(InventoryBalance)
            .update(f.balance.inventoryBalanceId, { quantityOnHand: "2" });
          await assert.rejects(() => reverse(f), BadRequestException);
          const preview: any = await service.reversalPreview(
            Number(f.receipt.goodsReceiptId),
            f.user,
          );
          assert.equal(preview.negativeStockLineCount, 1);
          assert.equal(preview.lines[0].projectedQuantity, "-8.0000");
          await reverse(f, true);
          const balance = await ds
            .getRepository(InventoryBalance)
            .findOneByOrFail({
              inventoryBalanceId: f.balance.inventoryBalanceId,
            });
          assert.equal(balance.quantityOnHand, "-8.0000");
          assert.equal(balance.averageCost, "125.0000");
        },
      );
      await t.test(
        "concurrent requests serialize on GRN lock and produce exactly one reversal",
        async () => {
          const f = await fixture();
          const results = await Promise.allSettled([reverse(f), reverse(f)]);
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const rejected = results.find(
            (result) => result.status === "rejected",
          ) as PromiseRejectedResult;
          assert.ok(rejected.reason instanceof ConflictException);
          assert.equal(
            await ds
              .getRepository(InventoryLedger)
              .countBy({ reversalOfLedgerId: f.original.inventoryLedgerId }),
            1,
          );
        },
      );
      await t.test(
        "tenant/location isolation covers get, cancel, preview, reverse and legacy list",
        async () => {
          const f = await fixture();
          const id = Number(f.receipt.goodsReceiptId);
          const foreign = { ...f.user, tenantId: 9999999 };
          const denied = {
            ...f.user,
            accessScope: "LOCATION" as const,
            assignedLocationIds: [],
          };
          for (const operation of [
            () => service.get(id, foreign),
            () => service.reversalPreview(id, foreign),
          ])
            await assert.rejects(operation, NotFoundException);
          for (const operation of [
            () => service.get(id, denied),
            () => service.cancel(id, denied),
            () => service.reversalPreview(id, denied),
            () => service.reverse(id, { reason: "test" }, denied),
          ])
            await assert.rejects(operation, ForbiddenException);
          assert.deepEqual(await service.list(denied), []);
          const page = await service.findPage(denied, 1, 20, "", "POSTED", "");
          assert.equal(page.total, 0);
        },
      );
      await t.test(
        "missing ledger and PO underflow are blocking integrity conflicts",
        async () => {
          const f = await fixture(true);
          await ds
            .getRepository(PurchaseOrderLine)
            .update(f.poLine!.purchaseOrderLineId, { receivedQty: "5" });
          await assert.rejects(() => reverse(f), ConflictException);
          await ds
            .getRepository(PurchaseOrderLine)
            .update(f.poLine!.purchaseOrderLineId, { receivedQty: "14" });
          await ds
            .getRepository(InventoryLedger)
            .delete(f.original.inventoryLedgerId);
          assert.equal(
            (
              await service.reversalPreview(
                Number(f.receipt.goodsReceiptId),
                f.user,
              )
            ).eligible,
            false,
          );
          await assert.rejects(() => reverse(f), ConflictException);
        },
      );
      await t.test(
        "late failure rolls back balances, layer consumption, ledger, PO and GRN",
        async () => {
          const f = await fixture(true);
          const failingLedgers = new InventoryLedgerService();
          failingLedgers.insert = async () => {
            throw new Error("Injected ledger failure");
          };
          const failing = new GoodsReceiptsService(
            ds,
            new InventoryBalanceService(),
            failingLedgers,
            new InventoryAgeLayerService(),
            {} as NumberSequencesService,
          );
          await assert.rejects(
            () => reverse(f, false, failing),
            /Injected ledger failure/,
          );
          assert.equal(
            (
              await ds
                .getRepository(InventoryBalance)
                .findOneByOrFail({
                  inventoryBalanceId: f.balance.inventoryBalanceId,
                })
            ).quantityOnHand,
            "30.0000",
          );
          assert.equal(
            (
              await ds
                .getRepository(InventoryAgeLayer)
                .findOneByOrFail({
                  inventoryAgeLayerId: f.layer.inventoryAgeLayerId,
                })
            ).remainingQuantity,
            "10.0000",
          );
          assert.equal(
            (
              await ds
                .getRepository(PurchaseOrderLine)
                .findOneByOrFail({
                  purchaseOrderLineId: f.poLine!.purchaseOrderLineId,
                })
            ).receivedQty,
            "14.0000",
          );
          assert.equal(
            (
              await ds
                .getRepository(GoodsReceipt)
                .findOneByOrFail({ goodsReceiptId: f.receipt.goodsReceiptId })
            ).status,
            "POSTED",
          );
          assert.equal(
            await ds
              .getRepository(InventoryLedger)
              .countBy({ reversalOfLedgerId: f.original.inventoryLedgerId }),
            0,
          );
        },
      );
      await t.test(
        "database constraints prevent duplicate original-reference and source movement",
        async () => {
          const f = await fixture();
          await reverse(f);
          const row = await ds
            .getRepository(InventoryLedger)
            .findOneByOrFail({
              reversalOfLedgerId: f.original.inventoryLedgerId,
            });
          const { inventoryLedgerId, createdAt, updatedAt, ...copy } = row;
          await assert.rejects(
            () =>
              ds
                .getRepository(InventoryLedger)
                .insert({
                  ...copy,
                  sourceDocumentLineId:
                    Number(copy.sourceDocumentLineId) + 999999,
                }),
            /Duplicate entry/,
          );
          await assert.rejects(
            () =>
              ds
                .getRepository(InventoryLedger)
                .insert({ ...copy, reversalOfLedgerId: null }),
            /Duplicate entry/,
          );
          await assert.rejects(
            () => migration.down(runner),
            /Cannot roll back/,
          );
        },
      );
      await t.test(
        "multiple product lines unwind in reverse posting order and restore pre-GRN WAVG",
        async () => {
          const f = await fixture();
          const line = await seed(GoodsReceiptLine, {
            ...f.line,
            goodsReceiptLineId: undefined,
            receivedQty: "5",
            unitCost: "200",
            netUnitCost: "200",
            lineTotal: "1000",
          });
          await seed(InventoryLedger, {
            ...f.original,
            inventoryLedgerId: undefined,
            sourceDocumentLineId: line.goodsReceiptLineId,
            quantityIn: "5",
            unitCost: "200",
            movementValue: "1000",
            quantityBefore: "30",
            quantityAfter: "35",
            averageCostBefore: "116.6667",
            averageCostAfter: "128.5715",
          });
          await seed(InventoryAgeLayer, {
            ...f.layer,
            inventoryAgeLayerId: undefined,
            sourceDocumentLineId: line.goodsReceiptLineId,
            originalQuantity: "5",
            remainingQuantity: "5",
            originalUnitCost: "200",
          });
          await ds
            .getRepository(InventoryBalance)
            .update(f.balance.inventoryBalanceId, {
              quantityOnHand: "35",
              averageCost: "128.5715",
            });
          const preview: any = await service.reversalPreview(
            Number(f.receipt.goodsReceiptId),
            f.user,
          );
          assert.equal(preview.lines.length, 2);
          assert.equal(preview.originalDocumentValue, "2500.0000");
          assert.ok(
            preview.lines.every(
              (row: any) =>
                row.valuationMethod === "EXACT_ORIGINAL" &&
                row.projectedQuantity === "20.0000" &&
                row.currentQuantity === "35.0000",
            ),
          );
          await reverse(f);
          const balance = await ds
            .getRepository(InventoryBalance)
            .findOneByOrFail({
              inventoryBalanceId: f.balance.inventoryBalanceId,
            });
          assert.equal(balance.quantityOnHand, "20.0000");
          assert.equal(balance.averageCost, "100.0000");
        },
      );
      await t.test(
        "zero balance and unallocated layer quantities remain explicit persisted values",
        async () => {
          const f = await fixture(false, true);
          await ds
            .getRepository(InventoryBalance)
            .update(f.balance.inventoryBalanceId, { quantityOnHand: "10" });
          await ds
            .getRepository(InventoryAgeLayer)
            .update(f.layer.inventoryAgeLayerId, { remainingQuantity: "2" });
          await ds
            .getRepository(InventoryAgeLayer)
            .update(f.openingLayer.inventoryAgeLayerId, {
              remainingQuantity: "3",
            });
          await reverse(f);
          const balance = await ds
            .getRepository(InventoryBalance)
            .findOneByOrFail({
              inventoryBalanceId: f.balance.inventoryBalanceId,
            });
          assert.equal(balance.quantityOnHand, "0.0000");
          assert.equal(balance.averageCost, "0.0000");
          const row = await ds
            .getRepository(InventoryLedger)
            .findOneByOrFail({
              reversalOfLedgerId: f.original.inventoryLedgerId,
            });
          assert.equal(row.costVariance, "250.0000");
          assert.equal(row.ageLayerRelief?.unallocatedQuantity, "5.0000");
          assert.deepEqual(
            row.ageLayerRelief?.allocations.map((item) => String(item.layerId)),
            [
              String(f.layer.inventoryAgeLayerId),
              String(f.openingLayer.inventoryAgeLayerId),
            ],
          );
        },
      );
      await t.test(
        "mismatched ledger quantities/values and PO links cannot reverse",
        async () => {
          const f = await fixture(true);
          await ds
            .getRepository(InventoryLedger)
            .update(f.original.inventoryLedgerId, { movementValue: "1400" });
          await assert.rejects(() => reverse(f), ConflictException);
          await ds
            .getRepository(InventoryLedger)
            .update(f.original.inventoryLedgerId, {
              movementValue: "1500",
              quantityIn: "9",
            });
          await assert.rejects(() => reverse(f), ConflictException);
          await ds
            .getRepository(InventoryLedger)
            .update(f.original.inventoryLedgerId, { quantityIn: "10" });
          await ds
            .getRepository(GoodsReceiptLine)
            .update(f.line.goodsReceiptLineId, { purchaseOrderLineId: null });
          await assert.rejects(() => reverse(f), ConflictException);
        },
      );
      await t.test(
        "terminal statuses and invalid input are rejected before mutation",
        async () => {
          const f = await fixture();
          for (const status of ["DRAFT", "CANCELLED", "REVERSED"]) {
            await ds
              .getRepository(GoodsReceipt)
              .update(f.receipt.goodsReceiptId, { status });
            await assert.rejects(() => reverse(f), ConflictException);
          }
          await assert.rejects(
            () => service.reverse(-1, { reason: "invalid" }, f.user),
            BadRequestException,
          );
          await assert.rejects(
            () =>
              service.reverse(
                Number(f.receipt.goodsReceiptId),
                { reason: " " },
                f.user,
              ),
            BadRequestException,
          );
          await assert.rejects(
            () =>
              service.reverse(
                Number(f.receipt.goodsReceiptId),
                { reason: "a".repeat(1001) },
                f.user,
              ),
            BadRequestException,
          );
          assert.equal(
            await ds
              .getRepository(InventoryLedger)
              .countBy({ reversalOfLedgerId: f.original.inventoryLedgerId }),
            0,
          );
        },
      );
      await t.test(
        "failure at final GRN save rolls back already-updated PO, inventory, ledger and layers",
        async () => {
          const f = await fixture(true);
          await ds.query(
            "CREATE TRIGGER reject_test_reversal BEFORE UPDATE ON tbl_goods_receipt FOR EACH ROW BEGIN IF NEW.status = 'REVERSED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected final GRN save failure'; END IF; END",
          );
          try {
            await assert.rejects(
              () => reverse(f),
              /Injected final GRN save failure/,
            );
            assert.equal(
              (
                await ds
                  .getRepository(PurchaseOrderLine)
                  .findOneByOrFail({
                    purchaseOrderLineId: f.poLine!.purchaseOrderLineId,
                  })
              ).receivedQty,
              "14.0000",
            );
            assert.equal(
              (
                await ds
                  .getRepository(InventoryBalance)
                  .findOneByOrFail({
                    inventoryBalanceId: f.balance.inventoryBalanceId,
                  })
              ).quantityOnHand,
              "30.0000",
            );
            assert.equal(
              (
                await ds
                  .getRepository(InventoryAgeLayer)
                  .findOneByOrFail({
                    inventoryAgeLayerId: f.layer.inventoryAgeLayerId,
                  })
              ).remainingQuantity,
              "10.0000",
            );
            assert.equal(
              (
                await ds
                  .getRepository(GoodsReceipt)
                  .findOneByOrFail({ goodsReceiptId: f.receipt.goodsReceiptId })
              ).status,
              "POSTED",
            );
            assert.equal(
              await ds
                .getRepository(InventoryLedger)
                .countBy({ reversalOfLedgerId: f.original.inventoryLedgerId }),
              0,
            );
          } finally {
            await ds.query("DROP TRIGGER reject_test_reversal");
          }
        },
      );
      await runner.release();
    } finally {
      if (ds.isInitialized) await ds.destroy();
      // Only this run's newly created database can ever be dropped.
      if (
        created &&
        /^grn_reversal_test_\d+_[a-f0-9]{8}$/.test(database) &&
        database !== process.env.DB_DATABASE
      )
        await server.query(`DROP DATABASE \`${database}\``);
      await server.end();
    }
  },
);
