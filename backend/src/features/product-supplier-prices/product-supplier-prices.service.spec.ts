import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ProductSupplierPricesService } from './product-supplier-prices.service';
import { ProductSupplierPrice } from './product-supplier-price.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';

test('overlapping supplier price is rejected with the required message', async () => {
  const priceRepo: any = {
    findBy: async () => [{ effectiveFrom: new Date('2026-01-01T00:00:00'), effectiveTo: null }],
  };
  const manager: any = {
    getRepository: (entity: any) => {
      if (entity === ProductSupplierUnit) {
        const builder: any = { innerJoinAndSelect: () => builder, where: () => builder, andWhere: () => builder, getOne: async () => ({ productSupplierUnitId: 12, productSupplierId: 4, productUnitId: 7 }) };
        return { createQueryBuilder: () => builder };
      }
      if (entity === ProductSupplierPrice) return priceRepo;
      return {};
    },
  };
  const service = new ProductSupplierPricesService(priceRepo, { transaction: async (work: any) => work(manager) } as any);
  await assert.rejects(
    () => service.create({ productSupplierUnitId: 12, purchasePrice: 10, effectiveFrom: '2026-08-01' }, 3),
    (error: any) => error instanceof BadRequestException && error.message === 'An active supplier price already exists for this supplier purchase unit, currency, and effective date range. End the existing price before adding the new one.',
  );
});
