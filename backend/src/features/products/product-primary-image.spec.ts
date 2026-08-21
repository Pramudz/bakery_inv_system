import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductService } from './products.service';
import { Product } from './products.entity';
import { ProductImage } from '../product-images/product-image.entity';

test('selecting a primary image clears every other active image in the same transaction', async () => {
  const calls: string[] = [];
  const image: any = { productImageId: 2, productId: 4, tenantId: 8, isActive: true, isPrimary: false, imageUrl: 'https://example.com/a.png' };
  const imageRepo: any = {
    findOneBy: async () => image,
    update: async () => { calls.push('clear'); },
    save: async (value: any) => { calls.push('save'); return value; },
  };
  const manager: any = {
    getRepository: (entity: any) => entity === Product ? { findOneBy: async () => ({ productId: 4 }) } : entity === ProductImage ? imageRepo : {},
  };
  const service = new ProductService({} as any, { transaction: async (work: any) => work(manager) } as any, {} as any);
  const saved = await service.updateImage(4, 2, { isPrimary: true }, 8);
  assert.equal(saved.isPrimary, true);
  assert.deepEqual(calls, ['clear', 'save']);
});
