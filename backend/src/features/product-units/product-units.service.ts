import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductUnit } from './product-units.entity';
import { CreateProductUnitDto } from './dto/create-product-units.dto';
import { UpdateProductUnitDto } from './dto/update-product-units.dto';

@Injectable()
export class ProductUnitService {
  constructor(@InjectRepository(ProductUnit) private readonly repo: Repository<ProductUnit>) {}
  findAll() { return this.repo.find({ order: { productUnitId: 'ASC' } }); }
  async findOne(id: number) {
    const row = await this.repo.findOneBy({ productUnitId: id } as any);
    if (!row) throw new NotFoundException('ProductUnit not found');
    return row;
  }
  async create(dto: CreateProductUnitDto) { return this.repo.save(this.repo.create(dto as any)); }
  async update(id: number, dto: UpdateProductUnitDto) { await this.findOne(id); await this.repo.update(id, dto as any); return this.findOne(id); }
  async deactivate(id: number) { await this.findOne(id); await this.repo.update(id, { isActive: false } as any); return this.findOne(id); }
}
