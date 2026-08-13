import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './suppliers.entity';
import { CreateSupplierDto } from './dto/create-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-suppliers.dto';

@Injectable()
export class SupplierService {
  constructor(@InjectRepository(Supplier) private readonly repo: Repository<Supplier>) {}
  findAll() { return this.repo.find({ order: { supplierId: 'ASC' } }); }
  async findOne(id: number) {
    const row = await this.repo.findOneBy({ supplierId: id } as any);
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }
  async create(dto: CreateSupplierDto) { return this.repo.save(this.repo.create(dto as any)); }
  async update(id: number, dto: UpdateSupplierDto) { await this.findOne(id); await this.repo.update(id, dto as any); return this.findOne(id); }
  async deactivate(id: number) { await this.findOne(id); await this.repo.update(id, { isActive: false } as any); return this.findOne(id); }
}
