import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitOfMeasure } from './units.entity';
import { CreateUnitOfMeasureDto } from './dto/create-units.dto';
import { UpdateUnitOfMeasureDto } from './dto/update-units.dto';

@Injectable()
export class UnitOfMeasureService {
  constructor(@InjectRepository(UnitOfMeasure) private readonly repo: Repository<UnitOfMeasure>) {}
  findAll() { return this.repo.find({ order: { unitId: 'ASC' } }); }
  async findOne(id: number) {
    const row = await this.repo.findOneBy({ unitId: id } as any);
    if (!row) throw new NotFoundException('UnitOfMeasure not found');
    return row;
  }
  async create(dto: CreateUnitOfMeasureDto) { return this.repo.save(this.repo.create(dto as any)); }
  async update(id: number, dto: UpdateUnitOfMeasureDto) { await this.findOne(id); await this.repo.update(id, dto as any); return this.findOne(id); }
  async deactivate(id: number) { await this.findOne(id); await this.repo.update(id, { isActive: false } as any); return this.findOne(id); }
}
