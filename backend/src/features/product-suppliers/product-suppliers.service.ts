import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductSupplier } from './product-suppliers.entity';
import { CreateProductSupplierDto } from './dto/create-product-suppliers.dto';
import { UpdateProductSupplierDto } from './dto/update-product-suppliers.dto';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';

@Injectable()
export class ProductSupplierService {
  constructor(
    @InjectRepository(ProductSupplier) private readonly repo: Repository<ProductSupplier>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { product: { tenantId } } as any,
      order: { productSupplierId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productSupplierId: id, product: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('ProductSupplier not found');
    return row;
  }

  async create(dto: CreateProductSupplierDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(Product);
    const parent = await parentRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!parent) throw new NotFoundException('Product not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(Supplier);
    const second = await secondRepo.findOne({ where: { supplierId: (dto as any).supplierId, tenantId } as any });
    if (!second) throw new NotFoundException('Supplier not found for this tenant.');

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductSupplierDto, tenantId: number) {
    await this.findOne(id, tenantId);
    if ((dto as any).productId !== undefined) {
      const parent = await this.dataSource.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).supplierId !== undefined) {
      const second = await this.dataSource.getRepository(Supplier).findOne({ where: { supplierId: (dto as any).supplierId, tenantId } as any });
      if (!second) throw new NotFoundException('Supplier not found for this tenant.');
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
