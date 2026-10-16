import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ConflictException, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import applicationDataSource from '../../data-source';
import { Category } from '../categories/categories.entity';
import { Customer } from '../customers/customers.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Location, LocationType } from '../locations/locations.entity';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PriceListItemDiscountService } from '../price-list-item-discounts/price-list-item-discounts.service';
import { PriceListItemDiscount } from '../price-list-item-discounts/price-list-item-discounts.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { Tenant } from '../tenants/tenant.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { Permission } from '../permissions/permissions.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { User } from '../users/user.entity';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Invoice } from './invoice.entity';
import { InvoicesService } from './invoices.service';
import { PosPricingService } from './pos-pricing.service';
import { InvoiceRefundsService } from '../invoice-refunds/invoice-refunds.service';
import { InvoiceRefundDetail } from '../invoice-refunds/invoice-refund-detail.entity';
import { InvoiceRefund } from '../invoice-refunds/invoice-refund.entity';
import { PosPrintService } from '../pos-print/pos-print.service';
import { PosPrintJob } from '../pos-print/pos-print-job.entity';
import { PosPrintDocumentController } from '../pos-print/pos-print.controller';
import { InvoicesController } from './invoices.controller';
import { PosCostVisibilityInterceptor } from './pos-cost-visibility.interceptor';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { ReportsService } from '../reports/reports.service';

test('concurrent committed checkout retries create one invoice, payment and stock deduction', async () => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local database required');
  assert.equal(process.env.DB_DATABASE, 'dev_erp_product_import_test', 'Only the authorized disposable database may be used');
  const dataSource = await applicationDataSource.initialize();
  try {
    const [{ db, version }] = await dataSource.query('SELECT DATABASE() AS db, VERSION() AS version');
    assert.equal(db, 'dev_erp_product_import_test');
    assert.match(version, /^8\./, 'MySQL 8 is required');
    const suffix = randomUUID().slice(0, 8);
    const tenant = await dataSource.getRepository(Tenant).save(dataSource.getRepository(Tenant).create({ code: `T-${suffix}`, name: 'Checkout test tenant', isActive: true }));
    const billPermission = await dataSource.getRepository(Permission).findOneByOrFail({ code: 'SALES_BILL_DISCOUNT_APPLY', isActive: true });
    await dataSource.getRepository(TenantModule).save(dataSource.getRepository(TenantModule).create({ tenantId: tenant.tenantId, moduleId: billPermission.moduleId, isEnabled: true }));
    const location = await dataSource.getRepository(Location).save(dataSource.getRepository(Location).create({ tenantId: tenant.tenantId, code: `L-${suffix}`, name: 'Checkout test location', locationType: LocationType.STORE, isActive: true }));
    const userRow = await dataSource.getRepository(User).save(dataSource.getRepository(User).create({ tenantId: tenant.tenantId, username: `checkout-${suffix}`, passwordHash: 'not-used', isActive: true }));
    const category = await dataSource.getRepository(Category).save(dataSource.getRepository(Category).create({ tenantId: tenant.tenantId, categoryCode: `C-${suffix}`, categoryName: 'Checkout test category', isActive: true }));
    const unit = await dataSource.getRepository(UnitOfMeasure).save(dataSource.getRepository(UnitOfMeasure).create({ tenantId: tenant.tenantId, code: `EA-${suffix}`, name: 'Each', symbol: 'ea', unitType: 'COUNT', allowsDecimalQuantity: false, quantityPrecision: 0, isActive: true }));
    const product = await dataSource.getRepository(Product).save(dataSource.getRepository(Product).create({ tenantId: tenant.tenantId, sku: `P-${suffix}`, productName: 'Concurrent checkout product', productType: 'STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId, isActive: true, isSellable: true, isPurchasable: false, isStockItem: true, trackBatch: false, trackExpiry: false, trackSerial: false }));
    const productUnit = await dataSource.getRepository(ProductUnit).save(dataSource.getRepository(ProductUnit).create({ productId: product.productId, unitId: unit.unitId, conversionFactor: '1', isBaseUnit: true, isPurchaseUnit: false, isSalesUnit: true, isActive: true }));
    await dataSource.getRepository(ProductLocation).save(dataSource.getRepository(ProductLocation).create({ productId: product.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false }));
    await dataSource.getRepository(InventoryBalance).save(dataSource.getRepository(InventoryBalance).create({ tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId, quantityOnHand: '10', averageCost: '3', lastMovementAt: null }));
    const priceList = await dataSource.getRepository(PriceList).save(dataSource.getRepository(PriceList).create({ tenantId: tenant.tenantId, code: `R-${suffix}`, name: 'Retail', priceListType: 'RETAIL', currencyCode: 'LKR', isDefault: true, isActive: true }));
    const priceItem = await dataSource.getRepository(PriceListItem).save(dataSource.getRepository(PriceListItem).create({ tenantId: tenant.tenantId, priceListId: priceList.priceListId, productId: product.productId, unitId: unit.unitId, productUnitId: productUnit.productUnitId, sellingPrice: '10', currencyCode: 'LKR', minimumQuantity: '1', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, isActive: true }));
    const paymentMethod = await dataSource.getRepository(PaymentMethod).save(dataSource.getRepository(PaymentMethod).create({ tenantId: tenant.tenantId, paymentMethodName: 'Cash', paymentMethodType: PaymentMethodType.CASH, isActive: true }));

    const discounts = new PriceListItemDiscountService(dataSource.getRepository(PriceListItemDiscount), dataSource);
    const legacyTestSession: any = {
      terminal: { posTerminalId: null },
      registerSession: { posRegisterSessionId: null },
      cashierSession: { posCashierSessionId: null, cashierUserId: userRow.userId },
      config: { registerMode: 'MASTER_REGISTER' }, register: { receiptCode: 'TEST' },
    };
    const service = new InvoicesService(dataSource, new PosPricingService(dataSource, discounts), { requireCashierSession: async () => legacyTestSession } as any);
    const user = { tenantId: Number(tenant.tenantId), userId: Number(userRow.userId), roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] } as unknown as TenantPrincipal;
    const quote = await service.quote({ locationId: Number(location.locationId), saleType: 'RETAIL', details: [{ productId: Number(product.productId), quantity: 2 }] }, user);
    assert.equal(quote.lines[0].priceListItemId, Number(priceItem.priceListItemId));
    const checkoutKey = randomUUID();
    const request = {
      checkoutKey,
      locationId: Number(location.locationId),
      saleType: 'RETAIL',
      details: [{
        productId: Number(product.productId), quantity: 2,
        quotedPriceListItemId: quote.lines[0].priceListItemId,
        quotedPriceListItemDiscountId: quote.lines[0].priceListItemDiscountId ?? undefined,
        quotedUnitPrice: quote.lines[0].unitPrice,
        quotedDiscountAmount: quote.lines[0].discountAmount,
      }],
      payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 20 }],
    } as const;

    const [first, concurrentRetry] = await Promise.all([service.create(request as any, user), service.create(request as any, user)]);
    const committedRetry = await service.create(request as any, user);
    assert.equal(String(concurrentRetry.invoiceId), String(first.invoiceId));
    assert.equal(String(committedRetry.invoiceId), String(first.invoiceId));
    assert.equal(concurrentRetry.invoiceNumber, first.invoiceNumber);
    assert.equal(await dataSource.getRepository(Invoice).countBy({ tenantId: tenant.tenantId, checkoutKey }), 1);
    assert.equal(await dataSource.getRepository(InvoiceDetail).countBy({ invoiceId: first.invoiceId }), 1);
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: first.invoiceId }), 1);
    assert.equal(await dataSource.getRepository(InventoryLedger).countBy({ sourceDocumentType: 'INVOICE', sourceDocumentId: first.invoiceId }), 1);
    const balance = await dataSource.getRepository(InventoryBalance).findOneByOrFail({ tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId });
    assert.equal(Number(balance.quantityOnHand), 8);
    await assert.rejects(service.create({ ...request, payments: [] } as any, user), ConflictException);

    const discounted = await service.create({ ...request, checkoutKey: randomUUID(), billDiscount: { type: 'PERCENTAGE', value: 10 }, payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 18 }] } as any, user);
    assert.equal(discounted.billDiscountTotal, '2.00');
    assert.equal(discounted.discountTotal, '2.00');
    assert.equal(discounted.grandTotal, '18.00');
    assert.equal(discounted.details[0].billDiscountAllocated, '2.00');
    assert.equal(discounted.details[0].netTotal, '18.00');
    assert.equal(discounted.details[0].cogsAmount, '6.0000');

    const zeroPayable = await service.create({ ...request, checkoutKey: randomUUID(), details: [{ ...request.details[0], quantity: 1 }], billDiscount: { type: 'PERCENTAGE', value: 100 }, payments: [] } as any, user);
    assert.equal(zeroPayable.grandTotal, '0.00');
    assert.equal(zeroPayable.paymentStatus, 'PAID');
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: zeroPayable.invoiceId }), 0);

    const remaining = await dataSource.getRepository(InventoryBalance).findOneByOrFail({ tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId });
    assert.equal(Number(remaining.quantityOnHand), 5);
    const lastUnit = { ...request, checkoutKey: randomUUID(), details: [{ ...request.details[0], quantity: 5 }], payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 50 }] };
    const competing = { ...lastUnit, checkoutKey: randomUUID() };
    const settled = await Promise.allSettled([service.create(lastUnit as any, user), service.create(competing as any, user)]);
    assert.equal(settled.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(settled.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await dataSource.getRepository(Invoice).countBy({ tenantId: tenant.tenantId }), 4);
    const finalBalance = await dataSource.getRepository(InventoryBalance).findOneByOrFail({ tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId });
    assert.equal(Number(finalBalance.quantityOnHand), 0);
    assert.equal(await dataSource.getRepository(InventoryLedger).countBy({ tenantId: tenant.tenantId, sourceDocumentType: 'INVOICE' }), 4);
    for (const key of [lastUnit.checkoutKey, competing.checkoutKey]) {
      assert.equal(await dataSource.getRepository(Invoice).countBy({ tenantId: tenant.tenantId, checkoutKey: key }),
        settled.some((result) => result.status === 'fulfilled' && result.value.checkoutKey === key) ? 1 : 0);
    }
    await assert.rejects(service.create({ ...request, billDiscount: { type: 'FIXED', value: 1 } } as any, user), ConflictException);

    const refundService = new InvoiceRefundsService(dataSource, {} as any);
    const discountedLine = discounted.details[0];
    const firstRefund = await refundService.create({ refundKey: randomUUID(), invoiceId: Number(discounted.invoiceId),
      reason: 'Disposable MySQL partial refund', details: [{ invoiceDetailId: Number(discountedLine.invoiceDetailId), quantity: 1 }], payments: [] }, user);
    const finalRefund = await refundService.create({ refundKey: randomUUID(), invoiceId: Number(discounted.invoiceId),
      reason: 'Disposable MySQL final refund', details: [{ invoiceDetailId: Number(discountedLine.invoiceDetailId), quantity: 1 }], payments: [] }, user);
    assert.ok(firstRefund && finalRefund);
    const refundLines = await dataSource.getRepository(InvoiceRefundDetail).findBy({ invoiceDetailId: discountedLine.invoiceDetailId });
    assert.equal(refundLines.length, 2);
    assert.equal(refundLines.reduce((sum, row) => sum + Number(row.refundAmount), 0), 18);
    assert.equal(refundLines.reduce((sum, row) => sum + Number(row.billDiscountAllocated), 0), 2);
    assert.equal(Number(firstRefund.refundTotal) + Number(finalRefund.refundTotal), 18);
    assert.equal(await dataSource.getRepository(InvoiceRefund).countBy({ invoiceId: discounted.invoiceId }), 2);
    assert.equal((await dataSource.getRepository(Invoice).findOneByOrFail({ invoiceId: discounted.invoiceId })).invoiceStatus, 'FULLY_REFUNDED');
    assert.equal(Number((await dataSource.getRepository(InventoryBalance).findOneByOrFail({ tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId })).quantityOnHand), 2);

    const nonStock = await dataSource.getRepository(Product).save(dataSource.getRepository(Product).create({
      tenantId: tenant.tenantId, sku: `NS-${suffix}`, productName: 'Discount allocation test product',
      productType: 'NON_STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId,
      isActive: true, isSellable: true, isPurchasable: false, isStockItem: false,
      trackBatch: false, trackExpiry: false, trackSerial: false,
    }));
    const nonStockUnit = await dataSource.getRepository(ProductUnit).save(dataSource.getRepository(ProductUnit).create({
      productId: nonStock.productId, unitId: unit.unitId, conversionFactor: '1',
      isBaseUnit: true, isPurchaseUnit: false, isSalesUnit: true, isActive: true,
    }));
    await dataSource.getRepository(ProductLocation).save(dataSource.getRepository(ProductLocation).create({
      productId: nonStock.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false,
    }));
    await dataSource.getRepository(PriceListItem).save(dataSource.getRepository(PriceListItem).create({
      tenantId: tenant.tenantId, priceListId: priceList.priceListId, productId: nonStock.productId,
      unitId: unit.unitId, productUnitId: nonStockUnit.productUnitId, sellingPrice: '10', currencyCode: 'LKR',
      minimumQuantity: '1', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, isActive: true,
    }));
    const nonStockQuote = await service.quote({ locationId: Number(location.locationId), saleType: 'RETAIL',
      details: [{ productId: Number(nonStock.productId), quantity: 3 }] }, user);
    const nonStockLine = { productId: Number(nonStock.productId), quantity: 3,
      quotedPriceListItemId: nonStockQuote.lines[0].priceListItemId,
      quotedUnitPrice: nonStockQuote.lines[0].unitPrice, quotedDiscountAmount: nonStockQuote.lines[0].discountAmount };
    const roundingSale = await service.create({ ...request, checkoutKey: randomUUID(),
      details: [nonStockLine], billDiscount: { type: 'FIXED', value: 0.01 },
      payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 29.99 }] } as any, user);
    assert.equal(roundingSale.grandTotal, '29.99');
    assert.equal(roundingSale.details[0].billDiscountAllocated, '0.01');
    const refundAmounts: number[] = [];
    for (let index = 0; index < 3; index++) {
      const refund = await refundService.create({ refundKey: randomUUID(), invoiceId: Number(roundingSale.invoiceId),
        reason: 'Disposable MySQL rounding refund', details: [{ invoiceDetailId: Number(roundingSale.details[0].invoiceDetailId), quantity: 1 }],
        payments: [] }, user);
      assert.ok(refund);
      refundAmounts.push(Number(refund.refundTotal));
    }
    assert.deepEqual(refundAmounts, [10, 10, 9.99]);
    assert.equal(refundAmounts.reduce((sum, amount) => Math.round((sum + amount) * 100) / 100, 0), 29.99);

    const secondProduct = await dataSource.getRepository(Product).save(dataSource.getRepository(Product).create({
      tenantId: tenant.tenantId, sku: `NS2-${suffix}`, productName: 'Second allocation test product',
      productType: 'NON_STOCK', categoryId: category.categoryId, baseUnitId: unit.unitId,
      isActive: true, isSellable: true, isPurchasable: false, isStockItem: false,
      trackBatch: false, trackExpiry: false, trackSerial: false,
    }));
    const secondUnit = await dataSource.getRepository(ProductUnit).save(dataSource.getRepository(ProductUnit).create({
      productId: secondProduct.productId, unitId: unit.unitId, conversionFactor: '1',
      isBaseUnit: true, isPurchaseUnit: false, isSalesUnit: true, isActive: true,
    }));
    await dataSource.getRepository(ProductLocation).save(dataSource.getRepository(ProductLocation).create({
      productId: secondProduct.productId, locationId: location.locationId, isActive: true, isSellable: true, isPurchasable: false,
    }));
    await dataSource.getRepository(PriceListItem).save(dataSource.getRepository(PriceListItem).create({
      tenantId: tenant.tenantId, priceListId: priceList.priceListId, productId: secondProduct.productId,
      unitId: unit.unitId, productUnitId: secondUnit.productUnitId, sellingPrice: '7', currencyCode: 'LKR',
      minimumQuantity: '1', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, isActive: true,
    }));
    const itemInputs = [
      { productId: Number(nonStock.productId), quantity: 1, retailDiscount: { type: 'PERCENTAGE' as const, value: 10 } },
      { productId: Number(secondProduct.productId), quantity: 1 },
    ];
    const combinedQuote = await service.quote({ locationId: Number(location.locationId), saleType: 'RETAIL', details: itemInputs }, user);
    const combinedDetails = combinedQuote.lines.map((line, index) => ({ ...itemInputs[index],
      quotedPriceListItemId: line.priceListItemId, quotedUnitPrice: line.unitPrice,
      quotedDiscountAmount: line.discountAmount }));
    const combined = await service.create({ ...request, checkoutKey: randomUUID(), details: combinedDetails,
      billDiscount: { type: 'FIXED', value: 1 },
      payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 15 }] } as any, user);
    assert.equal(combined.subtotal, '17.00');
    assert.equal(combined.itemDiscountTotal, '1.00');
    assert.equal(combined.billDiscountTotal, '1.00');
    assert.equal(combined.discountTotal, '2.00');
    assert.equal(combined.grandTotal, '15.00');
    assert.equal(combined.details.reduce((sum, line) => sum + Number(line.billDiscountAllocated), 0), 1);
    assert.equal(combined.details.reduce((sum, line) => sum + Number(line.netTotal), 0), 15);
    assert.equal(combined.details.reduce((sum, line) => sum + Number(line.discountAmount), 0), 1);

    const wholesaleList = await dataSource.getRepository(PriceList).save(dataSource.getRepository(PriceList).create({
      tenantId: tenant.tenantId, code: `W-${suffix}`, name: 'Wholesale', priceListType: 'WHOLESALE',
      currencyCode: 'LKR', isDefault: true, isActive: true,
    }));
    await dataSource.getRepository(PriceListItem).save(dataSource.getRepository(PriceListItem).create({
      tenantId: tenant.tenantId, priceListId: wholesaleList.priceListId, productId: nonStock.productId,
      unitId: unit.unitId, productUnitId: nonStockUnit.productUnitId, sellingPrice: '8', currencyCode: 'LKR',
      minimumQuantity: '1', effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null, isActive: true,
    }));
    const wholesaleQuote = await service.quote({ locationId: Number(location.locationId), saleType: 'WHOLESALE',
      details: [{ productId: Number(nonStock.productId), quantity: 1 }] }, user);
    const wholesale = await service.create({ ...request, checkoutKey: randomUUID(), saleType: 'WHOLESALE',
      details: [{ productId: Number(nonStock.productId), quantity: 1,
        quotedPriceListItemId: wholesaleQuote.lines[0].priceListItemId,
        quotedUnitPrice: wholesaleQuote.lines[0].unitPrice, quotedDiscountAmount: wholesaleQuote.lines[0].discountAmount }],
      billDiscount: { type: 'PERCENTAGE', value: 12.5 },
      payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 7 }] } as any, user);
    assert.equal(wholesale.subtotal, '8.00');
    assert.equal(wholesale.billDiscountTotal, '1.00');
    assert.equal(wholesale.grandTotal, '7.00');

    const customer = await dataSource.getRepository(Customer).save(dataSource.getRepository(Customer).create({
      tenantId: tenant.tenantId, customerCode: `CUST-${suffix}`, customerName: 'Collection recovery customer', isActive: true,
    }));
    const creditRequest = { ...request, checkoutKey: randomUUID(), details: [{ ...nonStockLine, quantity: 1 }],
      customerId: Number(customer.customerId), sellOnCredit: true, billDiscount: { type: 'FIXED', value: 1 }, payments: [] };
    const credit = await service.create(creditRequest as any, user);
    assert.equal(credit.grandTotal, '9.00');
    assert.equal(credit.balanceAmount, '9.00');
    const collectionKey = randomUUID();
    const collectionRequest = { collectionKey, paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 9 };
    const [collected, collectionRetry] = await Promise.all([
      service.receivePayment(Number(credit.invoiceId), collectionRequest, user),
      service.receivePayment(Number(credit.invoiceId), collectionRequest, user),
    ]);
    assert.equal(String(collected.invoicePaymentId), String(collectionRetry.invoicePaymentId));
    assert.equal(collected.balanceBefore, '9.00');
    assert.equal(collected.balanceAfter, '0.00');
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: credit.invoiceId, collectionKey }), 1);
    await assert.rejects(service.receivePayment(Number(credit.invoiceId), { ...collectionRequest, amount: 8 }, user), ConflictException);
    const recovered = await service.collectionOutcome(Number(credit.invoiceId), collectionKey, user);
    assert.equal(String(recovered.invoicePaymentId), String(collected.invoicePaymentId));
    assert.equal(recovered.receiptSnapshot?.balanceBefore, '9.00');
    assert.equal((await service.collectionReceipt(Number(collected.invoicePaymentId), user)).receiptSnapshot?.balanceAfter, '0.00');
    await assert.rejects(service.collectionReceipt(Number(collected.invoicePaymentId), { ...user, accessScope: 'LOCATION', assignedLocationIds: [] }), /access to this location/i);

    const anotherCredit = await service.create({ ...creditRequest, checkoutKey: randomUUID() } as any, user);
    const competingCollections = await Promise.allSettled([
      service.receivePayment(Number(anotherCredit.invoiceId), { ...collectionRequest, collectionKey: randomUUID() }, user),
      service.receivePayment(Number(anotherCredit.invoiceId), { ...collectionRequest, collectionKey: randomUUID() }, user),
    ]);
    assert.equal(competingCollections.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(competingCollections.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: anotherCredit.invoiceId }), 1);
    assert.equal((await dataSource.getRepository(Invoice).findOneByOrFail({ invoiceId: anotherCredit.invoiceId })).balanceAmount, '0.00');

    const refundedLine = combined.details.find((line) => Number(line.productId) === Number(nonStock.productId))!;
    const refundRace = await Promise.allSettled([
      refundService.create({ refundKey: randomUUID(), invoiceId: Number(combined.invoiceId), reason: 'Refund race',
        details: [{ invoiceDetailId: Number(refundedLine.invoiceDetailId), quantity: 1 }], payments: [] }, user),
      refundService.create({ refundKey: randomUUID(), invoiceId: Number(combined.invoiceId), reason: 'Refund race',
        details: [{ invoiceDetailId: Number(refundedLine.invoiceDetailId), quantity: 1 }], payments: [] }, user),
    ]);
    assert.equal(refundRace.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(refundRace.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await dataSource.getRepository(InvoiceRefundDetail).countBy({ invoiceDetailId: refundedLine.invoiceDetailId }), 1);
    assert.ok(Number((await dataSource.getRepository(InvoiceRefundDetail).findOneByOrFail({ invoiceDetailId: refundedLine.invoiceDetailId })).refundAmount) <= Number(refundedLine.netTotal));

    const print = new PosPrintService(dataSource);
    assert.equal((await print.documentStatus('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user)).status, 'NOT_REQUESTED');
    await assert.rejects(print.requestPrint('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user), /printer/i);
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: credit.invoiceId }), 1);
    const profile = await print.configure({ locationId: Number(location.locationId), displayName: 'Disposable printer',
      transport: 'WINDOWS_QUEUE', target: 'Disposable Printer', paperWidth: 58, encoding: 'CP437',
      cutEnabled: true, isActive: true }, user);
    assert.ok(profile.agentToken);
    const [printJob, duplicatePrint] = await Promise.all([
      print.requestPrint('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user),
      print.requestPrint('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user),
    ]);
    assert.equal(String(printJob.jobId), String(duplicatePrint.jobId));
    assert.equal(await dataSource.getRepository(PosPrintJob).countBy({ tenantId: tenant.tenantId,
      documentType: 'PAYMENT_COLLECTION', sourceId: collected.invoicePaymentId }), 1);
    const claimed = await print.claim(Number(profile.profile.posPrintProfileId), profile.agentToken!);
    assert.ok(claimed);
    assert.equal(claimed.receipt.balanceAfter, '0.00');
    await print.complete(Number(profile.profile.posPrintProfileId), Number(printJob.jobId), profile.agentToken!, claimed.attempt, false, 'Injected printer failure');
    assert.equal((await print.documentStatus('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user)).status, 'FAILED');
    assert.equal((await print.requestPrint('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user)).jobId, printJob.jobId);
    const retried = await print.claim(Number(profile.profile.posPrintProfileId), profile.agentToken!);
    assert.ok(retried);
    await print.complete(Number(profile.profile.posPrintProfileId), Number(printJob.jobId), profile.agentToken!, retried.attempt, true);
    assert.equal((await print.documentStatus('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user)).status, 'PRINTED');
    assert.equal((await print.requestPrint('PAYMENT_COLLECTION', Number(collected.invoicePaymentId), user)).reprint, true);
    const [{ audits }] = await dataSource.query(`SELECT COUNT(*) AS audits FROM tbl_pos_receipt_reprint
      WHERE tenant_id = ? AND document_type = 'PAYMENT_COLLECTION' AND source_id = ?`, [tenant.tenantId, collected.invoicePaymentId]);
    assert.equal(Number(audits), 1);
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: credit.invoiceId }), 1);
    assert.equal((await print.requestPrint('SALE', Number(first.invoiceId), user)).status, 'PENDING');
    assert.equal((await print.requestPrint('REFUND', Number(firstRefund.invoiceRefundId), user)).status, 'PENDING');
    await assert.rejects(print.requestPrint('PAYMENT_COLLECTION', Number(collected.invoicePaymentId),
      { ...user, accessScope: 'LOCATION', assignedLocationIds: [] }), /access to this location/i);
    await dataSource.destroy();
    await dataSource.initialize();
    assert.equal((await dataSource.getRepository(Invoice).findOneByOrFail({ invoiceId: credit.invoiceId })).balanceAmount, '0.00');
    assert.equal(String((await service.receivePayment(Number(credit.invoiceId), collectionRequest, user)).invoicePaymentId), String(collected.invoicePaymentId));

    const sourceFailingSave = (entityToFail: unknown, message: string): any => {
      const wrap = (manager: any) => {
        const wrapped = Object.create(manager);
        wrapped.getRepository = (entity: unknown) => {
          const repository = manager.getRepository(entity as any);
          return entity === entityToFail ? new Proxy(repository, { get(target, property) {
            if (property === 'save') return async () => { throw new Error(message); };
            return Reflect.get(target, property);
          } }) : repository;
        };
        return wrapped;
      };
      return { manager: dataSource.manager, getRepository: dataSource.getRepository.bind(dataSource),
        transaction: (isolationOrWork: string | ((manager: any) => Promise<unknown>), work?: (manager: any) => Promise<unknown>) =>
          typeof isolationOrWork === 'string'
            ? dataSource.transaction(isolationOrWork as any, (manager) => work!(wrap(manager)))
            : dataSource.transaction((manager) => isolationOrWork(wrap(manager))),
      };
    };
    const failureKey = randomUUID();
    const failedRequest = { ...request, checkoutKey: failureKey, details: [{ ...request.details[0], quantity: 1 }],
      payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 10 }] };
    const stockBeforeFailure = Number((await dataSource.getRepository(InventoryBalance).findOneByOrFail({
      tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId,
    })).quantityOnHand);
    const failingSource = sourceFailingSave(InvoicePayment, 'Injected payment insertion failure');
    const failingService = new InvoicesService(failingSource, new PosPricingService(failingSource, discounts),
      { requireCashierSession: async () => legacyTestSession } as any);
    await assert.rejects(failingService.create(failedRequest as any, user), /Injected payment insertion failure/);
    assert.equal(await dataSource.getRepository(Invoice).countBy({ tenantId: tenant.tenantId, checkoutKey: failureKey }), 0);
    assert.equal(Number((await dataSource.getRepository(InventoryBalance).findOneByOrFail({
      tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId,
    })).quantityOnHand), stockBeforeFailure);
    const recoveredCheckout = await service.create(failedRequest as any, user);
    assert.equal(recoveredCheckout.grandTotal, '10.00');
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: recoveredCheckout.invoiceId }), 1);

    const collectionFailureInvoice = await service.create({ ...creditRequest, checkoutKey: randomUUID() } as any, user);
    const collectionFailureKey = randomUUID();
    const failingCollection = new InvoicesService(sourceFailingSave(Invoice, 'Injected collection finalization failure'),
      new PosPricingService(dataSource, discounts), { requireCashierSession: async () => legacyTestSession } as any);
    await assert.rejects(failingCollection.receivePayment(Number(collectionFailureInvoice.invoiceId),
      { ...collectionRequest, collectionKey: collectionFailureKey }, user), /Injected collection finalization failure/);
    assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: collectionFailureInvoice.invoiceId }), 0);
    assert.equal((await dataSource.getRepository(Invoice).findOneByOrFail({ invoiceId: collectionFailureInvoice.invoiceId })).balanceAmount, '9.00');
    assert.equal((await service.receivePayment(Number(collectionFailureInvoice.invoiceId),
      { ...collectionRequest, collectionKey: collectionFailureKey }, user)).balanceAfter, '0.00');

    const secondCombinedLine = combined.details.find((line) => Number(line.productId) === Number(secondProduct.productId))!;
    const refundFailureKey = randomUUID();
    const refundFailureInput = { refundKey: refundFailureKey, invoiceId: Number(combined.invoiceId),
      reason: 'Injected refund detail failure', details: [{ invoiceDetailId: Number(secondCombinedLine.invoiceDetailId), quantity: 1 }], payments: [] };
    const failingRefund = new InvoiceRefundsService(sourceFailingSave(InvoiceRefundDetail, 'Injected refund detail failure'), {} as any);
    await assert.rejects(failingRefund.create(refundFailureInput, user), /Injected refund detail failure/);
    assert.equal(await dataSource.getRepository(InvoiceRefund).countBy({ tenantId: tenant.tenantId, refundKey: refundFailureKey }), 0);
    assert.equal(await dataSource.getRepository(InvoiceRefundDetail).countBy({ invoiceDetailId: secondCombinedLine.invoiceDetailId }), 0);
    const postedRefund = await refundService.create(refundFailureInput, user);
    assert.ok(postedRefund);
    const recoveredRefund = await refundService.outcomeByKey(Number(combined.invoiceId), refundFailureKey, user);
    assert.equal(String(recoveredRefund.invoiceRefundId), String(postedRefund.invoiceRefundId));
    assert.equal(String((await refundService.create(refundFailureInput, user))?.invoiceRefundId), String(postedRefund.invoiceRefundId));
    await assert.rejects(refundService.create({ ...refundFailureInput, reason: 'Changed retry' }, user), ConflictException);
    assert.equal(await dataSource.getRepository(InvoiceRefund).countBy({ tenantId: tenant.tenantId, refundKey: refundFailureKey }), 1);

    const unauthorizedKey = randomUUID();
    await assert.rejects(service.create({ ...creditRequest, checkoutKey: unauthorizedKey } as any,
      { ...user, roleCode: 'CASHIER', roleId: -1 }), /SALES_BILL_DISCOUNT_APPLY/);
    assert.equal(await dataSource.getRepository(Invoice).countBy({ tenantId: tenant.tenantId, checkoutKey: unauthorizedKey }), 0);

    const token = randomUUID();
    const session = { userSessionId: 1, sessionTokenHash: createHash('sha256').update(token).digest('hex'),
      revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: {
        userId: user.userId, tenantId: user.tenantId, username: 'checkout-http-fixture', isActive: true,
        tenant: { isActive: true }, userRoles: [{ role: { roleId: 1, code: 'TENANT_ADMIN',
          isActive: true, accessScope: 'TENANT' } }], userLocations: [],
      } };
    @Module({ controllers: [InvoicesController, PosPrintDocumentController], providers: [
      { provide: InvoicesService, useValue: service }, { provide: PosPrintService, useValue: print },
      { provide: DataSource, useValue: dataSource },
      { provide: getRepositoryToken(UserSession), useValue: {
        findOne: async ({ where }: any) => where.sessionTokenHash === session.sessionTokenHash ? session : null,
        update: async () => ({ affected: 1 }),
      } },
      TenantAuthGuard, PermissionGuard, PosCostVisibilityInterceptor,
    ] })
    class CheckoutHttpTestModule {}
    const app = await NestFactory.create(CheckoutHttpTestModule, { logger: ['error'], abortOnError: false });
    try {
      app.setGlobalPrefix('api');
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/api`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const httpSaleKey = randomUUID();
      const httpSaleRequest = { ...creditRequest, checkoutKey: httpSaleKey, sellOnCredit: false,
        payments: [{ paymentMethodId: Number(paymentMethod.paymentMethodId), amount: 9 }] };
      const firstHttp = await fetch(`${base}/invoices`, { method: 'POST', headers, body: JSON.stringify(httpSaleRequest) });
      assert.equal(firstHttp.status, 201);
      await firstHttp.body?.cancel(); // Treat the committed response body as lost.
      const retryHttp = await fetch(`${base}/invoices`, { method: 'POST', headers, body: JSON.stringify(httpSaleRequest) });
      assert.equal(retryHttp.status, 201);
      const retriedSale = await retryHttp.json() as { invoiceId: number };
      assert.equal(await dataSource.getRepository(Invoice).countBy({ tenantId: tenant.tenantId, checkoutKey: httpSaleKey }), 1);
      assert.equal((await dataSource.getRepository(Invoice).findOneByOrFail({ invoiceId: retriedSale.invoiceId })).grandTotal, '9.00');

      const httpCreditResponse = await fetch(`${base}/invoices`, { method: 'POST', headers,
        body: JSON.stringify({ ...creditRequest, checkoutKey: randomUUID() }) });
      assert.equal(httpCreditResponse.status, 201);
      const httpCredit = await httpCreditResponse.json() as { invoiceId: number };
      const httpCollectionKey = randomUUID();
      const paymentUrl = `${base}/invoices/${httpCredit.invoiceId}/payments`;
      const paymentBody = JSON.stringify({ ...collectionRequest, collectionKey: httpCollectionKey });
      const paymentResponse = await fetch(paymentUrl, { method: 'POST', headers, body: paymentBody });
      assert.equal(paymentResponse.status, 201);
      await paymentResponse.body?.cancel(); // Simulate losing the committed collection response body.
      const outcomeResponse = await fetch(`${base}/invoices/${httpCredit.invoiceId}/payments/by-key/${httpCollectionKey}`, { headers });
      assert.equal(outcomeResponse.status, 200);
      const httpPayment = await outcomeResponse.json() as { invoicePaymentId: number };
      const paymentRetry = await fetch(paymentUrl, { method: 'POST', headers, body: paymentBody });
      assert.equal(paymentRetry.status, 201);
      assert.equal((await paymentRetry.json() as { invoicePaymentId: number }).invoicePaymentId, httpPayment.invoicePaymentId);
      const receiptUrl = `${base}/invoices/payment-receipts/${httpPayment.invoicePaymentId}`;
      const receiptResponse = await fetch(receiptUrl, { headers });
      assert.equal(receiptResponse.status, 200);
      assert.equal((await receiptResponse.json() as { receiptSnapshot: { balanceAfter: string } }).receiptSnapshot.balanceAfter, '0.00');
      const statusUrl = `${base}/pos-print/documents/PAYMENT_COLLECTION/${httpPayment.invoicePaymentId}/status`;
      assert.equal((await (await fetch(statusUrl, { headers })).json() as { status: string }).status, 'NOT_REQUESTED');
      const printResponse = await fetch(`${base}/pos-print/documents/PAYMENT_COLLECTION/${httpPayment.invoicePaymentId}/print`,
        { method: 'POST', headers });
      assert.equal(printResponse.status, 201);
      assert.equal((await printResponse.json() as { status: string }).status, 'PENDING');
      assert.equal((await (await fetch(statusUrl, { headers })).json() as { status: string }).status, 'PENDING');
      assert.equal(await dataSource.getRepository(InvoicePayment).countBy({ invoiceId: httpCredit.invoiceId }), 1);
    } finally {
      await app.close();
    }
    const finalStock = await dataSource.getRepository(InventoryBalance).findOneByOrFail({
      tenantId: tenant.tenantId, locationId: location.locationId, productId: product.productId,
    });
    assert.equal(Number(finalStock.quantityOnHand), 1);
    assert.equal(Number(finalStock.averageCost), 3, 'Selling discounts and refunds must not rewrite WAVG');
    const [{ netIssued }] = await dataSource.query(`SELECT SUM(quantity_out - quantity_in) AS netIssued
      FROM tbl_inventory_ledger WHERE tenant_id = ? AND location_id = ? AND product_id = ?`,
    [tenant.tenantId, location.locationId, product.productId]);
    assert.equal(Number(netIssued), 9);
    const [{ balanceMismatches }] = await dataSource.query(`SELECT COUNT(*) AS balanceMismatches FROM tbl_invoice
      WHERE tenant_id = ? AND ABS(grand_total - paid_amount - balance_amount) > 0.001`, [tenant.tenantId]);
    assert.equal(Number(balanceMismatches), 0);
    const [{ wholesaleCount }] = await dataSource.query(`SELECT COUNT(*) AS wholesaleCount FROM tbl_invoice
      WHERE tenant_id = ? AND sale_type = 'WHOLESALE'`, [tenant.tenantId]);
    assert.ok(Number(wholesaleCount) > 0);
    const reports = new ReportsService(dataSource, {} as never);
    const reportFilters = { from: '2020-01-01', to: '2030-12-31', view: 'SUMMARY', granularity: 'AGGREGATED' };
    const saleSummary = (await reports.run('sales-analysis', reportFilters, user)).rows[0];
    const productRows = (await reports.run('sales-analysis', { ...reportFilters, groupBy: 'product', all: '1' }, user)).rows;
    const sum = (field: string) => productRows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
    for (const field of ['grossSales', 'itemDiscount', 'billDiscount', 'refundValue', 'netSales'])
      assert.ok(Math.abs(sum(field) - Number(saleSummary[field])) < 0.001, `${field} report mismatch`);
    assert.ok(Number(saleSummary.billDiscount) > 0);
    assert.ok(Number(saleSummary.refundValue) > 0);
  } finally {
    await dataSource.destroy();
  }
});
