import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { PurchaseOrderLine } from '../purchase-orders/purchase-order-line.entity';
import { GoodsReceiptsService } from './goods-receipts.service';

const service = new GoodsReceiptsService({} as any, {} as any, {} as any, {} as any, {} as any) as any;

test('PO-based GRN header cannot drift from approved PO supplier, location or currency', () => {
  const po = { status: 'APPROVED', supplierId: 1, locationId: 2, currencyCode: 'LKR' };
  assert.doesNotThrow(() => service.assertPoHeader(po, 1, 2, 'lkr'));
  assert.throws(() => service.assertPoHeader(po, 9, 2, 'LKR'), BadRequestException);
  assert.throws(() => service.assertPoHeader(po, 1, 2, 'USD'), BadRequestException);
});

test('PO-based receipt cost variance requires a reason while unchanged PO snapshot cost does not', () => {
  assert.equal(service.costOverrideReason(undefined, false, 'PO cost snapshot'), null);
  assert.throws(() => service.costOverrideReason('', true, 'PO cost snapshot'), BadRequestException);
  assert.equal(service.costOverrideReason('Damaged packaging allowance', true, 'PO cost snapshot'), 'Damaged packaging allowance');
});

test('direct GRN supplier price is resolved by receipt date', async () => {
  const price = { productSupplierPriceId: 4, productSupplierUnitId: 8, minimumQuantity: '1', currencyCode: 'LKR', isActive: true, purchasePrice: '50', effectiveFrom: new Date('2026-08-01'), effectiveTo: new Date('2026-08-31') };
  const manager: any = { getRepository: (entity: any) => entity === ProductSupplierPrice ? { findOneBy: async () => price } : {} };
  await assert.doesNotReject(() => service.resolveDirectSupplierPrice(manager, { sourceSupplierPriceId: 4, receivedQty: 2 }, 8, '2026-08-22', 'LKR'));
  await assert.rejects(() => service.resolveDirectSupplierPrice(manager, { sourceSupplierPriceId: 4, receivedQty: 2 }, 8, '2026-09-01', 'LKR'), BadRequestException);
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
