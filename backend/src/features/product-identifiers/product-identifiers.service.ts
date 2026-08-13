import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductIdentifier } from './product-identifiers.entity';
import { CreateProductIdentifierDto } from './dto/create-product-identifiers.dto';
import { UpdateProductIdentifierDto } from './dto/update-product-identifiers.dto';
import { Product } from '../products/products.entity';
import { IdentifierType } from '../identifier-types/identifier-types.entity';

@Injectable()
export class ProductIdentifierService {
  constructor(
    @InjectRepository(ProductIdentifier) private readonly repo: Repository<ProductIdentifier>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { product: { tenantId } } as any,
      order: { productIdentifierId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productIdentifierId: id, product: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('ProductIdentifier not found');
    return row;
  }

  async create(dto: CreateProductIdentifierDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(Product);
    const parent = await parentRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!parent) throw new NotFoundException('Product not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(IdentifierType);
    const second = await secondRepo.findOne({ where: { identifierTypeId: (dto as any).identifierTypeId } as any });
    if (!second) throw new NotFoundException('Identifier type not found.');

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductIdentifierDto, tenantId: number) {
    await this.findOne(id, tenantId);
    if ((dto as any).productId !== undefined) {
      const parent = await this.dataSource.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).identifierTypeId !== undefined) {
      const second = await this.dataSource.getRepository(IdentifierType).findOne({ where: { identifierTypeId: (dto as any).identifierTypeId } as any });
      if (!second) throw new NotFoundException('Identifier type not found.');
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
