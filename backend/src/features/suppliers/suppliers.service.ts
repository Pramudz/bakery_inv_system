import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './suppliers.entity';
import { CreateSupplierDto } from './dto/create-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-suppliers.dto';

@Injectable()
export class SupplierService {
  constructor(@InjectRepository(Supplier) private readonly repo: Repository<Supplier>) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { supplierId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { supplierId: id, tenantId } as any,
    });
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  async create(dto: CreateSupplierDto, tenantId: number) {
    const payload: any = { ...dto, tenantId };
    const existing = await this.repo.findOne({
      where: {
        tenantId,
        supplierCode: (dto as any).supplierCode,
      } as any,
    });
    if (existing) throw new ConflictException('Code already exists for this tenant.');
    return this.repo.save(this.repo.create(payload));
  }

  async update(id: number, dto: UpdateSupplierDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const payload: any = { ...dto };
    delete payload.tenantId;
    if (payload.supplierCode) {
      const same = await this.repo.findOne({
        where: { tenantId, supplierCode: payload.supplierCode } as any,
      });
      if (same && (same as any).supplierId !== id) {
        throw new ConflictException('Code already exists for this tenant.');
      }
    }
    await this.repo.update({ supplierId: id, tenantId } as any, payload);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ supplierId: id, tenantId } as any, { isActive: false } as any);
    return this.findOne(id, tenantId);
  }
}
