import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './products.entity';
import { CreateProductDto } from './dto/create-products.dto';
import { UpdateProductDto } from './dto/update-products.dto';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      relations: { tenant: true, category: true, brand: true, baseUnit: true },
      order: { productId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productId: id, tenantId },
      relations: {
        tenant: true,
        category: true,
        brand: true,
        baseUnit: true,
        productUnits: { unit: true },
        identifiers: { identifierType: true },
        productLocations: { location: true },
        productAttributes: { attribute: true },
        productSuppliers: { supplier: true, purchaseUnit: true },
      },
    });
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  private async validateReferences(dto: Partial<CreateProductDto>, tenantId: number) {
    if ((dto as any).categoryId === undefined && (dto as any).baseUnitId === undefined && (dto as any).brandId === undefined) return;

    if ((dto as any).categoryId !== undefined) {
      const category = await this.dataSource.getRepository(Category).findOne({
      where: { categoryId: (dto as any).categoryId, tenantId },
    });
      if (!category) throw new NotFoundException('Category not found for this tenant.');
    }

    if ((dto as any).baseUnitId !== undefined) {
      const unit = await this.dataSource.getRepository(UnitOfMeasure).findOne({
      where: { unitId: (dto as any).baseUnitId, tenantId },
    });
      if (!unit) throw new NotFoundException('Base unit not found for this tenant.');
    }

    if ((dto as any).brandId !== undefined && (dto as any).brandId !== null) {
      const brand = await this.dataSource.getRepository(Brand).findOne({
        where: { brandId: (dto as any).brandId, tenantId },
      });
      if (!brand) throw new NotFoundException('Brand not found for this tenant.');
    }
  }

  async create(dto: CreateProductDto, tenantId: number) {
    await this.validateReferences(dto, tenantId);
    const existing = await this.repo.findOneBy({ tenantId, sku: dto.sku });
    if (existing) throw new ConflictException('SKU already exists for this tenant');

    const payload: any = { ...dto, tenantId };
    delete payload.tenantId;
    return this.repo.save(this.repo.create({ ...payload, tenantId }));
  }

  async update(id: number, dto: UpdateProductDto, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.validateReferences(dto as any, tenantId);
    const payload: any = { ...dto };
    delete payload.tenantId;
    await this.repo.update({ productId: id, tenantId }, payload);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ productId: id, tenantId }, { isActive: false });
    return this.findOne(id, tenantId);
  }
}
