import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository , EntityManager } from 'typeorm';
import { ProductSupplierPrice } from './product-supplier-price.entity';
import { CreateProductSupplierPriceDto } from './dto/create-product-supplier-price.dto';
import { periodsOverlap, priceDateEnd, priceDateStart } from '../products/product-price-periods';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';

@Injectable()
export class ProductSupplierPricesService {
  constructor(
    @InjectRepository(ProductSupplierPrice) private readonly repo: Repository<ProductSupplierPrice>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { productSupplierUnit: { productSupplier: { product: { tenantId } } } } as any,
      relations: { productSupplierUnit: { productSupplier: { product: true, supplier: true }, productUnit: { unit: true } } },
      order: { productSupplierPriceId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productSupplierPriceId: id, productSupplierUnit: { productSupplier: { product: { tenantId } } } } as any,
      relations: { productSupplierUnit: { productSupplier: { product: true, supplier: true }, productUnit: { unit: true } } },
    });
    if (!row) throw new NotFoundException('Product supplier price not found');
    return row;
  }

    private async resolveSupplierUnit(
    manager: EntityManager,
    dto: CreateProductSupplierPriceDto,
    tenantId: number,
  ): Promise<ProductSupplierUnit> {
    const repository = manager.getRepository(ProductSupplierUnit);

    const query = repository
      .createQueryBuilder('supplierUnit')
      .innerJoinAndSelect('supplierUnit.productSupplier', 'supplierLink')
      .innerJoinAndSelect('supplierLink.product', 'product')
      .innerJoinAndSelect('supplierUnit.productUnit', 'productUnit')
      .where('product.tenant_id = :tenantId', { tenantId })
      .andWhere('supplierUnit.is_active = 1')
      .andWhere('supplierLink.is_active = 1')
      .andWhere('productUnit.is_active = 1');

    query.andWhere(
      'supplierUnit.product_supplier_unit_id = :productSupplierUnitId',
      { productSupplierUnitId: dto.productSupplierUnitId },
    );

    const supplierUnit = await query.getOne();

    if (!supplierUnit) {
      throw new NotFoundException(
        'Active supplier purchase unit not found for this tenant.',
      );
    }

    return supplierUnit;
  }

  async create(dto: CreateProductSupplierPriceDto, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const supplierUnit = await this.resolveSupplierUnit(
        manager,
        dto,
        tenantId,
      );

      const effectiveFrom = priceDateStart(dto.effectiveFrom);
      const effectiveTo = dto.effectiveTo
        ? priceDateEnd(dto.effectiveTo)
        : null;

      if (effectiveTo && effectiveTo < effectiveFrom) {
        throw new BadRequestException(
          'Supplier price effectiveTo must be after effectiveFrom.',
        );
      }

      const currencyCode = (dto.currencyCode ?? 'LKR').toUpperCase();
      const repository = manager.getRepository(ProductSupplierPrice);

      const existing = await repository.findBy({
        productSupplierUnitId: supplierUnit.productSupplierUnitId,
        currencyCode,
        minimumQuantity: '1',
        isActive: true,
      });

      if (
        existing.some((price) =>
          periodsOverlap(
            price.effectiveFrom,
            price.effectiveTo,
            effectiveFrom,
            effectiveTo,
          ),
        )
      ) {
        throw new BadRequestException(
          'An active supplier price already exists for this supplier purchase unit, currency, and effective date range. End the existing price before adding the new one.',
        );
      }

      return repository.save(
        repository.create({
          productSupplierUnitId: supplierUnit.productSupplierUnitId,
          purchasePrice: String(dto.purchasePrice),
          minimumQuantity: '1',
          effectiveFrom,
          effectiveTo,
          currencyCode,
          isActive: true,
        }),
      );
    });
  }
}
