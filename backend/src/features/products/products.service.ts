import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './products.entity';
import { CreateProductDto } from './dto/create-products.dto';
import { UpdateProductDto } from './dto/update-products.dto';

@Injectable()
export class ProductService {
  constructor(@InjectRepository(Product) private readonly repo: Repository<Product>) {}

  findAll() {
    return this.repo.find({
      relations: { tenant: true, category: true, brand: true, baseUnit: true },
      order: { productId: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({
      where: { productId: id },
      relations: { tenant: true, category: true, brand: true, baseUnit: true, productUnits: { unit: true }, identifiers: { identifierType: true }, productLocations: { location: true }, productAttributes: { attribute: true }, productSuppliers: { supplier: true, purchaseUnit: true } },
    });
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  async create(dto: CreateProductDto) {
    const existing = await this.repo.findOneBy({ tenantId: dto.tenantId, sku: dto.sku });
    if (existing) throw new ConflictException('SKU already exists for this tenant');
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);
    await this.repo.update(id, dto as any);
    return this.findOne(id);
  }

  async deactivate(id: number) {
    await this.findOne(id);
    await this.repo.update(id, { isActive: false });
    return this.findOne(id);
  }
}
