import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { PurchaseOrdersService } from './purchase-orders.service';

const service = new PurchaseOrdersService({} as any, {} as any) as any;

test('PO manual cost and supplier-price variance require a trimmed override reason', () => {
  assert.throws(() => service.costOverrideReason('  ', true), BadRequestException);
  assert.equal(service.costOverrideReason(' Market shortage ', true), 'Market shortage');
  assert.equal(service.costOverrideReason(undefined, false), null);
});

test('PO selected supplier price is resolved at tenant business date, currency and numeric bigint identity', async () => {
  const price = { productSupplierPriceId: 9, productSupplierUnitId: '7', minimumQuantity: '1', currencyCode: 'LKR', isActive: true, purchasePrice: '25', effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-12-31') };
  const manager: any = { getRepository: (entity: any) => entity === ProductSupplierPrice ? { findOneBy: async () => price } : {} };
  assert.equal((await service.resolveSupplierPrice(manager, { sourceSupplierPriceId: 9, orderedQty: 2 }, 7, '2026-08-22', 'LKR', 'Asia/Colombo')).productSupplierPriceId, 9);
  await assert.rejects(() => service.resolveSupplierPrice(manager, { sourceSupplierPriceId: 9, orderedQty: 2 }, 7, '2027-01-01', 'LKR', 'Asia/Colombo'), BadRequestException);
});

test('PO pagination applies tenant, location, supplier search and status on the server', async () => {
  const whereCalls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
  const builder: any = {
    leftJoinAndSelect: () => builder,
    where: (sql: string, params?: Record<string, unknown>) => { whereCalls.push({ sql, params }); return builder; },
    andWhere: (sql: string, params?: Record<string, unknown>) => { whereCalls.push({ sql, params }); return builder; },
    getCount: async () => 1, addSelect: () => builder, orderBy: () => builder,
    skip: () => builder, take: () => builder,
    getRawAndEntities: async () => ({ entities: [{ purchaseOrderId: 8 }], raw: [{ po_total: '91.00' }] }),
  };
  const pagedService = new PurchaseOrdersService({ getRepository: () => ({ createQueryBuilder: () => builder }) } as any, {} as any) as any;
  const result = await pagedService.findPage({ tenantId: 3, accessScope: 'LOCATION', assignedLocationIds: [9], userId: 1 }, 2, 20, 'Acme', 'draft');
  assert.equal(result.items[0].total, '91.00');
  assert.ok(whereCalls.some(call => call.params?.tenantId === 3));
  assert.ok(whereCalls.some(call => Array.isArray(call.params?.locationIds) && (call.params?.locationIds as number[])[0] === 9));
  assert.ok(whereCalls.some(call => call.params?.search === '%acme%' && call.sql.includes('supplier.supplierName')));
  assert.ok(whereCalls.some(call => call.params?.status === 'DRAFT'));
});

test('PO eligibility rejects contradictory client unit and enforces product, location, supplier and supplier-unit chain', async () => {
  const values = new Map<any, any>([
    [Product, { productId: 1 }], [ProductLocation, { productLocationId: 2 }],
    [ProductUnit, { productUnitId: 3, unitId: 4, conversionFactor: '12' }],
    [ProductSupplier, { productSupplierId: 5 }], [ProductSupplierUnit, { productSupplierUnitId: 6 }],
  ]);
  const manager: any = { getRepository: (entity: any) => ({ findOneBy: async () => values.get(entity) }) };
  await assert.rejects(() => service.resolvePurchasingContext(manager, 1, 3, 99, 8, 9, 10), (error: any) => error instanceof BadRequestException && /Unit does not match/.test(error.message));
  const result = await service.resolvePurchasingContext(manager, 1, 3, 4, 8, 9, 10);
  assert.equal(result.supplierUnit.productSupplierUnitId, 6);
});

test('PO approval validates the locked draft before changing only approval status and audit fields', async () => {
  const purchaseOrder: any = { purchaseOrderId: 12, tenantId: 3, locationId: 9, status: 'DRAFT', notes: 'unchanged' };
  const lines = [{ purchaseOrderLineId: 21 }];
  let validationCalled = false;
  const manager: any = {
    getRepository: (entity: any) => entity === PurchaseOrderLine
      ? { createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getMany: async () => lines }) }
      : entity === PurchaseOrder
        ? { save: async (value: any) => value }
        : {},
  };
  const approvalService = new PurchaseOrdersService({ transaction: (work: any) => work(manager) } as any, {} as any) as any;
  approvalService.lockPurchaseOrder = async () => purchaseOrder;
  approvalService.validateForApproval = async (_manager: any, order: any, lockedLines: any[]) => {
    validationCalled = order === purchaseOrder && lockedLines === lines;
  };

  const result = await approvalService.approve(12, { tenantId: 3, userId: 7, accessScope: 'LOCATION', assignedLocationIds: [9] });
  assert.equal(validationCalled, true);
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.approvedByUserId, 7);
  assert.ok(result.approvedAt instanceof Date);
  assert.equal(result.notes, 'unchanged');
});

test('PO approval rejects every non-draft lifecycle status before validation or save', async () => {
  for (const status of ['APPROVED', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED']) {
    let validated = false, saved = false;
    const manager: any = { getRepository: () => ({ save: async () => { saved = true; } }) };
    const approvalService = new PurchaseOrdersService({ transaction: (work: any) => work(manager) } as any, {} as any) as any;
    approvalService.lockPurchaseOrder = async () => ({ purchaseOrderId: 12, tenantId: 3, locationId: 9, status });
    approvalService.validateForApproval = async () => { validated = true; };
    await assert.rejects(() => approvalService.approve(12, { tenantId: 3, userId: 7, accessScope: 'TENANT', assignedLocationIds: [] }), BadRequestException);
    assert.equal(validated, false);
    assert.equal(saved, false);
  }
});

test('PO approval date validation rejects impossible calendar dates', () => {
  assert.equal(service.isDateOnly('2026-02-28'), true);
  assert.equal(service.isDateOnly('2026-02-30'), false);
  assert.equal(service.isDateOnly('not-a-date'), false);
});
