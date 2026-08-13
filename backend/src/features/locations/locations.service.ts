import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './locations.entity';
import { CreateLocationDto } from './dto/create-locations.dto';
import { UpdateLocationDto } from './dto/update-locations.dto';

@Injectable()
export class LocationService {
  constructor(@InjectRepository(Location) private readonly repo: Repository<Location>) {}
  findAll() { return this.repo.find({ order: { locationId: 'ASC' } }); }
  async findOne(id: number) {
    const row = await this.repo.findOneBy({ locationId: id } as any);
    if (!row) throw new NotFoundException('Location not found');
    return row;
  }
  async create(dto: CreateLocationDto) { return this.repo.save(this.repo.create(dto as any)); }
  async update(id: number, dto: UpdateLocationDto) { await this.findOne(id); await this.repo.update(id, dto as any); return this.findOne(id); }
  async deactivate(id: number) { await this.findOne(id); await this.repo.update(id, { isActive: false } as any); return this.findOne(id); }
}
