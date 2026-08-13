import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductLocation } from './product-locations.entity';
import { CreateProductLocationDto } from './dto/create-product-locations.dto';
import { UpdateProductLocationDto } from './dto/update-product-locations.dto';
import { Product } from '../products/products.entity';
import { Location } from '../locations/locations.entity';

@Injectable()
export class ProductLocationService {
  constructor(
    @InjectRepository(ProductLocation) private readonly repo: Repository<ProductLocation>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { product: { tenantId } } as any,
      order: { productLocationId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productLocationId: id, product: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('ProductLocation not found');
    return row;
  }

  async create(dto: CreateProductLocationDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(Product);
    const parent = await parentRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!parent) throw new NotFoundException('Product not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(Location);
    const second = await secondRepo.findOne({ where: { locationId: (dto as any).locationId, tenantId } as any });
    if (!second) throw new NotFoundException('Location not found for this tenant.');

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductLocationDto, tenantId: number) {
    await this.findOne(id, tenantId);
    if ((dto as any).productId !== undefined) {
      const parent = await this.dataSource.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).locationId !== undefined) {
      const second = await this.dataSource.getRepository(Location).findOne({ where: { locationId: (dto as any).locationId, tenantId } as any });
      if (!second) throw new NotFoundException('Location not found for this tenant.');
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
