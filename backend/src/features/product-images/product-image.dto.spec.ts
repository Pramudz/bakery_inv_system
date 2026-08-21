import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddProductImageDto } from './dto/product-image.dto';
import { CreateProductDto } from '../products/dto/create-products.dto';

test('product image accepts HTTP image URLs and rejects malformed URLs', async () => {
  const valid = plainToInstance(AddProductImageDto, {
    imageUrl: 'https://cdn.example.com/products/cake.webp',
    displayOrder: 0,
    isPrimary: true,
  });
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(AddProductImageDto, {
    imageUrl: 'not-an-image-url',
  });
  assert.ok((await validate(invalid)).some((error) => error.property === 'imageUrl'));
});

test('product image DTO does not accept tenant or product ownership fields', async () => {
  const dto = plainToInstance(AddProductImageDto, {
    imageUrl: 'https://cdn.example.com/product.jpg',
    tenantId: 999,
    productId: 999,
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  assert.deepEqual(errors.map((error) => error.property).sort(), ['productId', 'tenantId']);
});

test('product DTO validation keeps images optional', async () => {
  const dto = plainToInstance(CreateProductDto, {
    productName: 'Image optional product',
    categoryId: 1,
    baseUnitId: 1,
  });
  assert.equal((await validate(dto)).length, 0);
});
