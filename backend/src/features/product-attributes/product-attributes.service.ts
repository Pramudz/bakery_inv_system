import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductAttributes } from './product-attributes.entity';
import { CreateProductAttributesDto } from './dto/create-product-attributes.dto';
import { UpdateProductAttributesDto } from './dto/update-product-attributes.dto';
import { Product } from '../products/products.entity';
import { Attribute } from '../attributes/attributes.entity';

@Injectable()
export class ProductAttributesService {
  constructor(
    @InjectRepository(ProductAttributes) private readonly repo: Repository<ProductAttributes>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { product: { tenantId } } as any,
      order: { productAttributeId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productAttributeId: id, product: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('ProductAttributes not found');
    return row;
  }

  async create(dto: CreateProductAttributesDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(Product);
    const parent = await parentRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!parent) throw new NotFoundException('Product not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(Attribute);
    const second = await secondRepo.findOne({ where: { attributeId: (dto as any).attributeId, tenantId } as any });
    if (!second) throw new NotFoundException('Attribute not found for this tenant.');

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductAttributesDto, tenantId: number) {
    await this.findOne(id, tenantId);
    if ((dto as any).productId !== undefined) {
      const parent = await this.dataSource.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).attributeId !== undefined) {
      const second = await this.dataSource.getRepository(Attribute).findOne({ where: { attributeId: (dto as any).attributeId, tenantId } as any });
      if (!second) throw new NotFoundException('Attribute not found for this tenant.');
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
