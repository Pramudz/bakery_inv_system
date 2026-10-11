import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdentifierType } from './identifier-types.entity';
import { CreateIdentifierTypeDto } from './dto/create-identifier-types.dto';
import { UpdateIdentifierTypeDto } from './dto/update-identifier-types.dto';
@Injectable()
export class IdentifierTypeService {
  private readonly systemCodes = new Set(['BARCODE', 'EAN', 'UPC', 'GTIN', 'PLU']);
  constructor(@InjectRepository(IdentifierType) private readonly repo:Repository<IdentifierType> ) {}
  findAll() { return this.repo.find({order:{identifierTypeId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({identifierTypeId:id} as any);
    if(!row) throw new NotFoundException('IdentifierType not found');
    return row;
  }
  async create(dto:CreateIdentifierTypeDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateIdentifierTypeDto) {
    const row = await this.findOne(id);
    if (this.systemCodes.has(row.code.trim().toUpperCase()) && dto.code !== undefined && dto.code !== row.code) {
      throw new ConflictException('System identifier type codes cannot be changed.');
    }
    await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    const row = await this.findOne(id);
    if (this.systemCodes.has(row.code.trim().toUpperCase())) throw new ConflictException('System identifier types cannot be deactivated.');
    await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
