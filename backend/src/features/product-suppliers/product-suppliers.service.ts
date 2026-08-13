import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductSupplier } from './product-suppliers.entity';
import { CreateProductSupplierDto } from './dto/create-product-suppliers.dto';
import { UpdateProductSupplierDto } from './dto/update-product-suppliers.dto';

@Injectable()
export class ProductSupplierService {
  constructor(@InjectRepository(ProductSupplier) private readonly repo: Repository<ProductSupplier>) {}
  findAll() { return this.repo.find({ order: { productSupplierId: 'ASC' } }); }
  async findOne(id: number) {
    const row = await this.repo.findOneBy({ productSupplierId: id } as any);
    if (!row) throw new NotFoundException('ProductSupplier not found');
    return row;
  }
  async create(dto: CreateProductSupplierDto) { return this.repo.save(this.repo.create(dto as any)); }
  async update(id: number, dto: UpdateProductSupplierDto) { await this.findOne(id); await this.repo.update(id, dto as any); return this.findOne(id); }
  async deactivate(id: number) { await this.findOne(id); await this.repo.update(id, { isActive: false } as any); return this.findOne(id); }
}
