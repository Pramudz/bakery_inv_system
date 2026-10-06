import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Customer } from '../customers/customers.entity';
import { Location } from '../locations/locations.entity';
import { Product } from '../products/products.entity';
import { TenantPrincipal } from '../auth/auth.types';
import { REQUIRE_PERMISSION } from '../auth/require-permission.decorator';
import { InvoiceRefundsController } from '../invoice-refunds/invoice-refunds.controller';
import { PaymentMethodsController } from '../payment-methods/payment-methods.controller';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Invoice } from './invoice.entity';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { Permission } from '../permissions/permissions.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { Quotation } from '../quotations/quotation.entity';
import { QuotationLine } from '../quotations/quotation-line.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';

const user = { tenantId: 1, userId: 2, roleId: 4, roleCode: 'TENANT_ADMIN', accessScope: 'LOCATION', assignedLocationIds: [3] } as unknown as TenantPrincipal;
const activePosSession: any = { terminal: { posTerminalId: 21, terminalCode: 'POS1' }, config: { registerMode: 'TERMINAL_REGISTER' }, register: { receiptCode: null }, registerSession: { posRegisterSessionId: 22 }, cashierSession: { posCashierSessionId: 23 } };
const currentLine = {
  productId: 10, productUnitId: 20, priceListId: 30, priceListItemId: 40,
  priceListItemDiscountId: 50, discountType: 'PERCENTAGE', discountValue: '10.0000',
  quantity: 2, unitPrice: 100, discountPerUnit: 10, discountPercentage: 10,
  grossTotal: 200, discountAmount: 20, netTotal: 180, currencyCode: 'LKR',
};

function fixture(grantCredit = true, fromQuotation = false, currentUnitPrice = 100) {
  let savedInvoice: any;
  let savedQuotation: any = fromQuotation ? { quotationId: 70, tenantId: 1, locationId: 3, customerId: 9, quotationNumber: 'QUO-1-2026-000001', locationNameSnapshot: 'Bandaragama', quotationType: 'RETAIL', status: 'ACCEPTED', subtotal: '200.00', discountTotal: '20.00', grandTotal: '180.00' } : null;
  let lastNumber = 0;
  const savedDetails: any[] = [];
  const invoiceRepo: any = {
    create: (value: any) => value,
    save: async (value: any) => {
      savedInvoice = { invoiceId: 7, ...savedInvoice, ...value };
      return savedInvoice;
    },
    update: async (_id: number, value: any) => Object.assign(savedInvoice, value),
    findOneBy: async (where: any) => savedInvoice && where.checkoutKey === savedInvoice.checkoutKey && Number(where.tenantId) === Number(savedInvoice.tenantId) ? savedInvoice : null,
    findOne: async () => ({ ...savedInvoice, customer: null, location: { locationId: 3 }, details: savedDetails, payments: [] }),
  };
  const detailRepo: any = {
    create: (value: any) => value,
    save: async (value: any) => {
      const row = { invoiceDetailId: savedDetails.length + 1, ...value, product: { productId: 10, sku: 'P10', productName: 'Bread', isStockItem: false } };
      savedDetails.push(row);
      return row;
    },
  };
  const manager: any = { getRepository(entity: unknown) {
    if (entity === Tenant) return { findOneBy: async () => ({ tenantId: 1, name: 'Test Bakery', timeZone: 'Asia/Colombo' }), findOneByOrFail: async () => ({ tenantId: 1, name: 'Test Bakery', timeZone: 'Asia/Colombo' }) };
    if (entity === Location) return { findOneByOrFail: async () => ({ locationId: 3, tenantId: 1, code: 'BANDA', name: 'Bandaragama', addressLine1: 'Main Road' }) };
    if (entity === User) return { findOneByOrFail: async () => ({ userId: 2, tenantId: 1, username: 'C17', firstName: 'Cashier' }) };
    if (entity === Invoice) return invoiceRepo;
    if (entity === InvoiceDetail) return detailRepo;
    if (entity === InvoicePayment) return { create: (value: any) => value, save: async (value: any) => value };
    if (entity === Quotation) return { findOne: async ({ where }: any) => savedQuotation && Number(where.quotationId) === 70 && Number(where.tenantId) === 1 ? savedQuotation : null, save: async (row: any) => { savedQuotation = row; return row; } };
    if (entity === QuotationLine) return { find: async () => [{ quotationId: 70, lineNumber: 1, productId: 10, unitId: 5, productCodeSnapshot: 'P10', quantity: '2.0000', unitPrice: '100.00', discountPercent: '10.0000', discountAmount: '20.00', grossTotal: '200.00', netTotal: '180.00' }] };
    if (entity === ProductLocation) return { findOneBy: async () => ({ productId: 10, locationId: 3, isActive: true, isSellable: true }) };
    if (entity === ProductUnit) return { findOneBy: async () => ({ productId: 10, unitId: 5, isActive: true, isBaseUnit: true, isSalesUnit: true }) };
    if (entity === Product) return { findOneBy: async () => ({ productId: 10, tenantId: 1, isActive: true, isSellable: true, isStockItem: false }) };
    if (entity === PaymentMethod) return { findOneBy: async (where: any) => where.paymentMethodId === 1 ? { paymentMethodId: 1, tenantId: 1, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH, isActive: true } : null };
    if (entity === Permission) return { findOneBy: async () => ({ permissionId: 5, moduleId: 6, code: 'SALES_CREDIT_AUTHORIZE', isActive: true }) };
    if (entity === TenantModule) return { findOneBy: async () => ({ tenantId: 1, moduleId: 6, isEnabled: true }) };
    if (entity === RolePermission) return { findOneBy: async () => grantCredit ? ({ roleId: 4, permissionId: 5 }) : null };
    throw new Error(`Unexpected repository ${String(entity)}`);
  }, query: async (statement: string, params: any[]) => {
    if (statement.includes('SELECT last_number')) return [{ last_number: lastNumber }];
    if (statement.includes('UPDATE tbl_pos_receipt_counter')) lastNumber = Number(params[0]);
    return [];
  } };
  const dataSource: any = {
    getRepository(entity: unknown) {
      if (entity === Location) return { findOneBy: async (where: any) => ({ locationId: where.locationId, tenantId: 1, isActive: true }) };
      if (entity === Customer) return { findOneBy: async (where: any) => (Number(where.customerId) === 9 || (fromQuotation && Number(where.customerId) === 8)) && Number(where.tenantId) === 1 ? { customerId: where.customerId, tenantId: 1, isActive: true, customerName: 'Credit Customer' } : null };
      if (entity === Invoice) return invoiceRepo;
      throw new Error(`Unexpected outer repository ${String(entity)}`);
    },
    transaction: (work: any) => work(manager),
  };
  let pricingCalls = 0;
  const pricing: any = { quoteWithManager: async () => {
    pricingCalls += 1;
    const line = { ...currentLine, unitPrice: currentUnitPrice, grossTotal: currentUnitPrice * 2, netTotal: currentUnitPrice * 2 - 20 };
    return { quotedAt: new Date().toISOString(), locationId: 3, saleType: 'RETAIL', priceList: { priceListId: 30 }, lines: [line], subtotal: line.grossTotal, discountTotal: 20, grandTotal: line.netTotal };
  } };
  return { service: new InvoicesService(dataSource, pricing, { requireCashierSession: async () => activePosSession } as any), savedDetails, get quotation() { return savedQuotation; }, get pricingCalls() { return pricingCalls; } };
}

test('checkout DTO accepts absent quotation price-list IDs but rejects zero', () => {
  const base = { checkoutKey: 'abcd1111-1111-4111-8111-111111111111', locationId: 3, saleType: 'RETAIL', details: [{ productId: 10, quantity: 2 }] };
  assert.equal(validateSync(plainToInstance(CreateInvoiceDto, { ...base, sourceQuotationId: 70 })).length, 0);
  assert.equal(validateSync(plainToInstance(CreateInvoiceDto, base)).length, 0);
  assert.ok(validateSync(plainToInstance(CreateInvoiceDto, { ...base, details: [{ ...base.details[0], quotedPriceListItemId: 0 }] })).length > 0);
});

test('accepted quotation converts through normal checkout and same key returns the same invoice', async () => {
  const f = fixture(true, true);
  const request: any = { checkoutKey: 'abcd1111-1111-4111-8111-111111111111', sourceQuotationId: 70, locationId: 3, customerId: 9, saleType: 'RETAIL', details: [{ productId: 10, quantity: 2, quotedUnitPrice: 100, quotedDiscountAmount: 20 }], payments: [{ paymentMethodId: 1, amount: 180 }] };
  const invoice = await f.service.create(request, user);
  assert.equal(invoice.sourceQuotationId, 70);
  assert.equal((invoice.receiptSnapshot as any).details[0].pricingSnapshot.priceListItemId, null);
  assert.equal(invoice.billNo, 1);
  assert.equal(f.quotation.status, 'CONVERTED');
  assert.equal(f.quotation.convertedInvoiceId, invoice.invoiceId);
  const replay = await f.service.create(request, user);
  assert.equal(replay.invoiceId, invoice.invoiceId);
  assert.equal(f.savedDetails.length, 1);
  await assert.rejects(f.service.create({ ...request, checkoutKey: 'abcd2222-2222-4222-8222-222222222222' }, user), /already been converted/i);
});

test('accepted quotation keeps its saved price when the current price list changes', async () => {
  const f = fixture(true, true, 230);
  const invoice = await f.service.create({
    checkoutKey: 'abcd1111-1111-4111-8111-111111111112', sourceQuotationId: 70,
    locationId: 3, customerId: 9, saleType: 'RETAIL',
    details: [{ productId: 10, quantity: 2, unitPrice: 100, discountAmount: 20, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [{ paymentMethodId: 1, amount: 180 }],
  }, user);
  assert.equal(invoice.grandTotal, '180.00');
  assert.equal(f.savedDetails[0].unitPrice, '100.00');
  assert.equal(f.pricingCalls, 0);
});

test('quotation conversion rejects location, customer, and line changes before invoice creation', async () => {
  const base: any = { checkoutKey: 'abcd3333-3333-4333-8333-333333333333', sourceQuotationId: 70, locationId: 3, customerId: 9, saleType: 'RETAIL', details: [{ productId: 10, quantity: 2, quotedUnitPrice: 100, quotedDiscountAmount: 20 }], payments: [{ paymentMethodId: 1, amount: 180 }] };
  await assert.rejects(fixture(true, true).service.create({ ...base, locationId: 4 }, { ...user, accessScope: 'TENANT', assignedLocationIds: [] }), /must be converted from that location/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, customerId: 8 }, user), /customer cannot be changed/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, details: [{ ...base.details[0], quantity: 3 }] }, user), /items and quantities cannot be changed/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, details: [{ ...base.details[0], productId: 11 }] }, user), /items and quantities cannot be changed/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, details: [{ ...base.details[0], quotedUnitPrice: 99 }] }, user), /prices cannot be changed/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, details: [{ ...base.details[0], unitPrice: 99 }] }, user), /prices cannot be changed/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, details: [{ ...base.details[0], quotedDiscountAmount: 19 }] }, user), /discounts cannot be changed/i);
  await assert.rejects(fixture(true, true).service.create({ ...base, details: [{ ...base.details[0], discountAmount: 19 }] }, user), /discounts cannot be changed/i);
});

test('normal POS requires a positive quoted price-list ID and accepts a current one', async () => {
  const base: any = { checkoutKey: 'abcd3333-3333-4333-8333-333333333334', locationId: 3, saleType: 'RETAIL', details: [{ productId: 10, quantity: 2, quotedUnitPrice: 100, quotedDiscountAmount: 20, quotedPriceListItemDiscountId: 50 }], payments: [{ paymentMethodId: 1, amount: 180 }] };
  await assert.rejects(fixture().service.create(base, user), /valid quoted price list item is required/i);
  await assert.rejects(fixture().service.create({ ...base, details: [{ ...base.details[0], quotedPriceListItemId: 0 }] }, user), /valid quoted price list item is required/i);
  const f = fixture();
  const invoice = await f.service.create({ ...base, details: [{ ...base.details[0], quotedPriceListItemId: 40 }] }, user);
  assert.equal(invoice.grandTotal, '180.00');
  assert.equal(f.pricingCalls, 1);
  await assert.rejects(f.service.create(base, user), /valid quoted price list item is required/i);
});

test('authorized partial credit finalization ignores tampered browser price and discount amounts', async () => {
  const { service, savedDetails } = fixture();
  const invoice = await service.create({
    checkoutKey: '11111111-1111-4111-8111-111111111111', locationId: 3, customerId: 9, saleType: 'RETAIL', sellOnCredit: true, acceptPriceChanges: false,
    details: [{ productId: 10, quantity: 2, unitPrice: 1, discountAmount: 199, quotedPriceListItemId: 40, quotedPriceListItemDiscountId: 50, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [],
  }, user);
  assert.equal(invoice.subtotal, '200.00');
  assert.equal(invoice.discountTotal, '20.00');
  assert.equal(invoice.grandTotal, '180.00');
  assert.equal(invoice.paidAmount, '0.00');
  assert.equal(invoice.balanceAmount, '180.00');
  assert.equal(invoice.paymentStatus, 'UNPAID');
  assert.equal(invoice.isCreditSale, true);
  assert.equal(invoice.creditAuthorizedByUserId, 2);
  assert.ok(invoice.creditAuthorizedAt instanceof Date);
  assert.equal(invoice.posTerminalId, 21);
  assert.equal(invoice.posRegisterSessionId, 22);
  assert.equal(invoice.posCashierSessionId, 23);
  assert.deepEqual((invoice.receiptSnapshot as any).payments, []);
  assert.equal(savedDetails[0].unitPrice, '100.00');
  assert.equal(savedDetails[0].discountAmount, '20.00');
  assert.equal((invoice.receiptSnapshot as any).details[0].pricingSnapshot.priceListItemId, 40);
});

test('changed pricing returns a structured conflict until the cashier accepts it', async () => {
  const { service } = fixture();
  const request: any = {
    checkoutKey: '22222222-2222-4222-8222-222222222222', locationId: 3, customerId: 9, saleType: 'RETAIL', sellOnCredit: true,
    details: [{ productId: 10, quantity: 2, quotedPriceListItemId: 39, quotedPriceListItemDiscountId: 49, quotedUnitPrice: 90, quotedDiscountAmount: 0 }],
    payments: [],
  };
  await assert.rejects(service.create(request, user), (error: any) => {
    assert.ok(error instanceof ConflictException);
    const response = error.getResponse() as any;
    assert.equal(response.code, 'PRICE_CHANGED');
    assert.equal(response.quote.grandTotal, 180);
    return true;
  });
  const accepted = await service.create({
    ...request,
    acceptPriceChanges: true,
    details: [{
      productId: 10,
      quantity: 2,
      quotedPriceListItemId: 40,
      quotedPriceListItemDiscountId: 50,
      quotedUnitPrice: 100,
      quotedDiscountAmount: 20,
    }],
  }, user);
  assert.equal(accepted.grandTotal, '180.00');
});

test('a committed checkout retry returns the original invoice without duplicate lines', async () => {
  const { service, savedDetails } = fixture();
  const request: any = {
    checkoutKey: '33333333-3333-4333-8333-333333333333', locationId: 3, customerId: 9, saleType: 'RETAIL', sellOnCredit: true,
    details: [{ productId: 10, quantity: 2, quotedPriceListItemId: 40, quotedPriceListItemDiscountId: 50, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [],
  };
  const first = await service.create(request, user);
  const retry = await service.create(request, user);
  assert.equal(retry.invoiceId, first.invoiceId);
  assert.equal(savedDetails.length, 1);
});

test('a fully paid anonymous sale remains the simple checkout path', async () => {
  const { service } = fixture();
  const invoice = await service.create({
    checkoutKey: '44444444-4444-4444-8444-444444444444', locationId: 3, saleType: 'RETAIL',
    details: [{ productId: 10, quantity: 2, quotedPriceListItemId: 40, quotedPriceListItemDiscountId: 50, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [{ paymentMethodId: 1, amount: 180 }],
  }, user);
  assert.equal(invoice.paymentStatus, 'PAID');
  assert.equal(invoice.customerId, null);
  assert.equal(invoice.isCreditSale, false);
  assert.equal(invoice.creditAuthorizedByUserId, null);
});

test('backend rejects accidental and anonymous debt even when UI is bypassed', async () => {
  const request: any = {
    checkoutKey: '55555555-5555-4555-8555-555555555555', locationId: 3, saleType: 'RETAIL',
    details: [{ productId: 10, quantity: 2, quotedPriceListItemId: 40, quotedPriceListItemDiscountId: 50, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [{ paymentMethodId: 1, amount: 30 }],
  };
  await assert.rejects(fixture().service.create(request, user), /sell on credit/i);
  await assert.rejects(fixture().service.create({ ...request, checkoutKey: '66666666-6666-4666-8666-666666666666', sellOnCredit: true }, user), /customer/i);
});

test('checkout is denied before invoice creation when the paired cashier session is unavailable', async () => {
  const f = fixture();
  (f.service as any).posSessions = { requireCashierSession: async () => { throw new ForbiddenException('An active cashier session is required.'); } };
  await assert.rejects(f.service.create({
    checkoutKey: '99999999-9999-4999-8999-999999999999', locationId: 3, saleType: 'RETAIL',
    details: [{ productId: 10, quantity: 2, quotedPriceListItemId: 40, quotedPriceListItemDiscountId: 50, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [{ paymentMethodId: 1, amount: 180 }],
  }, user), /active cashier session/i);
  assert.equal(f.savedDetails.length, 0);
});

test('credit sales require the dedicated permission for non-admin cashiers', async () => {
  const cashier = { ...user, roleCode: 'CASHIER' };
  const request: any = {
    checkoutKey: '77777777-7777-4777-8777-777777777777', locationId: 3, customerId: 9, saleType: 'RETAIL', sellOnCredit: true,
    details: [{ productId: 10, quantity: 2, quotedPriceListItemId: 40, quotedPriceListItemDiscountId: 50, quotedUnitPrice: 100, quotedDiscountAmount: 20 }],
    payments: [{ paymentMethodId: 1, amount: 30 }],
  };
  await assert.rejects(fixture(false).service.create(request, cashier), /SALES_CREDIT_AUTHORIZE/i);
  const authorized = await fixture(true).service.create({ ...request, checkoutKey: '88888888-8888-4888-8888-888888888888' }, cashier);
  assert.equal(authorized.balanceAmount, '150.00');
});

test('single invoice reads enforce the authenticated location scope', async () => {
  const repo = { findOne: async () => ({ invoiceId: 9, tenantId: 1, locationId: 8 }) };
  const service = new InvoicesService({ getRepository: () => repo } as any, {} as any, { requireCashierSession: async () => activePosSession } as any);
  await assert.rejects(service.get(9, user), ForbiddenException);
});

test('sales endpoints require the dedicated billing, history, collection and refund permissions', () => {
  const invoicePermissions = {
    list: 'SALES_INVOICE_VIEW', get: 'SALES_INVOICE_VIEW', billingLocations: 'SALES_BILLING',
    catalog: 'SALES_BILLING', quote: 'SALES_BILLING', create: 'SALES_BILLING',
    pendingPayments: 'SALES_PAYMENT_COLLECT', collectionHistory: 'SALES_PAYMENT_COLLECT', receivePayment: 'SALES_PAYMENT_COLLECT',
  } as const;
  for (const [method, permission] of Object.entries(invoicePermissions)) {
    assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, InvoicesController.prototype[method as keyof typeof invoicePermissions]), permission);
  }
  const refundPermissions = {
    list: 'SALES_REFUND_VIEW', get: 'SALES_REFUND_VIEW', refundable: 'SALES_REFUND_VIEW', create: 'SALES_REFUND_CREATE',
    listAdjustments: 'SALES_ADJUSTMENT_VIEW', createAdjustment: 'SALES_ADJUSTMENT_CREATE', reversePayment: 'SALES_PAYMENT_REVERSE',
  } as const;
  for (const [method, permission] of Object.entries(refundPermissions)) {
    assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, InvoiceRefundsController.prototype[method as keyof typeof refundPermissions]), permission);
  }
  assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, PaymentMethodsController.prototype.findAll), 'SALES_PAYMENT_METHOD_VIEW');
  assert.equal(Reflect.getMetadata(REQUIRE_PERMISSION, PaymentMethodsController.prototype.create), 'SALES_PAYMENT_METHOD_MANAGE');
});
