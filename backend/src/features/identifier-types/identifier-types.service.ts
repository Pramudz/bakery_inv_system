import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdentifierType } from './identifier-types.entity';
import { CreateIdentifierTypeDto } from './dto/create-identifier-types.dto';
import { UpdateIdentifierTypeDto } from './dto/update-identifier-types.dto';
@Injectable()
export class IdentifierTypeService {
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
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
