import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { PurchaseOrderLine } from '../purchase-orders/purchase-order-line.entity';
import { Tenant } from '../tenants/tenant.entity';
import { GoodsReceiptLine } from './goods-receipt-line.entity';
import { GoodsReceipt } from './goods-receipt.entity';
import { GoodsReceiptsService } from './goods-receipts.service';

const service = new GoodsReceiptsService({} as any, {} as any, {} as any, {} as any, {} as any) as any;

test('PO-based GRN header cannot drift from approved PO supplier, location or currency', () => {
  const po = { status: 'APPROVED', supplierId: 1, locationId: 2, currencyCode: 'LKR' };
  assert.doesNotThrow(() => service.assertPoHeader(po, 1, 2, 'lkr'));
  assert.doesNotThrow(() => service.assertPoHeader({ ...po, status: 'PART_RECEIVED' }, 1, 2, 'LKR'));
  assert.throws(() => service.assertPoHeader(po, 9, 2, 'LKR'), BadRequestException);
  assert.throws(() => service.assertPoHeader(po, 1, 2, 'USD'), BadRequestException);
  for (const status of ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'])
    assert.throws(() => service.assertPoHeader({ ...po, status }, 1, 2, 'LKR'), BadRequestException);
});

test('PO-based receipt cost variance requires a reason while unchanged PO snapshot cost does not', () => {
  assert.equal(service.costOverrideReason(undefined, false, 'PO cost snapshot'), null);
  assert.throws(() => service.costOverrideReason('', true, 'PO cost snapshot'), BadRequestException);
  assert.equal(service.costOverrideReason('Damaged packaging allowance', true, 'PO cost snapshot'), 'Damaged packaging allowance');
});

test('direct GRN supplier price is resolved by receipt date', async () => {
  const price = { productSupplierPriceId: 4, productSupplierUnitId: '8', minimumQuantity: '1', currencyCode: 'LKR', isActive: true, purchasePrice: '50', effectiveFrom: new Date('2026-08-01'), effectiveTo: new Date('2026-08-31') };
  const manager: any = { getRepository: (entity: any) => entity === ProductSupplierPrice ? { findOneBy: async () => price } : {} };
  await assert.doesNotReject(() => service.resolveDirectSupplierPrice(manager, { sourceSupplierPriceId: 4, receivedQty: 2 }, '8', '2026-08-22', 'LKR'));
  await assert.rejects(() => service.resolveDirectSupplierPrice(manager, { sourceSupplierPriceId: 4, receivedQty: 2 }, 8, '2026-09-01', 'LKR'), BadRequestException);
});

test('paginated GRN list applies tenant, location, search and MVP filters on the server', async () => {
  const whereCalls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
  const builder: any = {
    leftJoinAndSelect: () => builder,
    where: (sql: string, params?: Record<string, unknown>) => { whereCalls.push({ sql, params }); return builder; },
    andWhere: (sql: string, params?: Record<string, unknown>) => { whereCalls.push({ sql, params }); return builder; },
    getCount: async () => 1,
    addSelect: () => builder,
    orderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getRawAndEntities: async () => ({ entities: [{ goodsReceiptId: 7 }], raw: [{ grn_total: '125.00' }] }),
  };
  const pagedService = new GoodsReceiptsService({ getRepository: () => ({ createQueryBuilder: () => builder }) } as any, {} as any, {} as any, {} as any, {} as any) as any;
  const result = await pagedService.findPage({ tenantId: 3, accessScope: 'LOCATION', assignedLocationIds: [9], userId: 1 }, 1, 20, 'Acme', 'draft', 'direct');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].total, '125.00');
  assert.ok(whereCalls.some(call => call.params?.tenantId === 3));
  assert.ok(whereCalls.some(call => Array.isArray(call.params?.locationIds) && (call.params?.locationIds as number[])[0] === 9));
  assert.ok(whereCalls.some(call => call.params?.search === '%acme%' && call.sql.includes('supplier.supplierName')));
  assert.ok(whereCalls.some(call => call.params?.status === 'DRAFT'));
  assert.ok(whereCalls.some(call => call.params?.receiptType === 'DIRECT'));
});

test('creating a Direct GRN saves a DRAFT without posting inventory', async () => {
  let saved: any;
  let inventoryCalls = 0;
  const manager: any = {
    getRepository: (entity: any) => {
      if (entity === Tenant) return { findOneBy: async () => ({ allowDirectGrn: true, poRequiredForGrn: false }) };
      if (entity === GoodsReceipt) return { create: (row: any) => row, save: async (row: any) => { saved = { goodsReceiptId: 11, ...row }; return saved; } };
      return {};
    },
  };
  const createService = new GoodsReceiptsService({ transaction: (work: any) => work(manager) } as any, { addStock: () => { inventoryCalls += 1; } } as any, {} as any, {} as any, {} as any) as any;
  createService.validateReferences = async () => undefined;
  createService.saveLines = async () => undefined;
  await createService.create({ receiptType: 'DIRECT', supplierId: 2, locationId: 4, receiptDate: '2026-09-09', currencyCode: 'LKR', lines: [{ productId: 1 }] }, { tenantId: 3, userId: 5 });
  assert.equal(saved.status, 'DRAFT');
  assert.equal(inventoryCalls, 0);
});

test('a Direct GRN posts once and a second post cannot create duplicate inventory', async () => {
  const receipt: any = { goodsReceiptId: 12, tenantId: 3, supplierId: 2, locationId: 4, receiptDate: '2026-09-09', receiptType: 'DIRECT', currencyCode: 'LKR', status: 'DRAFT' };
  const line: any = { goodsReceiptLineId: 15, productId: 6, productUnitId: 8, conversionFactorSnapshot: '1', receivedQty: '2', netUnitCost: '10' };
  let inventoryCalls = 0;
  const lineBuilder: any = { setLock: () => lineBuilder, where: () => lineBuilder, getMany: async () => [line] };
  const manager: any = { getRepository: (entity: any) => entity === GoodsReceiptLine ? { createQueryBuilder: () => lineBuilder } : entity === GoodsReceipt ? { save: async (row: any) => row } : {} };
  const postService = new GoodsReceiptsService({ transaction: (work: any) => work(manager) } as any, {} as any, {} as any, {} as any, { getTenantNextNumber: async () => 1 } as any) as any;
  postService.lockGoodsReceipt = async () => receipt;
  postService.assertLocationAccess = async () => undefined;
  postService.validateReferences = async () => undefined;
  postService.assertDirectLineStillEligible = async () => undefined;
  postService.lockInventoryContext = async () => undefined;
  postService.addInventory = async () => { inventoryCalls += 1; };
  await postService.post(12, { tenantId: 3, userId: 5 });
  assert.equal(receipt.status, 'POSTED');
  assert.equal(inventoryCalls, 1);
  await assert.rejects(() => postService.post(12, { tenantId: 3, userId: 5 }), BadRequestException);
  assert.equal(inventoryCalls, 1);
});

test('cancelling a draft makes it CANCELLED and prevents posting', async () => {
  const receipt: any = { goodsReceiptId: 13, tenantId: 3, supplierId: 2, locationId: 4, receiptDate: '2026-09-09', status: 'DRAFT' };
  const manager: any = { getRepository: (entity: any) => entity === GoodsReceipt ? { save: async (row: any) => row } : {} };
  const cancelService = new GoodsReceiptsService({ transaction: (work: any) => work(manager) } as any, {} as any, {} as any, {} as any, {} as any) as any;
  cancelService.lockGoodsReceipt = async () => receipt;
  await cancelService.cancel(13, { tenantId: 3, userId: 5 });
  assert.equal(receipt.status, 'CANCELLED');
  cancelService.assertLocationAccess = async () => undefined;
  await assert.rejects(() => cancelService.post(13, { tenantId: 3, userId: 5 }), BadRequestException);
});

test('PO partial receipt updates the locked line and over-receipt is rejected before save', async () => {
  let lockMode: string | undefined, saves = 0;
  const poLine: any = { purchaseOrderLineId: 1, purchaseOrderId: 3, productId: 5, productUnitId: 6, unitId: 7, orderedQty: '10', receivedQty: '3', status: 'OPEN' };
  const builder: any = { setLock: (mode: string) => { lockMode = mode; return builder; }, where: () => builder, getOne: async () => poLine };
  const repository: any = { createQueryBuilder: () => builder, save: async () => { saves += 1; } };
  const manager: any = { getRepository: (entity: any) => entity === PurchaseOrderLine ? repository : {} };
  const receipt: any = { purchaseOrderId: 3 };
  const line: any = { purchaseOrderLineId: 1, productId: 5, productUnitId: 6, unitId: 7 };
  await service.receivePoLine(manager, receipt, line, 4);
  assert.equal(lockMode, 'pessimistic_write');
  assert.equal(poLine.receivedQty, '7');
  assert.equal(poLine.status, 'PART_RECEIVED');
  await assert.rejects(() => service.receivePoLine(manager, receipt, line, 4), BadRequestException);
  assert.equal(saves, 1);
});
