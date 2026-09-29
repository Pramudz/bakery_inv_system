import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
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
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { Permission } from '../permissions/permissions.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

const user = { tenantId: 1, userId: 2, roleId: 4, roleCode: 'TENANT_ADMIN', accessScope: 'LOCATION', assignedLocationIds: [3] } as unknown as TenantPrincipal;
const activePosSession: any = { terminal: { posTerminalId: 21 }, registerSession: { posRegisterSessionId: 22 }, cashierSession: { posCashierSessionId: 23 } };
const currentLine = {
  productId: 10, productUnitId: 20, priceListId: 30, priceListItemId: 40,
  priceListItemDiscountId: 50, discountType: 'PERCENTAGE', discountValue: '10.0000',
  quantity: 2, unitPrice: 100, discountPerUnit: 10, discountPercentage: 10,
  grossTotal: 200, discountAmount: 20, netTotal: 180, currencyCode: 'LKR',
};

function fixture(grantCredit = true) {
  let savedInvoice: any;
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
    if (entity === Invoice) return invoiceRepo;
    if (entity === InvoiceDetail) return detailRepo;
    if (entity === InvoicePayment) return { create: (value: any) => value, save: async (value: any) => value };
    if (entity === Product) return { findOneBy: async () => ({ productId: 10, tenantId: 1, isActive: true, isSellable: true, isStockItem: false }) };
    if (entity === PaymentMethod) return { findOneBy: async (where: any) => where.paymentMethodId === 1 ? { paymentMethodId: 1, tenantId: 1, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH, isActive: true } : null };
    if (entity === Permission) return { findOneBy: async () => ({ permissionId: 5, moduleId: 6, code: 'SALES_CREDIT_AUTHORIZE', isActive: true }) };
    if (entity === TenantModule) return { findOneBy: async () => ({ tenantId: 1, moduleId: 6, isEnabled: true }) };
    if (entity === RolePermission) return { findOneBy: async () => grantCredit ? ({ roleId: 4, permissionId: 5 }) : null };
    throw new Error(`Unexpected repository ${String(entity)}`);
  } };
  const dataSource: any = {
    getRepository(entity: unknown) {
      if (entity === Location) return { findOneBy: async () => ({ locationId: 3, tenantId: 1, isActive: true }) };
      if (entity === Customer) return { findOneBy: async (where: any) => Number(where.customerId) === 9 && Number(where.tenantId) === 1 ? { customerId: 9, tenantId: 1, isActive: true, customerName: 'Credit Customer' } : null };
      if (entity === Invoice) return invoiceRepo;
      throw new Error(`Unexpected outer repository ${String(entity)}`);
    },
    transaction: (work: any) => work(manager),
  };
  const pricing: any = { quoteWithManager: async () => ({ quotedAt: new Date().toISOString(), locationId: 3, saleType: 'RETAIL', priceList: { priceListId: 30 }, lines: [currentLine], subtotal: 200, discountTotal: 20, grandTotal: 180 }) };
  return { service: new InvoicesService(dataSource, pricing, { requireCashierSession: async () => activePosSession } as any), savedDetails };
}

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
