import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './dto/create-products.dto';
import { UpdateProductDto } from './dto/update-products.dto';
import { CreateProductSupplierPriceDto } from '../product-supplier-prices/dto/create-product-supplier-price.dto';
import { ProductService } from './products.service';

const price = {
  priceListId: 1,
  unitId: 1,
  sellingPrice: 250,
  effectiveFrom: '2026-08-21',
};

test('Product Create accepts one optional nested initial discount per price row', async () => {
  const dto = plainToInstance(CreateProductDto, {
    productName: 'Discounted product', categoryId: 1, baseUnitId: 1,
    prices: [{ ...price, discount: { discountType: 'PERCENTAGE', discountValue: '10.00', effectiveFrom: '2026-08-21' } }],
  });
  assert.equal((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length, 0);
});

test('Product Create keeps discount optional', async () => {
  const dto = plainToInstance(CreateProductDto, {
    productName: 'Full price product', categoryId: 1, baseUnitId: 1, prices: [price],
  });
  assert.equal((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length, 0);
});

test('Product Update price rows reject nested discount data', async () => {
  const dto = plainToInstance(UpdateProductDto, {
    prices: [{ ...price, discount: { discountType: 'PERCENTAGE', discountValue: '10.00', effectiveFrom: '2026-08-21' } }],
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  const nested = errors.find((error) => error.property === 'prices')?.children?.[0]?.children ?? [];
  assert.ok(nested.some((error) => error.property === 'discount'));
});

test('nested Product Create supplier price may omit effectiveFrom', async () => {
  const dto = plainToInstance(CreateProductDto, {
    productName: 'Purchasable product', categoryId: 1, baseUnitId: 1,
    supplierLinks: [{ supplierId: 2, units: [{ unitId: 1, prices: [{ purchasePrice: 100, currencyCode: 'LKR' }] }] }],
  });
  assert.equal((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length, 0);
});

test('standalone supplier-price API still requires effectiveFrom', async () => {
  const dto = plainToInstance(CreateProductSupplierPriceDto, { productSupplierUnitId: 1, purchasePrice: 100 });
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === 'effectiveFrom'));
});

test('Product Create replaces a contradictory client supplier date with the server business date', () => {
  const service = new ProductService({} as any, {} as any, {} as any, {} as any);
  const links: any[] = [{ supplierId: 2, units: [{ unitId: 1, prices: [{ purchasePrice: 100, effectiveFrom: '2026-08-21' }] }] }];
  const normalized = (service as any).withInitialSupplierBusinessDate(links, '2026-08-22');
  assert.equal(normalized[0].units[0].prices[0].effectiveFrom, '2026-08-22');
  assert.equal(links[0].units[0].prices[0].effectiveFrom, '2026-08-21');
});
