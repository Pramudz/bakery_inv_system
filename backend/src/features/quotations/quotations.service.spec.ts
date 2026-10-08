import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { TenantPrincipal } from '../auth/auth.types';
import { Customer } from '../customers/customers.entity';
import { Location } from '../locations/locations.entity';
import { Product } from '../products/products.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { Quotation } from './quotation.entity';
import { QuotationLine } from './quotation-line.entity';
import { QuotationsService } from './quotations.service';
import { businessDateAt } from '../../common/business-date';

const user = { tenantId: 1, userId: 4, roleCode: 'TENANT_ADMIN', accessScope: 'LOCATION', assignedLocationIds: [3] } as TenantPrincipal;
const input = { locationId: 3, customerId: 8, quotationDate: '2026-10-06', validUntil: '2026-10-13', quotationType: 'RETAIL' as const, lines: [{ productId: 10, quantity: 2 }] };

function fixture() {
  let saved: any = null;
  let sequenceCalls = 0;
  let lineWrites = 0;
  let inventoryTouches = 0;
  const repo = {
    create: (row: any) => row,
    save: async (row: any) => { saved = { quotationId: 51, ...saved, ...row }; return saved; },
    findOne: async ({ where }: any) => Number(where.tenantId) === 1 && Number(where.quotationId) === 51 ? saved : null,
  };
  const manager: any = { getRepository(entity: unknown) {
    if (entity === Tenant) return { findOneBy: async () => ({ tenantId: 1, timeZone: 'Asia/Colombo' }) };
    if (entity === Location) return { findOneBy: async () => ({ locationId: 3, tenantId: 1, code: 'ANU', name: 'Anuradhapura' }) };
    if (entity === Customer) return { findOneBy: async () => ({ customerId: 8, tenantId: 1, customerCode: 'CUS-8', customerName: 'Sweet Delights Bakery', phone: '0771234567', email: null, addressLine1: 'Main Street', addressLine2: null, city: 'Anuradhapura' }) };
    if (entity === Product) return { findOne: async () => ({ productId: 10, tenantId: 1, sku: 'CB-001', productName: 'Cake Box', baseUnitId: 7, baseUnit: { unitId: 7, code: 'EA', name: 'Each' } }) };
    if (entity === UnitOfMeasure) return { findOneBy: async () => ({ unitId: 7 }) };
    if (entity === Quotation) return repo;
    if (entity === QuotationLine) return { create: (row: any) => row, save: async () => { lineWrites++; }, delete: async () => {} };
    inventoryTouches++; throw new Error('Quotation must not touch inventory or payments');
  } };
  const dataSource: any = { manager, transaction: async (callback: any) => callback(manager), getRepository: (entity: unknown) => manager.getRepository(entity) };
  const pricing: any = { quoteWithManager: async () => ({ subtotal: 300, discountTotal: 30, grandTotal: 270, lines: [{ productId: 10, quantity: 2, unitPrice: 150, discountPercentage: 10, discountAmount: 30, grossTotal: 300, netTotal: 270 }] }) };
  const sequences: any = { getTenantNextNumber: async (_manager: any, tenant: number, key: string, year: string) => { assert.equal(tenant, 1); assert.equal(key, NumberSequenceKeys.SALES_QUOTATION); assert.equal(year, businessDateAt(new Date(), 'Asia/Colombo').slice(0,4)); sequenceCalls++; return 1; } };
  const service = new QuotationsService(dataSource, pricing, sequences, {} as any);
  return { service, manager, get saved() { return saved; }, get sequenceCalls() { return sequenceCalls; }, get lineWrites() { return lineWrites; }, get inventoryTouches() { return inventoryTouches; } };
}

test('draft save numbers once, snapshots customer and product, and has no inventory impact', async () => {
  const f = fixture();
  const first = await (f.service as any).saveDraft(f.manager, null, input, user);
  assert.match(first.quotationNumber, /^QUO-1-\d{4}-000001$/);
  assert.equal(first.customerNameSnapshot, 'Sweet Delights Bakery');
  assert.equal(first.locationNameSnapshot, 'Anuradhapura');
  assert.equal(first.grandTotal, '270.00');
  assert.equal(f.lineWrites, 1);
  assert.equal(f.inventoryTouches, 0);
  await (f.service as any).saveDraft(f.manager, first, { ...input, lines: [{ productId: 10, quantity: 3 }] }, user);
  assert.equal(f.saved.quotationNumber, first.quotationNumber);
  assert.equal(f.sequenceCalls, 1);
});

test('quotation save rejects a location outside the user scope before numbering', async () => {
  const f = fixture();
  await assert.rejects((f.service as any).saveDraft(f.manager, null, { ...input, locationId: 99 }, user), /access to this location/i);
  assert.equal(f.sequenceCalls, 0);
});

test('quotation save rejects duplicate lines and reversed dates', async () => {
  const f = fixture();
  await assert.rejects((f.service as any).saveDraft(f.manager, null, { ...input, lines: [input.lines[0], input.lines[0]] }, user), /duplicate/i);
  await assert.rejects((f.service as any).saveDraft(f.manager, null, { ...input, validUntil: '2026-10-05' }, user), /valid until/i);
});

test('lifecycle permits draft to sent to accepted and locks further transitions', async () => {
  const f = fixture();
  const quote = await (f.service as any).saveDraft(f.manager, null, input, user);
  (f.service as any).get = async () => quote;
  await f.service.transition(51, 'send', user);
  assert.equal(quote.status, 'SENT');
  f.saved.validUntil = '2099-01-01';
  await f.service.transition(51, 'accept', user);
  assert.equal(f.saved.status, 'ACCEPTED');
  await assert.rejects(f.service.transition(51, 'accept', user), /cannot accept/i);
  await assert.rejects(f.service.transition(51, 'cancel', user), /cannot cancel/i);
  assert.equal(f.inventoryTouches, 0);
});

test('expired sent quotation cannot be accepted', async () => {
  const f = fixture();
  const quote = await (f.service as any).saveDraft(f.manager, null, input, user);
  quote.status = 'SENT'; quote.validUntil = '2020-01-01';
  await assert.rejects(f.service.transition(51, 'accept', user), /expired/i);
  assert.equal(quote.status, 'SENT');
});
