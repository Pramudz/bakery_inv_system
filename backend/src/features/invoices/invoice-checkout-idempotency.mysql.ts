import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import applicationDataSource from '../../data-source';
import { Category } from '../categories/categories.entity';
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
import { UnitOfMeasure } from '../units/units.entity';
import { User } from '../users/user.entity';
import { TenantPrincipal } from '../auth/auth.types';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { Invoice } from './invoice.entity';
import { InvoicesService } from './invoices.service';
import { PosPricingService } from './pos-pricing.service';

test('concurrent committed checkout retries create one invoice, payment and stock deduction', async () => {
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''), 'Local database required');
  assert.match(process.env.DB_DATABASE ?? '', /^bakery_inv_(baseline_)?test_/, 'A disposable sales test database is required');
  const dataSource = await applicationDataSource.initialize();
  try {
    const suffix = randomUUID().slice(0, 8);
    const tenant = await dataSource.getRepository(Tenant).save(dataSource.getRepository(Tenant).create({ code: `T-${suffix}`, name: 'Checkout test tenant', isActive: true }));
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
    const service = new InvoicesService(dataSource, new PosPricingService(dataSource, discounts));
    const user = { tenantId: Number(tenant.tenantId), userId: Number(userRow.userId), accessScope: 'TENANT', assignedLocationIds: [] } as unknown as TenantPrincipal;
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
  } finally {
    await dataSource.destroy();
  }
});
