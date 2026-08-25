import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductUnit } from './product-units.entity';
import { CreateProductUnitDto } from './dto/create-product-units.dto';
import { UpdateProductUnitDto } from './dto/update-product-units.dto';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { assertProductOperationalReadiness } from '../products/product-operational-readiness';

@Injectable()
export class ProductUnitService {
  constructor(
    @InjectRepository(ProductUnit) private readonly repo: Repository<ProductUnit>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { product: { tenantId } } as any,
      order: { productUnitId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productUnitId: id, product: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('ProductUnit not found');
    return row;
  }

  async create(dto: CreateProductUnitDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(Product);
    const parent = await parentRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!parent) throw new NotFoundException('Product not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(UnitOfMeasure);
    const second = await secondRepo.findOne({ where: { unitId: (dto as any).unitId, tenantId } as any });
    if (!second) throw new NotFoundException('Unit not found for this tenant.');

    if (await this.repo.findOneBy({ productId: Number(dto.productId), unitId: Number(dto.unitId) }))
      throw new ConflictException('Unit is already configured for this product.');

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductUnitDto, tenantId: number) {
    return this.dataSource.transaction(async manager => {
    const current = await manager.getRepository(ProductUnit).findOne({ where: { productUnitId: id, product: { tenantId } } as any });
    if (!current) throw new NotFoundException('ProductUnit not found');
    if ((dto as any).productId !== undefined) {
      const parent = await manager.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).unitId !== undefined) {
      const second = await manager.getRepository(UnitOfMeasure).findOne({ where: { unitId: (dto as any).unitId, tenantId } as any });
      if (!second) throw new NotFoundException('Unit not found for this tenant.');
    }
    const repository = manager.getRepository(ProductUnit);
    const duplicate = await repository.findOneBy({
      productId: Number((dto as any).productId ?? current.productId),
      unitId: Number((dto as any).unitId ?? current.unitId),
    });
    if (duplicate && Number(duplicate.productUnitId) !== id)
      throw new ConflictException('Unit is already configured for this product.');
    await repository.update(id, dto as any);
    await assertProductOperationalReadiness(manager, current.productId, tenantId);
    return repository.findOneByOrFail({ productUnitId: id });
    });
  }

  async deactivate(id: number, tenantId: number) {
    return this.dataSource.transaction(async manager => {
      const current = await manager.getRepository(ProductUnit).findOne({ where: { productUnitId: id, product: { tenantId } } as any });
      if (!current) throw new NotFoundException('ProductUnit not found');
      await manager.getRepository(ProductUnit).update(id, { isActive: false } as any);
      await assertProductOperationalReadiness(manager, current.productId, tenantId);
      return manager.getRepository(ProductUnit).findOneByOrFail({ productUnitId: id });
    });
  }
}
