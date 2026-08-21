import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    return this.dataSource.transaction(async (manager) => {
      const productId = Number(dto.productId), supplierId = Number(dto.supplierId);
      if (!await manager.getRepository(Product).findOneBy({ productId, tenantId }))
        throw new NotFoundException('Product not found for this tenant.');
      if (!await manager.getRepository(Supplier).findOneBy({ supplierId, tenantId }))
        throw new NotFoundException('Supplier not found for this tenant.');
      const repository = manager.getRepository(ProductSupplier);
      const existing = await repository.findOneBy({ productId, supplierId });
      if (existing?.isActive) throw new ConflictException('Supplier is already assigned to this product.');
      const row = existing ?? repository.create({ productId, supplierId });
      const isActive = dto.isActive ?? true;
      Object.assign(row, dto, { productId, supplierId, isActive, isPrimarySupplier: isActive ? (dto.isPrimarySupplier ?? false) : false });
      if (isActive && dto.isPrimarySupplier)
        await repository.update({ productId, isActive: true }, { isPrimarySupplier: false });
      return repository.save(row);
    });
  }

  async update(id: number, dto: UpdateProductSupplierDto, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(ProductSupplier).findOne({ where: { productSupplierId: id, product: { tenantId } } as any });
      if (!current) throw new NotFoundException('ProductSupplier not found');
      const isActive = dto.isActive ?? current.isActive;
      if (!isActive && dto.isPrimarySupplier) throw new ConflictException('An inactive supplier cannot be primary.');
      if (dto.isPrimarySupplier && isActive)
        await manager.getRepository(ProductSupplier).update({ productId: current.productId, isActive: true }, { isPrimarySupplier: false });
      await manager.getRepository(ProductSupplier).update(id, { ...dto, isPrimarySupplier: isActive ? (dto.isPrimarySupplier ?? current.isPrimarySupplier) : false });
      return manager.getRepository(ProductSupplier).findOneByOrFail({ productSupplierId: id });
    });
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update(id, { isActive: false, isPrimarySupplier: false } as any);
    return this.findOne(id, tenantId);
  }
}
