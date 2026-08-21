import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ProductSupplierUnit } from './product-supplier-unit.entity';
import { CreateProductSupplierUnitDto } from './dto/create-product-supplier-unit.dto';
import { UpdateProductSupplierUnitDto } from './dto/update-product-supplier-unit.dto';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';

@Injectable()
export class ProductSupplierUnitsService {
  constructor(
    @InjectRepository(ProductSupplierUnit)
    private readonly repo: Repository<ProductSupplierUnit>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number, productSupplierId?: number) {
    const query = this.repo
      .createQueryBuilder('supplierUnit')
      .innerJoinAndSelect('supplierUnit.productSupplier', 'supplierLink')
      .innerJoinAndSelect('supplierLink.product', 'product')
      .leftJoinAndSelect('supplierLink.supplier', 'supplier')
      .innerJoinAndSelect('supplierUnit.productUnit', 'productUnit')
      .leftJoinAndSelect('productUnit.unit', 'unit')
      .where('product.tenant_id = :tenantId', { tenantId })
      .orderBy('supplierUnit.is_default_purchase_unit', 'DESC')
      .addOrderBy('supplierUnit.product_supplier_unit_id', 'ASC');

    if (productSupplierId !== undefined) {
      query.andWhere(
        'supplierUnit.product_supplier_id = :productSupplierId',
        { productSupplierId },
      );
    }

    return query.getMany();
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo
      .createQueryBuilder('supplierUnit')
      .innerJoinAndSelect('supplierUnit.productSupplier', 'supplierLink')
      .innerJoinAndSelect('supplierLink.product', 'product')
      .leftJoinAndSelect('supplierLink.supplier', 'supplier')
      .innerJoinAndSelect('supplierUnit.productUnit', 'productUnit')
      .leftJoinAndSelect('productUnit.unit', 'unit')
      .where('supplierUnit.product_supplier_unit_id = :id', { id })
      .andWhere('product.tenant_id = :tenantId', { tenantId })
      .getOne();

    if (!row) {
      throw new NotFoundException('Supplier purchase unit not found.');
    }

    return row;
  }

  private async ensureDefaultPurchaseUnit(
    manager: EntityManager,
    productSupplierId: number,
  ) {
    const repository = manager.getRepository(ProductSupplierUnit);

    const defaultUnit = await repository.findOneBy({
      productSupplierId,
      isActive: true,
      isDefaultPurchaseUnit: true,
    });

    if (defaultUnit) return;

    const firstActiveUnit = await repository.findOne({
      where: { productSupplierId, isActive: true },
      order: { productSupplierUnitId: 'ASC' },
    });

    if (firstActiveUnit) {
      await repository.update(
        { productSupplierUnitId: firstActiveUnit.productSupplierUnitId },
        { isDefaultPurchaseUnit: true },
      );
    }
  }

  async create(dto: CreateProductSupplierUnitDto, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const supplierLink = await manager
        .getRepository(ProductSupplier)
        .findOne({
          where: {
            productSupplierId: dto.productSupplierId,
            product: { tenantId },
          } as any,
        });

      if (!supplierLink || !supplierLink.isActive) {
        throw new NotFoundException(
          'Active product supplier link not found for this tenant.',
        );
      }

      const productUnit = await manager.getRepository(ProductUnit).findOne({
        where: {
          productUnitId: dto.productUnitId,
          productId: supplierLink.productId,
          product: { tenantId },
          isActive: true,
          isPurchaseUnit: true,
        } as any,
      });

      if (!productUnit) {
        throw new NotFoundException(
          'Active purchase unit not found for this product.',
        );
      }

      const repository = manager.getRepository(ProductSupplierUnit);

      const existing = await repository.findOneBy({
        productSupplierId: supplierLink.productSupplierId,
        productUnitId: productUnit.productUnitId,
      });

      if (existing?.isActive) {
        throw new ConflictException(
          'This supplier already has this purchase unit for the product.',
        );
      }

      const activeCount = await repository.countBy({
        productSupplierId: supplierLink.productSupplierId,
        isActive: true,
      });

      const shouldBeDefault =
        dto.isDefaultPurchaseUnit === true || activeCount === 0;

      if (shouldBeDefault) {
        await repository.update(
          {
            productSupplierId: supplierLink.productSupplierId,
            isActive: true,
          },
          { isDefaultPurchaseUnit: false },
        );
      }

      const row =
        existing ??
        repository.create({
          productSupplierId: supplierLink.productSupplierId,
          productUnitId: productUnit.productUnitId,
        });

      Object.assign(row, {
        productSupplierId: supplierLink.productSupplierId,
        productUnitId: productUnit.productUnitId,
        supplierProductCode:
          dto.supplierProductCode ?? row.supplierProductCode ?? null,
        minimumOrderQty: String(dto.minimumOrderQty ?? 1),
        leadTimeDays:
          dto.leadTimeDays !== undefined
            ? dto.leadTimeDays
            : row.leadTimeDays ?? null,
        isDefaultPurchaseUnit: shouldBeDefault,
        isActive: true,
      });

      const saved = await repository.save(row);

      await this.ensureDefaultPurchaseUnit(
        manager,
        saved.productSupplierId,
      );

      return saved;
    });
  }

  async update(
    id: number,
    dto: UpdateProductSupplierUnitDto,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.findOne(id, tenantId);
      const repository = manager.getRepository(ProductSupplierUnit);

      if (dto.isDefaultPurchaseUnit === true) {
        await repository.update(
          {
            productSupplierId: current.productSupplierId,
            isActive: true,
          },
          { isDefaultPurchaseUnit: false },
        );
      }

      Object.assign(current, {
        supplierProductCode:
          dto.supplierProductCode !== undefined
            ? dto.supplierProductCode
            : current.supplierProductCode,
        minimumOrderQty:
          dto.minimumOrderQty !== undefined
            ? String(dto.minimumOrderQty ?? 1)
            : current.minimumOrderQty ?? "1",
        leadTimeDays:
          dto.leadTimeDays !== undefined
            ? dto.leadTimeDays
            : current.leadTimeDays,
        isDefaultPurchaseUnit:
          dto.isDefaultPurchaseUnit ?? current.isDefaultPurchaseUnit,
      });

      await repository.save(current);

      await this.ensureDefaultPurchaseUnit(
        manager,
        current.productSupplierId,
      );

      return this.findOne(id, tenantId);
    });
  }

  async deactivate(id: number, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.findOne(id, tenantId);

      await manager.getRepository(ProductSupplierUnit).update(
        { productSupplierUnitId: current.productSupplierUnitId },
        {
          isActive: false,
          isDefaultPurchaseUnit: false,
        },
      );

      await this.ensureDefaultPurchaseUnit(
        manager,
        current.productSupplierId,
      );

      return this.findOne(id, tenantId);
    });
  }

  async activate(id: number, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.findOne(id, tenantId);
      if (!current.productSupplier.isActive) throw new BadRequestException('Activate the Product Supplier before activating its purchase unit.');
      if (!current.productUnit.isActive || !current.productUnit.isPurchaseUnit) throw new BadRequestException('The Product Unit must be active and purchase-enabled.');

      await manager.getRepository(ProductSupplierUnit).update(
        { productSupplierUnitId: current.productSupplierUnitId },
        { isActive: true },
      );

      await this.ensureDefaultPurchaseUnit(
        manager,
        current.productSupplierId,
      );

      return this.findOne(id, tenantId);
    });
  }
}
