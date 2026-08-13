import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductUnit } from './product-units.entity';
import { CreateProductUnitDto } from './dto/create-product-units.dto';
import { UpdateProductUnitDto } from './dto/update-product-units.dto';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';

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

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductUnitDto, tenantId: number) {
    await this.findOne(id, tenantId);
    if ((dto as any).productId !== undefined) {
      const parent = await this.dataSource.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).unitId !== undefined) {
      const second = await this.dataSource.getRepository(UnitOfMeasure).findOne({ where: { unitId: (dto as any).unitId, tenantId } as any });
      if (!second) throw new NotFoundException('Unit not found for this tenant.');
    }
    await this.repo.update(id, dto as any);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update(id, { isActive: false } as any);
    return this.findOne(id, tenantId);
  }
}
